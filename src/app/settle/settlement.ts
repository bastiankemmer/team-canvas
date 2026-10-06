import type { CanvasStore } from "../../ports/canvas-store.js";
import {
  appendEntry,
  createRollback,
  selectChanges,
  snapshotId,
  type ChangeFilter,
  type RevertResult,
  type WriteRecord,
  type NormalizedMeta,
} from "./change-log.js";
import { createDocStore, own, sha, type Notice, type TopicStatus } from "./doc.js";
import {
  acquireLease,
  assertLease,
  listLeases,
  releaseLease,
  type LeaseInput,
  type ReleaseInput,
} from "./leases.js";
import { decide, declareIntent, escalate, listTopics, noteWrite, type IntentInput } from "./topics.js";

/**
 * Agent settlement for agents that share one store: write leases, a change log with
 * rollback, topics where conflicting plans are found early and negotiated, and a human
 * who settles what the agents cannot. This facade runs the concern modules against one
 * shared document (see doc.ts) and does the I/O they leave out (snapshots, rollback).
 */

export { SettlementError, SETTLEMENT_STATE_ID } from "./doc.js";
export type { Decision, ErrorKind, Notice, NoticeKind, TopicStatus } from "./doc.js";
export { normalizeMeta, readSourceOrNull } from "./change-log.js";
export type { ChangeFilter, NormalizedMeta, RevertResult, WriteMeta, WriteRecord } from "./change-log.js";
export type { LeaseInput, LeaseResult, LeaseView, ReleaseInput } from "./leases.js";
export { MAX_ROUNDS } from "./topics.js";
export type { IntentInput, IntentResult, PositionView, TopicView } from "./topics.js";

export type SettleResult = RevertResult & {
  topic: string;
  decision: { plan: string; by: string; at: number };
};

export function createSettlement(store: CanvasStore, now: () => number = Date.now) {
  const docs = createDocStore(store);

  /** Log a write: keep the old content for rollback, then append and raise any topic warnings. */
  async function recordWrite(write: WriteRecord, meta: NormalizedMeta): Promise<void> {
    if (write.before === write.after) return;
    if (write.before !== null) {
      await store.writeState(snapshotId(sha(write.before)), { source: write.before });
    }
    await docs.mutate((doc) => {
      const at = now();
      noteWrite(doc, appendEntry(doc, write, meta, at), at);
    });
  }

  const revert = createRollback(store, docs, now, recordWrite);

  return {
    declareIntent: (input: IntentInput) => docs.mutate((doc) => declareIntent(doc, input, now())),
    escalate: (actor: unknown, topic: unknown) =>
      docs.mutate((doc) => escalate(doc, actor, topic, now())),
    listTopics: async (status?: TopicStatus) => listTopics(await docs.read(), status, now()),

    acquireLease: (input: LeaseInput) => docs.mutate((doc) => acquireLease(doc, input, now())),
    releaseLease: (input: ReleaseInput) => docs.mutate((doc) => releaseLease(doc, input, now())),
    listLeases: async () => listLeases(await docs.read(), now()),
    /** The gate every write passes: throws unless `actor` holds the canvas lease. */
    assertLease: async (canvas: string, actor: unknown) =>
      assertLease(await docs.read(), canvas, actor, now()),

    listChanges: async (filter: ChangeFilter = {}) => selectChanges(await docs.read(), filter),
    recordWrite,
    revert,

    /** Pending notices for an actor, delivered once. Cheap when there are none (no lock). */
    async takeNotices(actor: string): Promise<Notice[]> {
      if (!own((await docs.read()).notices, actor)?.length) return [];
      return docs.mutate((doc) => {
        const taken = own(doc.notices, actor) ?? [];
        delete doc.notices[actor];
        return taken;
      });
    },

    /**
     * A human settles a topic. With `revert`, writes tagged with the topic by actors
     * whose plan lost are rolled back where nothing else has changed the canvas since.
     */
    async settle(topic: unknown, plan: unknown, by: unknown, doRevert = false): Promise<SettleResult> {
      const { decision, losers } = await docs.mutate((doc) => decide(doc, topic, plan, by, now()));
      const outcome = doRevert ? await revert(losers, by) : { reverted: [], skipped: [] };
      return { topic: String(topic).trim(), decision, ...outcome };
    },
  };
}

export type Settlement = ReturnType<typeof createSettlement>;
