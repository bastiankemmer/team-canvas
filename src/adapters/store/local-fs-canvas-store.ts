import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { lstat, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CanvasStore } from "../../ports/canvas-store.js";

const CANVAS_SUFFIX = ".canvas.tsx";
const STATE_SUFFIX = ".canvas.data.json";
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 10_000;

/**
 * Cross-process mutex: create `lock` exclusively, remove it when done.
 * ponytail: a lock older than LOCK_STALE_MS is taken as left by a crashed process
 * and removed; waiters poll until that age. Two waiters can race on that removal.
 * Upgrade: flock via a native module.
 */
async function withFileLock<T>(lock: string, fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      await (await open(lock, "wx")).close();
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
      const held = await stat(lock).catch(() => null);
      if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS) {
        await rm(lock, { force: true });
        continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lock, { force: true });
  }
}

function isEnoent(err: unknown): boolean {
  return (err as { code?: string }).code === "ENOENT";
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

async function fileExists(target: string): Promise<boolean> {
  try {
    return (await lstat(target)).isFile();
  } catch (err) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

/** POSIX rename overwrites. A placeholder created with `wx` makes that fail closed. */
async function exclusiveRename(from: string, to: string): Promise<void> {
  const handle = await open(to, "wx");
  await handle.close();
  try {
    await rename(from, to);
  } catch (err) {
    await rm(to, { force: true });
    throw err;
  }
}

function invalidCanvasId(id: string): never {
  throw new Error(
    `Invalid canvas id "${id}": must be a relative path of non-empty segments`,
  );
}

/** `/` separates segments. `..`, `\`, empty segments, and absolute ids stay illegal. */
export function assertSafeCanvasId(id: string): void {
  if (!id || id.includes("..") || id.includes("\\") || path.isAbsolute(id)) {
    invalidCanvasId(id);
  }
  for (const segment of id.split("/")) {
    if (segment === "" || segment === "." || segment === "..") invalidCanvasId(id);
  }
}

function outsideRoot(fromRoot: string): boolean {
  return (
    fromRoot !== "" &&
    (path.isAbsolute(fromRoot) ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${path.sep}`))
  );
}

/**
 * realpath(root) and the deepest existing ancestor.
 * path.relative, not a string prefix, so /var vs /private/var stays inside.
 */
function assertInsideStore(root: string, id: string, target: string): void {
  const rootReal = realpathSync(root);
  let cursor = root;
  let existing = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    if (!part || part === ".") continue;
    cursor = path.join(cursor, part);
    try {
      // Stop on a link so realpath (below) sees the target, not the parent.
      // ponytail: in-store links are followed. Ceiling: write-through to an in-store target. Upgrade: reject every symlink here.
      if (lstatSync(cursor).isSymbolicLink()) {
        existing = cursor;
        break;
      }
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") break;
      throw err;
    }
    existing = cursor;
  }
  if (outsideRoot(path.relative(rootReal, realpathSync(existing)))) invalidCanvasId(id);
}

export function LocalFilesystemCanvasStore(root: string): CanvasStore {
  const resolve = (id: string, suffix: string) => {
    assertSafeCanvasId(id);
    const target = path.join(root, `${id}${suffix}`);
    assertInsideStore(root, id, target);
    return target;
  };

  return {
    async list() {
      const ids: string[] = [];
      const walk = async (dir: string, prefix: string): Promise<void> => {
        for (const ent of await readdir(dir, { withFileTypes: true })) {
          if (ent.isSymbolicLink()) continue;
          const full = path.join(dir, ent.name);
          const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
          // stat follows links, so the symlink skip above is what keeps them out of the list.
          const info = await stat(full);
          if (info.isDirectory()) await walk(full, rel);
          else if (info.isFile() && ent.name.endsWith(CANVAS_SUFFIX)) {
            ids.push(rel.slice(0, -CANVAS_SUFFIX.length));
          }
        }
      };
      await walk(root, "");
      return ids;
    },

    async readSource(id) {
      return readFile(resolve(id, CANVAS_SUFFIX), "utf8");
    },

    async writeSource(id, source) {
      const file = resolve(id, CANVAS_SUFFIX);
      mkdirSync(path.dirname(file), { recursive: true });
      await writeFile(file, source, "utf8");
    },

    async readState(id) {
      const raw = await readFile(resolve(id, STATE_SUFFIX), "utf8");
      return JSON.parse(raw) as unknown;
    },

    async writeState(id, state) {
      const file = resolve(id, STATE_SUFFIX);
      mkdirSync(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(state), "utf8");
    },

    async updateState(id, update) {
      const file = resolve(id, STATE_SUFFIX);
      mkdirSync(path.dirname(file), { recursive: true });
      await withFileLock(`${file}.lock`, async () => {
        let current: unknown;
        try {
          current = JSON.parse(await readFile(file, "utf8")) as unknown;
        } catch (err) {
          if ((err as { code?: string }).code !== "ENOENT") throw err;
        }
        // Temp file then rename: unlocked readers never see half a file.
        // Await so a caller can write canvas source before this lock drops.
        const next = await update(current);
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(next), "utf8");
        await rename(tmp, file);
      });
    },

    async pathKind(id) {
      const file = resolve(id, CANVAS_SUFFIX);
      const dir = resolve(id, "");
      const canvas = await fileExists(file);
      let directory = false;
      try {
        const info = await lstat(dir);
        directory = info.isDirectory() && !info.isSymbolicLink();
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
      if (canvas && directory) return "both";
      if (canvas) return "canvas";
      if (directory) return "dir";
      return "none";
    },

    async moveCanvas(fromId, toId) {
      if (fromId === toId) throw new Error(`"${fromId}" is already at "${toId}"`);
      const fromFile = resolve(fromId, CANVAS_SUFFIX);
      const toFile = resolve(toId, CANVAS_SUFFIX);
      if (!(await fileExists(fromFile))) throw new Error(`Canvas "${fromId}" does not exist`);
      const toState = resolve(toId, STATE_SUFFIX);
      if ((await fileExists(toFile)) || (await fileExists(toState))) {
        throw new Error(`Canvas "${toId}" already exists`);
      }
      mkdirSync(path.dirname(toFile), { recursive: true });
      await exclusiveRename(fromFile, toFile);
      const fromState = resolve(fromId, STATE_SUFFIX);
      if (await fileExists(fromState)) {
        try {
          mkdirSync(path.dirname(toState), { recursive: true });
          await exclusiveRename(fromState, toState);
        } catch (err) {
          await exclusiveRename(toFile, fromFile).catch(() => {});
          throw err;
        }
      }
      await pruneEmptyParents(root, fromId);
    },

    async moveDir(from, to) {
      if (from === to || to.startsWith(`${from}/`)) {
        throw new Error(`Cannot move folder "${from}" into itself`);
      }
      const fromDir = resolve(from, "");
      const toDir = resolve(to, "");
      const info = await lstatOrNull(fromDir);
      if (!info?.isDirectory()) {
        throw new Error(info ? `"${from}" is not a folder` : `Folder "${from}" does not exist`);
      }
      if (await lstatOrNull(toDir)) throw new Error(`"${to}" already exists`);
      mkdirSync(path.dirname(toDir), { recursive: true });
      await rename(fromDir, toDir);
    },
  };
}

/** Remove emptied parents of a moved canvas, stopping at the store root. */
async function pruneEmptyParents(root: string, fromId: string): Promise<void> {
  let dir = path.dirname(path.join(root, `${fromId}${CANVAS_SUFFIX}`));
  const rootReal = realpathSync(root);
  for (;;) {
    let here: string;
    try {
      here = realpathSync(dir);
    } catch (err) {
      if (isEnoent(err)) return;
      throw err;
    }
    if (outsideRoot(path.relative(rootReal, here)) || path.relative(rootReal, here) === "") return;
    const ents = await readdir(dir);
    if (ents.length > 0) return;
    await rm(dir);
    dir = path.dirname(dir);
  }
}
