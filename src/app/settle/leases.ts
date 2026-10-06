import {
  clean,
  notify,
  own,
  required,
  SettlementError,
  ttlMillis,
  type Doc,
  type Lease,
} from "./doc.js";

/**
 * Write leases: one actor at a time may change a canvas. A lease expires, so a
 * crashed agent cannot hold a canvas forever; reads never need one.
 * Plain functions over a `Doc`; run them inside `DocStore.mutate`.
 */

const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 3600;
const MAX_WAITERS = 10;

export type LeaseInput = { actor: unknown; canvas: unknown; ttlSeconds?: unknown };
export type ReleaseInput = { actor: unknown; canvas: unknown; force?: boolean };

export type LeaseResult = {
  canvas: string;
  /** False when someone else holds it: they are told you are waiting. */
  acquired: boolean;
  holder: string;
  expiresAt: number;
};

export type LeaseView = { canvas: string; actor: string; expiresAt: number; waiters: string[] };

const canvasOf = (value: unknown): string => required(value, "canvas", 200);

/** The lease on `canvas` if it has not expired. */
export function liveLease(doc: Doc, canvas: string, now: number): Lease | undefined {
  const lease = own(doc.leases, canvas);
  return lease && lease.expiresAt > now ? lease : undefined;
}

/** The lease is held by someone else: join its waiters and tell the holder. */
function waitBehind(doc: Doc, held: Lease, actor: string, canvas: string, now: number): LeaseResult {
  if (!held.waiters.includes(actor)) held.waiters = [...held.waiters, actor].slice(-MAX_WAITERS);
  notify(
    doc,
    [held.actor],
    undefined,
    "lease",
    canvas,
    `${actor} is waiting for "${canvas}". Release the lease when you are done.`,
    now,
  );
  return { canvas, acquired: false, holder: held.actor, expiresAt: held.expiresAt };
}

export function acquireLease(doc: Doc, input: LeaseInput, now: number): LeaseResult {
  const actor = required(input.actor, "actor", 64);
  const canvas = canvasOf(input.canvas);
  const ttl = ttlMillis(input.ttlSeconds, DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);

  const held = liveLease(doc, canvas, now);
  if (held && held.actor !== actor) return waitBehind(doc, held, actor, canvas, now);
  const lease: Lease = {
    actor,
    acquiredAt: held?.acquiredAt ?? now,
    expiresAt: now + ttl,
    waiters: held?.waiters ?? [],
  };
  doc.leases[canvas] = lease;
  return { canvas, acquired: true, holder: actor, expiresAt: lease.expiresAt };
}

/**
 * Give a lease back. Only the holder may, unless `force` (a human freeing a stuck
 * canvas). Releasing a lease that is gone or expired is fine.
 */
export function releaseLease(doc: Doc, input: ReleaseInput, now: number): { released: boolean } {
  const actor = clean(input.actor, "actor", 64);
  if (!actor && !input.force) throw new SettlementError("invalid", "Missing or invalid argument: actor");
  const canvas = canvasOf(input.canvas);
  const held = liveLease(doc, canvas, now);
  if (!held) {
    delete doc.leases[canvas];
    return { released: false };
  }
  if (held.actor !== actor && !input.force) {
    throw new SettlementError("conflict", `Canvas "${canvas}" is leased by ${held.actor}, not ${actor}`);
  }
  delete doc.leases[canvas];
  notify(doc, held.waiters, actor, "lease", canvas, `"${canvas}" is free: acquire its lease to write.`, now);
  if (held.actor !== actor) {
    notify(doc, [held.actor], undefined, "lease", canvas, `Your lease on "${canvas}" was released by ${actor ?? "a human"}.`, now);
  }
  return { released: true };
}

export function listLeases(doc: Doc, now: number): LeaseView[] {
  return Object.entries(doc.leases)
    .filter(([, l]) => l.expiresAt > now)
    .map(([canvas, l]) => ({ canvas, actor: l.actor, expiresAt: l.expiresAt, waiters: l.waiters }));
}

/** Throws unless `actor` holds the live lease on `canvas`: the gate every write passes. */
export function assertLease(doc: Doc, canvas: string, actorIn: unknown, now: number): void {
  const actor = clean(actorIn, "actor", 64);
  if (!actor) {
    throw new SettlementError(
      "invalid",
      `A write needs an actor: pass actor, after acquire_lease on "${canvas}"`,
    );
  }
  const held = liveLease(doc, canvas, now);
  if (!held) {
    throw new SettlementError("conflict", `Canvas "${canvas}" needs a lease: call acquire_lease first`);
  }
  if (held.actor !== actor) {
    throw new SettlementError(
      "conflict",
      `Canvas "${canvas}" is leased by ${held.actor} until ${new Date(held.expiresAt).toISOString()}`,
    );
  }
}
