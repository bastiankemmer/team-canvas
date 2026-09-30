/** Filesystem protocol: list/read/write canvas sources and sidecar state. */
export type CanvasStore = {
  list(): Promise<string[]>;
  readSource(id: string): Promise<string>;
  writeSource(id: string, source: string): Promise<void>;
  readState(id: string): Promise<unknown>;
  writeState(id: string, state: unknown): Promise<void>;
};
