import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanvasStore } from "../../ports/canvas-store.js";

const CANVAS_SUFFIX = ".canvas.tsx";
const STATE_SUFFIX = ".canvas.data.json";

/** Reject path separators / .. so id cannot escape the store root. */
export function assertSafeCanvasId(id: string): void {
  if (
    !id ||
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\") ||
    path.isAbsolute(id)
  ) {
    throw new Error(
      `Invalid canvas id "${id}": must be a single path segment (no separators or ..)`,
    );
  }
}

export function LocalFilesystemCanvasStore(root: string): CanvasStore {
  const resolveSource = (id: string) => {
    assertSafeCanvasId(id);
    return path.join(root, `${id}${CANVAS_SUFFIX}`);
  };
  const resolveState = (id: string) => {
    assertSafeCanvasId(id);
    return path.join(root, `${id}${STATE_SUFFIX}`);
  };

  return {
    async list() {
      const names = await readdir(root);
      return names
        .filter((n) => n.endsWith(CANVAS_SUFFIX))
        .map((n) => n.slice(0, -CANVAS_SUFFIX.length));
    },

    async readSource(id) {
      return readFile(resolveSource(id), "utf8");
    },

    async writeSource(id, source) {
      await writeFile(resolveSource(id), source, "utf8");
    },

    async readState(id) {
      const raw = await readFile(resolveState(id), "utf8");
      return JSON.parse(raw) as unknown;
    },

    async writeState(id, state) {
      await writeFile(resolveState(id), JSON.stringify(state), "utf8");
    },
  };
}
