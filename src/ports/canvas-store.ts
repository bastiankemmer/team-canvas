/** Filesystem protocol: list/read/write canvas sources and sidecar state. */
export type CanvasStore = {
  list(): Promise<string[]>;
  readSource(id: string): Promise<string>;
  writeSource(id: string, source: string): Promise<void>;
  readState(id: string): Promise<unknown>;
  writeState(id: string, state: unknown): Promise<void>;
  /**
   * Atomic read-modify-write of sidecar state, safe across processes (several
   * agents run their own MCP process on one store). `current` is `undefined`
   * when no state exists yet. The file lock is held until `update` settles,
   * including when it returns a promise. Optional: without it the settlement
   * log falls back to a plain read then write, which can lose an update when
   * two agents write at the same moment.
   */
  updateState?(
    id: string,
    update: (current: unknown) => unknown | Promise<unknown>,
  ): Promise<void>;
  /** `canvas` is `id.canvas.tsx`, `dir` is a folder, `both` is a canvas file and a folder of the same name. */
  pathKind?(id: string): Promise<"canvas" | "dir" | "both" | "none">;
  /** Rename one canvas file and its state sidecar. Fails if `toId` already exists. */
  moveCanvas?(fromId: string, toId: string): Promise<void>;
  /** Rename a directory onto `to`. Fails if `to` already exists. */
  moveDir?(from: string, to: string): Promise<void>;
};
