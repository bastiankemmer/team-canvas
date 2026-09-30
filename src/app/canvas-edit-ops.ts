import type { CanvasStore } from "../ports/canvas-store.js";
import {
  addOrientedSibling,
  applySlotFills,
  inspectSourceOrientation,
  slotIdsFromSource,
  type OrientSlot,
  type OrientationInfo,
} from "./canvas-orientation.js";

export type SearchHit = { line: number; snippet: string };

export type { OrientationInfo, OrientSlot };

export type CanvasEditOps = {
  listCanvases(): Promise<string[]>;
  readSource(id: string): Promise<string>;
  writeSource(id: string, source: string): Promise<void>;
  searchSource(id: string, query: string): Promise<SearchHit[]>;
  inspectOrientation(id: string): Promise<OrientationInfo>;
  addOriented(id: string): Promise<{ slots: OrientSlot[] }>;
  fillSlots(id: string, slots: Record<string, string>): Promise<void>;
};

/** Shared read/write/search/orient over CanvasStore — HTTP and MCP call only this. */
export function createCanvasEditOps(store: CanvasStore): CanvasEditOps {
  return {
    listCanvases: () => store.list(),
    readSource: (id) => store.readSource(id),
    writeSource: (id, source) => store.writeSource(id, source),
    async searchSource(id, query) {
      if (!query) {
        throw new Error("Search query must be non-empty");
      }
      const source = await store.readSource(id);
      const hits: SearchHit[] = [];
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes(query)) {
          hits.push({ line: i + 1, snippet: lines[i]! });
        }
      }
      return hits;
    },
    async inspectOrientation(id) {
      const source = await store.readSource(id);
      return inspectSourceOrientation(source);
    },
    async addOriented(id) {
      const source = await store.readSource(id);
      const { source: next, slots } = addOrientedSibling(source);
      await store.writeSource(id, next);
      return { slots };
    },
    async fillSlots(id, slots) {
      const source = await store.readSource(id);
      // Tokens in source are known (survive HTTP↔MCP handoff / process restart).
      const known = slotIdsFromSource(source);
      const next = applySlotFills(source, slots, known);
      await store.writeSource(id, next);
      // Leftover `__tc_slot_*__` tokens remain fillable; no process-wide expire.
    },
  };
}
