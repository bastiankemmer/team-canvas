import type { CanvasStore } from "../../ports/canvas-store.js";
import {
  addOrientedSibling,
  applySlotFills,
  inspectSourceOrientation,
  pendingSlots,
  slotIdsFromSource,
  type OrientSlot,
  type OrientationInfo,
} from "./canvas-orientation.js";
import { bundleCanvas } from "../build/bundle-canvas.js";
import { extractCanvasLinks } from "./canvas-links.js";
import { assertNewCanvasId, starterSource } from "./new-canvas.js";

export type SearchHit = { line: number; snippet: string };

/** One outgoing CanvasLink, in source order. */
export type CanvasLinkRef = {
  to: string;
  line: number;
  label: string | null;
  exists: boolean;
};

/** One incoming CanvasLink. `from` is the canvas that contains the tag. */
export type CanvasBacklink = {
  from: string;
  line: number;
  label: string | null;
};

export type LinkedSearchHit = { id: string; line: number; snippet: string };

export type { OrientationInfo, OrientSlot };

/** Same reply for add and fill, over HTTP and MCP: slots still blank afterwards. */
export type SlotsResult = { ok: true; id: string; slots: OrientSlot[] };

/** Reply for create: same `{ ok, id }` over HTTP and MCP. */
export type CreateResult = { ok: true; id: string };

/** Reply for replace: same `{ ok, id, replacements }` over HTTP and MCP. */
export type ReplaceResult = { ok: true; id: string; replacements: number };

/** Same reply for check, over HTTP and MCP: does the canvas still bundle? */
export type CheckResult =
  | { ok: true; id: string }
  | { ok: false; id: string; error: string };

export type CanvasEditOps = {
  listCanvases(): Promise<string[]>;
  /** New canvas from `source`, or a starter file. Refuses an id that already exists. */
  createCanvas(id: string, source?: string): Promise<CreateResult>;
  readSource(id: string): Promise<string>;
  writeSource(id: string, source: string): Promise<void>;
  /** Replace exact text in place; the rest of the file stays byte-identical. */
  replaceInSource(
    id: string,
    oldText: string,
    newText: string,
    replaceAll?: boolean,
  ): Promise<ReplaceResult>;
  /** Bundle the canvas and report errors (`line:col message`) instead of throwing. */
  checkCanvas(id: string): Promise<CheckResult>;
  searchSource(id: string, query: string): Promise<SearchHit[]>;
  /** Outgoing CanvasLink tags in this canvas, source order. */
  listLinks(id: string): Promise<CanvasLinkRef[]>;
  /** Canvases that link to `id`, in store.list() order then source order. */
  backlinks(id: string): Promise<CanvasBacklink[]>;
  /** Substring search of direct outgoing canvases, one hop. */
  searchLinked(id: string, query: string): Promise<LinkedSearchHit[]>;
  inspectOrientation(id: string): Promise<OrientationInfo>;
  addOriented(id: string): Promise<SlotsResult>;
  fillSlots(id: string, slots: Record<string, string>): Promise<SlotsResult>;
};

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/** Shared read/write/search/orient over CanvasStore — HTTP and MCP call only this. */
export function createCanvasEditOps(store: CanvasStore): CanvasEditOps {
  return {
    listCanvases: () => store.list(),
    async createCanvas(id, source) {
      assertNewCanvasId(id);
      // ponytail: list-then-write can race with a parallel create of the same id;
      // fix with an exclusive-create (`wx`) on the store port if that ever matters.
      if ((await store.list()).includes(id)) {
        throw new Error(`Canvas "${id}" already exists`);
      }
      await store.writeSource(id, source?.trim() ? source : starterSource(id));
      return { ok: true, id };
    },
    readSource: (id) => store.readSource(id),
    writeSource: (id, source) => store.writeSource(id, source),
    async checkCanvas(id) {
      const result = await bundleCanvas({ source: await store.readSource(id) });
      return result.ok ? { ok: true, id } : { ok: false, id, error: result.error };
    },
    async replaceInSource(id, oldText, newText, replaceAll = false) {
      if (!oldText) {
        throw new Error("old_string must be non-empty");
      }
      const source = await store.readSource(id);
      // split/join: literal text, so "$&" and friends in newText are not special.
      const parts = source.split(oldText);
      const replacements = parts.length - 1;
      if (replacements === 0) {
        throw new Error(`Text to replace was not found in canvas "${id}"`);
      }
      if (replacements > 1 && !replaceAll) {
        throw new Error(
          `Text to replace matches ${replacements} places in canvas "${id}"; add surrounding text to make it unique, or set replace_all`,
        );
      }
      await store.writeSource(id, parts.join(newText));
      return { ok: true, id, replacements };
    },
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
    async listLinks(id) {
      const source = await store.readSource(id);
      const ids = new Set(await store.list());
      return extractCanvasLinks(source).map((link) => ({
        ...link,
        exists: ids.has(link.to),
      }));
    },
    async backlinks(id) {
      await store.readSource(id);
      const ids = await store.list();
      const hits: CanvasBacklink[] = [];
      // ponytail: one full read of every canvas per call. Ceiling is store size.
      // Upgrade path: an index written beside the store, only if this scan shows up in real use.
      for (const from of ids) {
        let source: string;
        try {
          source = await store.readSource(from);
        } catch (err) {
          if (isEnoent(err)) continue;
          throw err;
        }
        for (const link of extractCanvasLinks(source)) {
          if (link.to === id) hits.push({ from, line: link.line, label: link.label });
        }
      }
      return hits;
    },
    async searchLinked(id, query) {
      if (!query) {
        throw new Error("Search query must be non-empty");
      }
      const hits: LinkedSearchHit[] = [];
      const seen = new Set<string>();
      for (const link of await this.listLinks(id)) {
        if (link.to === id || !link.exists || seen.has(link.to)) continue;
        seen.add(link.to);
        let found: SearchHit[];
        try {
          found = await this.searchSource(link.to, query);
        } catch (err) {
          if (isEnoent(err)) continue;
          throw err;
        }
        for (const hit of found) hits.push({ id: link.to, ...hit });
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
      return { ok: true, id, slots };
    },
    async fillSlots(id, slots) {
      const source = await store.readSource(id);
      // Tokens in source are known (survive HTTP↔MCP handoff / process restart).
      const known = slotIdsFromSource(source);
      const next = applySlotFills(source, slots, known);
      await store.writeSource(id, next);
      // Leftover `__tc_slot_*__` tokens remain fillable; no process-wide expire.
      return { ok: true, id, slots: pendingSlots(next) };
    },
  };
}
