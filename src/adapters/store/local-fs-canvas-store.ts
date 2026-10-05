import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanvasStore } from "../../ports/canvas-store.js";

const CANVAS_SUFFIX = ".canvas.tsx";
const STATE_SUFFIX = ".canvas.data.json";

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
  };
}
