import { assertCanvasPath, assertNewCanvasId } from "./new-canvas.js";

export type MovePair = { from: string; to: string };
export type MoveMode = "canvas" | "dir" | "matched";
export type PathKind = "canvas" | "dir" | "both" | "none";

const GLOB = /^[A-Za-z0-9._*-]+$/;

/** Filename glob. `*` is the only wildcard and does not match `/`. */
export function filenameGlob(pattern: string, filename: string): boolean {
  if (!GLOB.test(pattern)) {
    throw new Error(
      `Invalid match "${pattern}": filename glob, * is the only wildcard (*.canvas.tsx or *Test.canvas.tsx)`,
    );
  }
  const source = `^${pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*")}$`;
  return new RegExp(source).test(filename);
}

function canvasFilename(id: string): string {
  const slash = id.lastIndexOf("/");
  return `${slash === -1 ? id : id.slice(slash + 1)}.canvas.tsx`;
}

/**
 * `matched` filters a folder by filename glob. `dir` moves the whole folder.
 * A canvas file and a folder can share a name: without `folder` or `match`, the file wins.
 */
export function moveMode(
  from: string,
  kind: PathKind,
  opts: { folder?: boolean; match?: string } = {},
): MoveMode {
  if (opts.match === "") throw new Error("match must be non-empty");
  if (kind === "none") throw new Error(`Nothing at "${from}"`);
  const wantFolder = opts.folder === true || opts.match !== undefined;
  if (wantFolder && kind === "canvas") throw new Error(`"${from}" is not a folder`);
  if (wantFolder || kind === "dir") return opts.match !== undefined ? "matched" : "dir";
  return "canvas";
}

function rejectNested(from: string, to: string, mode: MoveMode): void {
  if (from === to) throw new Error(`"${from}" is already at "${to}"`);
  if (mode !== "canvas" && to.startsWith(`${from}/`)) {
    throw new Error(`Cannot move folder "${from}" into itself`);
  }
}

function claimDest(existing: ReadonlySet<string>, seen: Set<string>, dest: string): void {
  assertNewCanvasId(dest);
  if (existing.has(dest) || seen.has(dest)) throw new Error(`Canvas "${dest}" already exists`);
  seen.add(dest);
}

function planFolder(
  ids: readonly string[],
  from: string,
  to: string,
  match: string | undefined,
): MovePair[] {
  const prefix = `${from}/`;
  let inside = ids.filter((id) => id.startsWith(prefix)).sort();
  if (match !== undefined) {
    inside = inside.filter((id) => filenameGlob(match, canvasFilename(id)));
    if (inside.length === 0) throw new Error(`No canvases under "${from}" match "${match}"`);
  }
  const existing = new Set(ids);
  const seen = new Set<string>();
  return inside.map((id) => {
    const dest = `${to}${id.slice(from.length)}`;
    claimDest(existing, seen, dest);
    return { from: id, to: dest };
  });
}

/**
 * Which canvases move, and to where. A folder move with no canvases returns [].
 * Does not touch the filesystem.
 */
export function planMoves(
  ids: readonly string[],
  from: string,
  to: string,
  mode: MoveMode,
  match?: string,
): MovePair[] {
  assertCanvasPath(from);
  assertCanvasPath(to);
  rejectNested(from, to, mode);
  if (mode === "canvas") {
    if (!ids.includes(from)) throw new Error(`Canvas "${from}" does not exist`);
    claimDest(new Set(ids), new Set(), to);
    return [{ from, to }];
  }
  return planFolder(ids, from, to, mode === "matched" ? match : undefined);
}
