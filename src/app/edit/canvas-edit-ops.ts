import type { CanvasStore } from "../../ports/canvas-store.js";
import { assertSafeCanvasId } from "../../adapters/store/local-fs-canvas-store.js";
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
import { moveMode, planMoves, type MoveMode, type MovePair } from "./move-canvas.js";
import { assertNewCanvasId, starterSource } from "./new-canvas.js";
import {
  createSettlement,
  normalizeMeta,
  readSourceOrNull,
  type NormalizedMeta,
  type Settlement,
  type WriteMeta,
} from "../settle/settlement.js";

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

/** Reply for move: each canvas that changed id. An empty folder move is `moved: []`. */
export type MoveResult = { ok: true; moved: MovePair[] };

/** Reply for replace: same `{ ok, id, replacements }` over HTTP and MCP. */
export type ReplaceResult = { ok: true; id: string; replacements: number };

/** One exact replacement. `replace_all` replaces every match; otherwise the text must be unique. */
export type ReplaceEdit = {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

/** Same reply for check, over HTTP and MCP: does the canvas still bundle? */
export type CheckResult =
  | { ok: true; id: string }
  | { ok: false; id: string; error: string };

/** One id from a batch read: the file text, or why that id failed. */
export type SourceRead = { source: string } | { error: string };

/** Batch read. A missing id stays on that key so the other sources still return. */
export type ReadSourcesResult = { sources: Record<string, SourceRead> };

export type ListCanvasesOptions = {
  folder?: string;
  type?: "canvas" | "folder";
  depth?: number;
};

export type CanvasEditOps = {
  /** Change log, intents, topics and rollback shared by every write below. */
  settlement: Settlement;
  listCanvases(opts?: ListCanvasesOptions): Promise<string[]>;
  /** New canvas from `source`, or a starter file. Refuses an id that already exists. */
  createCanvas(id: string, source?: string, meta?: WriteMeta): Promise<CreateResult>;
  readSource(id: string): Promise<string>;
  /** Several ids in one call. Failures stay on their id; they do not drop the rest. */
  readSources(ids: string[]): Promise<ReadSourcesResult>;
  /** Every write takes optional `meta` (who, why, topic) for the change log. */
  writeSource(id: string, source: string, meta?: WriteMeta): Promise<void>;
  /**
   * Replace exact text in place; the rest of the file stays byte-identical.
   * One old/new pair, or several edits in order, then a single write.
   */
  replaceInSource(
    id: string,
    oldText: string,
    newText: string,
    replaceAll?: boolean,
    meta?: WriteMeta,
  ): Promise<ReplaceResult>;
  replaceInSource(
    id: string,
    edits: readonly ReplaceEdit[],
    meta?: WriteMeta,
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
  addOriented(id: string, meta?: WriteMeta): Promise<SlotsResult>;
  fillSlots(id: string, slots: Record<string, string>, meta?: WriteMeta): Promise<SlotsResult>;
  /**
   * Rename a canvas, or a folder of canvases. `folder: true` moves the directory.
   * `match` is a filename glob and moves only those canvases inside the folder.
   * If `from` is only a folder, it is moved as a folder even without the flag.
   */
  move(
    from: string,
    to: string,
    opts?: { folder?: boolean; match?: string },
    meta?: WriteMeta,
  ): Promise<MoveResult>;
};

function requireMover(store: CanvasStore): {
  pathKind: NonNullable<CanvasStore["pathKind"]>;
  moveCanvas: NonNullable<CanvasStore["moveCanvas"]>;
  moveDir: NonNullable<CanvasStore["moveDir"]>;
} {
  const { pathKind, moveCanvas, moveDir } = store;
  if (pathKind && moveCanvas && moveDir) return { pathKind, moveCanvas, moveDir };
  throw new Error("This store cannot move canvases");
}

async function readMoved(
  pairs: readonly MovePair[],
  readSource: (id: string) => Promise<string>,
): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const pair of pairs) sources.set(pair.from, await readSource(pair.from));
  return sources;
}

async function commitMoved(
  mode: MoveMode,
  from: string,
  to: string,
  pairs: readonly MovePair[],
  io: {
    moveDir: (from: string, to: string) => Promise<void>;
    moveCanvas: (from: string, to: string) => Promise<void>;
  },
): Promise<void> {
  if (mode === "dir") {
    await io.moveDir(from, to);
    return;
  }
  for (const pair of pairs) await io.moveCanvas(pair.from, pair.to);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function parseListPrefix(folder = ""): string {
  if (folder !== "") assertSafeCanvasId(folder);
  return folder === "" ? "" : `${folder}/`;
}

function parseListType(type = "canvas"): "canvas" | "folder" {
  if (type !== "canvas" && type !== "folder") {
    throw new Error('type must be "canvas" or "folder"');
  }
  return type;
}

function parseListDepth(depth = Infinity): number {
  if (depth !== Infinity && (!Number.isInteger(depth) || depth < 1)) {
    throw new Error("depth must be a positive integer");
  }
  return depth;
}

function listFolders(scoped: readonly string[], prefix: string, maxDepth: number): string[] {
  const folders = new Set<string>();
  for (const id of scoped) {
    const parts = id.slice(prefix.length).split("/").slice(0, -1);
    const limit = Math.min(parts.length, maxDepth);
    for (let i = 1; i <= limit; i++) {
      folders.add(`${prefix}${parts.slice(0, i).join("/")}`);
    }
  }
  return [...folders].sort();
}

export type EditOpsOptions = {
  /**
   * Every write must name an `actor` that holds the canvas lease (default true).
   * Turn off only for single-process embedding where nothing else writes.
   */
  requireLease?: boolean;
};

function applySourceEdit(
  source: string,
  id: string,
  edit: ReplaceEdit,
): { next: string; replacements: number } {
  if (!edit.old_string) {
    throw new Error("old_string must be non-empty");
  }
  // split/join: literal text, so "$&" and friends in new_string are not special.
  const parts = source.split(edit.old_string);
  const replacements = parts.length - 1;
  if (replacements === 0) {
    throw new Error(`Text to replace was not found in canvas "${id}"`);
  }
  if (replacements > 1 && edit.replace_all !== true) {
    throw new Error(
      `Text to replace matches ${replacements} places in canvas "${id}"; add surrounding text to make it unique, or set replace_all`,
    );
  }
  return { next: parts.join(edit.new_string), replacements };
}

/** Shared read/write/search/orient over CanvasStore — HTTP and MCP call only this. */
export function createCanvasEditOps(
  store: CanvasStore,
  { requireLease = true }: EditOpsOptions = {},
): CanvasEditOps {
  const settlement = createSettlement(store);

  /** First step of every write: validate who/why/topic and, unless leases are off, check the lease. */
  async function guard(id: string, meta: WriteMeta | undefined): Promise<NormalizedMeta> {
    const normalized = normalizeMeta(meta);
    if (requireLease) await settlement.assertLease(id, meta?.actor);
    return normalized;
  }

  /** Write, then log who/why. A failing log never fails (or undoes) a write that landed. */
  async function write(
    id: string,
    tool: string,
    next: string,
    normalized: NormalizedMeta,
    known?: string | null,
  ): Promise<void> {
    const before = known === undefined ? await readSourceOrNull(store, id) : known;
    await store.writeSource(id, next);
    try {
      await settlement.recordWrite({ canvas: id, tool, before, after: next }, normalized);
    } catch (err) {
      console.error("[team-canvas] change log:", err instanceof Error ? err.message : err);
    }
  }

  // Explicit union so the single old/new call (HTTP) and the edits call both typecheck.
  async function replaceInSource(
    id: string,
    oldTextOrEdits: string | readonly ReplaceEdit[],
    newTextOrMeta?: string | WriteMeta,
    replaceAll?: boolean,
    meta?: WriteMeta,
  ): Promise<ReplaceResult> {
    const batch = Array.isArray(oldTextOrEdits);
    const edits: readonly ReplaceEdit[] = batch
      ? oldTextOrEdits
      : [
          {
            old_string: oldTextOrEdits,
            new_string: newTextOrMeta as string,
            replace_all: replaceAll === true,
          },
        ];
    const writeMeta = batch ? (newTextOrMeta as WriteMeta | undefined) : meta;
    const normalized = await guard(id, writeMeta);
    if (edits.length === 0) {
      throw new Error("edits must be a non-empty list");
    }
    const source = await store.readSource(id);
    // In memory first: a later miss throws before write, so earlier edits are not stored.
    let next = source;
    let replacements = 0;
    for (const edit of edits) {
      const applied = applySourceEdit(next, id, edit);
      next = applied.next;
      replacements += applied.replacements;
    }
    await write(id, "replace_in_source", next, normalized, source);
    return { ok: true, id, replacements };
  }

  return {
    settlement,
    async listCanvases(opts = {}) {
      const prefix = parseListPrefix(opts.folder);
      const type = parseListType(opts.type);
      const maxDepth = parseListDepth(opts.depth);
      const scoped = (await store.list()).filter((id) => id.startsWith(prefix));
      if (type === "folder") return listFolders(scoped, prefix, maxDepth);
      return scoped.filter((id) => id.slice(prefix.length).split("/").length <= maxDepth);
    },
    async createCanvas(id, source, meta) {
      assertNewCanvasId(id);
      const normalized = await guard(id, meta);
      // ponytail: list-then-write can race with a parallel create of the same id;
      // fix with an exclusive-create (`wx`) on the store port if that ever matters.
      if ((await store.list()).includes(id)) {
        throw new Error(`Canvas "${id}" already exists`);
      }
      await write(id, "create_canvas", source?.trim() ? source : starterSource(id), normalized, null);
      return { ok: true, id };
    },
    readSource: (id) => store.readSource(id),
    async readSources(ids) {
      // Null prototype: the legal id "__proto__" must stay an own entry, or JSON drops it.
      const sources: Record<string, SourceRead> = Object.create(null);
      for (const id of ids) {
        try {
          sources[id] = { source: await store.readSource(id) };
        } catch (err) {
          // Per id: one missing or unsafe id must not throw away the sources already read.
          sources[id] = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      return { sources };
    },
    async writeSource(id, source, meta) {
      await write(id, "write_source", source, await guard(id, meta));
    },
    async checkCanvas(id) {
      const result = await bundleCanvas({ source: await store.readSource(id) });
      return result.ok ? { ok: true, id } : { ok: false, id, error: result.error };
    },
    replaceInSource,
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
    async addOriented(id, meta) {
      const normalized = await guard(id, meta);
      const source = await store.readSource(id);
      const { source: next, slots } = addOrientedSibling(source);
      await write(id, "add_oriented", next, normalized, source);
      return { ok: true, id, slots };
    },
    async fillSlots(id, slots, meta) {
      const normalized = await guard(id, meta);
      const source = await store.readSource(id);
      // Tokens in source are known (survive HTTP↔MCP handoff / process restart).
      const known = slotIdsFromSource(source);
      const next = applySlotFills(source, slots, known);
      await write(id, "fill_slots", next, normalized, source);
      // Leftover `__tc_slot_*__` tokens remain fillable; no process-wide expire.
      return { ok: true, id, slots: pendingSlots(next) };
    },
    async move(from, to, opts, meta) {
      const io = requireMover(store);
      const mode = moveMode(from, await io.pathKind(from), opts);
      const pairs = planMoves(await store.list(), from, to, mode, opts?.match);
      let normalized = normalizeMeta(meta);
      for (const pair of pairs) {
        normalized = await guard(pair.from, meta);
        await guard(pair.to, meta);
      }
      const sources = await readMoved(pairs, (id) => store.readSource(id));
      await commitMoved(mode, from, to, pairs, io);
      // ponytail: logged as a create at the new id. Rollback does not move the file back.
      // Upgrade: a move entry that revert renames back, if anyone needs undo.
      for (const pair of pairs) {
        await settlement
          .recordWrite(
            { canvas: pair.to, tool: "move", before: null, after: sources.get(pair.from)! },
            normalized,
          )
          .catch((err: unknown) => {
            console.error("[team-canvas] change log:", err instanceof Error ? err.message : err);
          });
      }
      return { ok: true, moved: pairs };
    },
  };
}
