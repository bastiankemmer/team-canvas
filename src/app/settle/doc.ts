import { createHash } from "node:crypto";
import type { CanvasStore } from "../../ports/canvas-store.js";

/**
 * The settlement document: one JSON value in the store's sidecar state that holds
 * topics, the change log, leases and per-actor notices. The concern modules
 * (topics, leases, change-log) are plain functions over a `Doc`; `DocStore.mutate`
 * runs them under the store's lock, so several processes can share the document.
 */

/** Reserved sidecar ids. Hidden dirs/files: never listed as canvases. */
export const SETTLEMENT_STATE_ID = ".settlement";
export const SNAPSHOT_DIR = ".snap/";

export type ErrorKind = "invalid" | "not_found" | "conflict" | "corrupt";

/** A refusal callers can act on. Adapters map `kind` to a status; the message is for the agent. */
export class SettlementError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

export type TopicStatus = "open" | "escalated" | "settled";
export type NoticeKind = "conflict" | "write" | "escalated" | "settled" | "lease";

export type Decision = { plan: string; by: string; at: number };

export type Position = {
  plan: string;
  reason?: string;
  canvas?: string;
  at: number;
  expiresAt: number;
  /** Times this actor re-declared while the topic was contested. */
  rounds: number;
};

export type Topic = {
  status: TopicStatus;
  /** Never deleted: expired positions still say who took part. */
  positions: Record<string, Position>;
  decision?: Decision;
};

export type LogEntry = {
  n: number;
  ts: number;
  actor: string;
  tool: string;
  canvas: string;
  reason?: string;
  topic?: string;
  /** Content hashes. `before` is null when the write created the canvas. */
  before: string | null;
  after: string;
  reverted?: true;
};

export type Lease = {
  actor: string;
  acquiredAt: number;
  expiresAt: number;
  /** Actors that asked while it was held; told when it is released. */
  waiters: string[];
};

export type Notice = { kind: NoticeKind; topic: string; message: string; at: number };

export type Doc = {
  seq: number;
  topics: Record<string, Topic>;
  log: LogEntry[];
  notices: Record<string, Notice[]>;
  leases: Record<string, Lease>;
};

const MAX_NOTICES = 20;

export const sha = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Own-property lookup: names like "constructor" must not hit Object.prototype. */
export function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function clean(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new SettlementError("invalid", `${name} must be a string`);
  const text = value.trim();
  if (text.length > max) {
    throw new SettlementError("invalid", `${name} must be at most ${max} characters`);
  }
  if (text === "__proto__") throw new SettlementError("invalid", `Invalid ${name}`);
  return text || undefined;
}

export function required(value: unknown, name: string, max: number): string {
  const text = clean(value, name, max);
  if (!text) throw new SettlementError("invalid", `Missing or invalid argument: ${name}`);
  return text;
}

/** Seconds from a caller (default when absent) as milliseconds, within 1..max. */
export function ttlMillis(value: unknown, fallbackSeconds: number, maxSeconds: number): number {
  const seconds = value === undefined ? fallbackSeconds : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > maxSeconds) {
    throw new SettlementError("invalid", `ttl_seconds must be between 1 and ${maxSeconds}`);
  }
  return seconds * 1000;
}

const TOPIC_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export function cleanTopic(value: unknown): string | undefined {
  const topic = clean(value, "topic", 80);
  if (topic !== undefined && !TOPIC_RE.test(topic)) {
    throw new SettlementError(
      "invalid",
      `Invalid topic "${topic}": use lowercase letters, digits, ".", "_" or "-", starting with a letter or digit`,
    );
  }
  return topic;
}

export function parseDoc(current: unknown): Doc {
  if (current === undefined || current === null) {
    return { seq: 0, topics: {}, log: [], notices: {}, leases: {} };
  }
  if (
    !isRecord(current) ||
    typeof current.seq !== "number" ||
    !isRecord(current.topics) ||
    !Array.isArray(current.log) ||
    !isRecord(current.notices)
  ) {
    // Never overwrite: a hand-edited or newer-format file is the user's to fix.
    throw new SettlementError("corrupt", `Corrupt settlement state "${SETTLEMENT_STATE_ID}"`);
  }
  // Documents written before leases existed have no `leases`.
  current.leases ??= {};
  if (!isRecord(current.leases)) {
    throw new SettlementError("corrupt", `Corrupt settlement state "${SETTLEMENT_STATE_ID}"`);
  }
  return current as Doc;
}

/** Queue a notice for each actor in `to` (except `except`), keeping the newest few. */
export function notify(
  doc: Doc,
  to: Iterable<string>,
  except: string | undefined,
  kind: NoticeKind,
  topic: string,
  message: string,
  at: number,
): void {
  for (const actor of to) {
    if (actor === except) continue;
    const queue = own(doc.notices, actor) ?? [];
    doc.notices[actor] = [...queue, { kind, topic, message, at }].slice(-MAX_NOTICES);
  }
}

export type DocStore = {
  read(): Promise<Doc>;
  /**
   * Change the document under the store's lock. `fn` may be async: the lock is
   * held until it settles, so a lease check and a source write stay one step.
   */
  mutate<R>(fn: (doc: Doc) => R | Promise<R>): Promise<R>;
};

export function createDocStore(store: CanvasStore): DocStore {
  async function readRaw(): Promise<unknown> {
    try {
      return await store.readState(SETTLEMENT_STATE_ID);
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return undefined;
      throw err;
    }
  }

  return {
    async read() {
      return parseDoc(await readRaw());
    },
    async mutate<R>(fn: (doc: Doc) => R | Promise<R>): Promise<R> {
      let out!: R;
      const apply = async (current: unknown): Promise<Doc> => {
        const doc = parseDoc(current);
        out = await fn(doc);
        return doc;
      };
      if (store.updateState) {
        await store.updateState(SETTLEMENT_STATE_ID, apply);
      } else {
        // ponytail: stores without updateState can lose a concurrent update. Upgrade: implement updateState.
        await store.writeState(SETTLEMENT_STATE_ID, await apply(await readRaw()));
      }
      return out;
    },
  };
}
