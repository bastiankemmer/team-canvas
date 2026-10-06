import type { CanvasStore } from "../../ports/canvas-store.js";
import {
  clean,
  cleanTopic,
  isRecord,
  SNAPSHOT_DIR,
  sha,
  type Doc,
  type DocStore,
  type LogEntry,
} from "./doc.js";
import { liveLease } from "./leases.js";

/**
 * The change log: who changed which canvas, why, and under which topic, with the
 * content before kept (content-addressed) so a write can be rolled back.
 */

// ponytail: the log lives in one JSON document that is rewritten on every write.
// Ceiling: ~1000 entries. Upgrade: one file per day or a real database.
const MAX_LOG = 1000;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

export type WriteMeta = { actor?: string; reason?: string; topic?: string };
export type NormalizedMeta = { actor: string; reason?: string; topic?: string };

export type ChangeFilter = { canvas?: string; topic?: string; actor?: string; limit?: number };

export type RevertResult = {
  reverted: number[];
  skipped: { n: number; reason: string }[];
};

export type WriteRecord = { canvas: string; tool: string; before: string | null; after: string };

/** Validate who/why/topic before a write happens, so a bad topic never leaves a half-logged write. */
export function normalizeMeta(meta?: WriteMeta): NormalizedMeta {
  return {
    actor: clean(meta?.actor, "actor", 64) ?? "anonymous",
    reason: clean(meta?.reason, "reason", 500),
    topic: cleanTopic(meta?.topic),
  };
}

export const snapshotId = (hash: string): string => `${SNAPSHOT_DIR}${hash}`;

export function appendEntry(doc: Doc, write: WriteRecord, meta: NormalizedMeta, at: number): LogEntry {
  doc.seq += 1;
  const entry: LogEntry = {
    n: doc.seq,
    ts: at,
    actor: meta.actor,
    tool: write.tool,
    canvas: write.canvas,
    reason: meta.reason,
    topic: meta.topic,
    before: write.before === null ? null : sha(write.before),
    after: sha(write.after),
  };
  doc.log = [...doc.log, entry].slice(-MAX_LOG);
  return entry;
}

export function selectChanges(doc: Doc, filter: ChangeFilter): LogEntry[] {
  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  return doc.log
    .filter(
      (e) =>
        (filter.canvas === undefined || e.canvas === filter.canvas) &&
        (filter.topic === undefined || e.topic === filter.topic) &&
        (filter.actor === undefined || e.actor === filter.actor),
    )
    .slice(-limit);
}

export async function readSourceOrNull(store: CanvasStore, id: string): Promise<string | null> {
  try {
    return await store.readSource(id);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Restores the content before logged writes (newest first), but only where the canvas
 * still holds what that write produced and nobody else holds its lease. Anything else
 * is reported, not forced. `record` logs the restoring write itself.
 */
export function createRollback(
  store: CanvasStore,
  docs: DocStore,
  now: () => number,
  record: (write: WriteRecord, meta: NormalizedMeta) => Promise<void>,
) {
  /** The entry if the log alone allows reverting it, else why not. */
  function check(
    entry: LogEntry | undefined,
    by: string,
    doc: Doc,
  ): { reason: string } | { entry: LogEntry & { before: string } } {
    if (!entry) return { reason: "no such log entry" };
    if (entry.reverted) return { reason: "already reverted" };
    if (entry.before === null) return { reason: "this write created the canvas" };
    const lease = liveLease(doc, entry.canvas, now());
    if (lease && lease.actor !== by) return { reason: `"${entry.canvas}" is leased by ${lease.actor}` };
    return { entry: { ...entry, before: entry.before } };
  }

  /** Why an entry cannot be reverted, or null once it has been. */
  async function revertOne(logged: LogEntry | undefined, by: string, doc: Doc): Promise<string | null> {
    const checked = check(logged, by, doc);
    if ("reason" in checked) return checked.reason;
    const { entry } = checked;
    const current = await readSourceOrNull(store, entry.canvas);
    if (current === null || sha(current) !== entry.after) {
      return `"${entry.canvas}" changed since this write`;
    }
    const snapshot = await store.readState(snapshotId(entry.before)).catch(() => null);
    const source = isRecord(snapshot) ? snapshot.source : undefined;
    if (typeof source !== "string") return "snapshot of the old content is missing";
    // The doc `revert` already read can miss a lease taken since. Re-check under
    // the settlement lock and hold that lock through the restore write.
    const blocked = await docs.mutate(async (fresh) => {
      const lease = liveLease(fresh, entry.canvas, now());
      if (lease && lease.actor !== by) return `"${entry.canvas}" is leased by ${lease.actor}`;
      await store.writeSource(entry.canvas, source);
      return null;
    });
    if (blocked !== null) return blocked;
    await record(
      { canvas: entry.canvas, tool: "revert", before: current, after: source },
      { actor: by, reason: `revert #${entry.n}` },
    );
    return null;
  }

  return async function revert(entries: number[], byIn: unknown): Promise<RevertResult> {
    const by = clean(byIn, "by", 64) ?? "human";
    const doc = await docs.read();
    const result: RevertResult = { reverted: [], skipped: [] };
    for (const n of [...new Set(entries)].sort((a, b) => b - a)) {
      const reason = await revertOne(
        doc.log.find((e) => e.n === n),
        by,
        doc,
      );
      if (reason === null) result.reverted.push(n);
      else result.skipped.push({ n, reason });
    }
    if (result.reverted.length > 0) {
      await docs.mutate((d) => {
        for (const e of d.log) if (result.reverted.includes(e.n)) e.reverted = true;
      });
    }
    return result;
  };
}
