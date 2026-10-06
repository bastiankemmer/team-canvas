import {
  clean,
  cleanTopic,
  notify,
  own,
  required,
  SettlementError,
  ttlMillis,
  type Decision,
  type Doc,
  type LogEntry,
  type Position,
  type Topic,
  type TopicStatus,
} from "./doc.js";

/**
 * Topics: agents state a plan on a topic, conflicts are found when plans differ,
 * a bounded negotiation either settles by agreement or escalates to a human.
 * Plain functions over a `Doc`; run them inside `DocStore.mutate`.
 */

/** Insisted rounds an agent may make on a contested topic before it goes to a human. */
export const MAX_ROUNDS = 2;
const DEFAULT_TTL_SECONDS = 1800;
const MAX_TTL_SECONDS = 86_400;

export type PositionView = {
  actor: string;
  plan: string;
  reason?: string;
  canvas?: string;
  live: boolean;
};

export type TopicView = {
  topic: string;
  status: TopicStatus;
  decision?: Decision;
  positions: PositionView[];
};

export type IntentInput = {
  actor: unknown;
  topic: unknown;
  plan: unknown;
  reason?: unknown;
  canvas?: unknown;
  ttlSeconds?: unknown;
};

export type IntentResult = TopicView & {
  /** True when your plan clashes with another live plan or with the settled decision. */
  conflict: boolean;
  /** Other unsettled topics other agents hold on the same canvas: check them for overlap. */
  related: string[];
  message: string;
};

type Live = [actor: string, position: Position][];

const livePositions = (topic: Topic, now: number): Live =>
  Object.entries(topic.positions).filter(([, p]) => p.expiresAt > now);

const hasConflict = (live: Live): boolean => new Set(live.map(([, p]) => p.plan)).size > 1;

function view(topic: string, t: Topic, now: number, onlyLive = false): TopicView {
  const positions = Object.entries(t.positions)
    .map(([actor, p]) => ({
      actor,
      plan: p.plan,
      reason: p.reason,
      canvas: p.canvas,
      live: p.expiresAt > now,
    }))
    .filter((p) => !onlyLive || p.live);
  return { topic, status: t.status, decision: t.decision, positions };
}

export function listTopics(doc: Doc, status: TopicStatus | undefined, now: number): TopicView[] {
  return Object.entries(doc.topics)
    .filter(([, t]) => status === undefined || t.status === status)
    .map(([topic, t]) => view(topic, t, now));
}

function relatedTopics(doc: Doc, self: string, actor: string, canvas: string | undefined, now: number) {
  if (canvas === undefined) return [];
  return Object.entries(doc.topics)
    .filter(
      ([name, other]) =>
        name !== self &&
        other.status !== "settled" &&
        livePositions(other, now).some(([a, p]) => a !== actor && p.canvas === canvas),
    )
    .map(([name]) => name);
}

type ValidIntent = {
  actor: string;
  topic: string;
  plan: string;
  reason?: string;
  canvas?: string;
  ttl: number;
};

function parseIntent(input: IntentInput): ValidIntent {
  return {
    actor: required(input.actor, "actor", 64),
    topic: cleanTopic(required(input.topic, "topic", 80))!,
    plan: required(input.plan, "plan", 500),
    reason: clean(input.reason, "reason", 500),
    canvas: clean(input.canvas, "canvas", 200),
    ttl: ttlMillis(input.ttlSeconds, DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS),
  };
}

/** What `declareIntent` works with while it decides what a new plan means for its topic. */
type Ctx = {
  doc: Doc;
  t: Topic;
  v: ValidIntent;
  at: number;
  result(conflict: boolean, message: string): IntentResult;
};

/** Record the caller's plan on the topic. */
function take(c: Ctx, rounds: number): void {
  const { actor, plan, reason, canvas, ttl, topic } = c.v;
  c.t.positions[actor] = { plan, reason, canvas, at: c.at, expiresAt: c.at + ttl, rounds };
  c.doc.topics[topic] = c.t;
}

/** The topic already has a decision: matching it is fine, anything else is a conflict. */
function declareOnSettled(c: Ctx): IntentResult {
  const decision = c.t.decision!;
  if (c.v.plan !== decision.plan) {
    return c.result(
      true,
      `Topic "${c.v.topic}" is settled (${decision.by}): "${decision.plan}". Follow that, or ask a human to settle it differently.`,
    );
  }
  take(c, 0);
  return c.result(false, `Matches the settled decision on "${c.v.topic}".`);
}

/** Plans differ: tell the other holders, or hand the topic to a human once the rounds are used up. */
function declareContested(c: Ctx, live: Live, prev: Position | undefined, rounds: number): IntentResult {
  const { actor, plan, topic } = c.v;
  if (rounds >= MAX_ROUNDS) {
    c.t.status = "escalated";
    notify(
      c.doc,
      Object.keys(c.t.positions),
      actor,
      "escalated",
      topic,
      `"${topic}" could not be agreed and is escalated to a human. Do not change your plan until it is settled.`,
      c.at,
    );
    return c.result(true, `No agreement on "${topic}" after ${MAX_ROUNDS} rounds: escalated to a human.`);
  }
  for (const [other, p] of live) {
    notify(
      c.doc,
      [other],
      actor,
      "conflict",
      topic,
      `${actor} ${prev ? "holds" : "proposes"} "${plan}" on "${topic}" but you hold "${p.plan}". Round ${rounds}/${MAX_ROUNDS}: call declare_intent again to concede or insist.`,
      c.at,
    );
  }
  const others = live
    .filter(([a]) => a !== actor)
    .map(([a, p]) => `${a} wants "${p.plan}"`)
    .join("; ");
  return c.result(
    true,
    `Conflict on "${topic}": ${others}. Round ${rounds}/${MAX_ROUNDS}: concede with declare_intent, or insist and a human decides.`,
  );
}

/** Take or revise a plan on an open topic. Agreement settles it, a clash is a conflict. */
function declareOnOpen(c: Ctx): IntentResult {
  const { actor, plan, topic } = c.v;
  const prev = own(c.t.positions, actor);
  const rounds = prev ? prev.rounds + (hasConflict(livePositions(c.t, c.at)) ? 1 : 0) : 0;
  take(c, rounds);
  const live = livePositions(c.t, c.at);
  if (hasConflict(live)) return declareContested(c, live, prev, rounds);
  if (live.length < 2) return c.result(false, `Recorded your plan on "${topic}".`);
  c.t.status = "settled";
  c.t.decision = { plan, by: "agreement", at: c.at };
  notify(c.doc, Object.keys(c.t.positions), actor, "settled", topic, `Settled by agreement on "${topic}": ${plan}`, c.at);
  return c.result(false, `Everyone agrees on "${topic}": ${plan}. Settled.`);
}

/**
 * Take or revise your plan. The same plan from a second agent settles the topic by
 * agreement; a different plan is a conflict the others are told about.
 */
export function declareIntent(doc: Doc, input: IntentInput, at: number): IntentResult {
  const v = parseIntent(input);
  const t = own(doc.topics, v.topic) ?? { status: "open" as const, positions: {} };
  if (t.status === "escalated") {
    throw new SettlementError("conflict", `Topic "${v.topic}" is escalated: wait for a human to settle it`);
  }
  const c: Ctx = {
    doc,
    t,
    v,
    at,
    result: (conflict, message) => ({
      ...view(v.topic, t, at, t.status === "open"),
      conflict,
      related: relatedTopics(doc, v.topic, v.actor, v.canvas, at),
      message,
    }),
  };
  return t.status === "settled" ? declareOnSettled(c) : declareOnOpen(c);
}

/** Ask for a human now instead of waiting out the rounds. Only for a live conflict. */
export function escalate(doc: Doc, actorIn: unknown, topicIn: unknown, at: number): TopicView {
  const actor = required(actorIn, "actor", 64);
  const topic = cleanTopic(required(topicIn, "topic", 80))!;
  const t = own(doc.topics, topic);
  if (!t) throw new SettlementError("not_found", `Unknown topic "${topic}"`);
  if (t.status !== "open" || !hasConflict(livePositions(t, at))) {
    throw new SettlementError("conflict", `Topic "${topic}" has no open conflict to escalate`);
  }
  t.status = "escalated";
  notify(
    doc,
    Object.keys(t.positions),
    actor,
    "escalated",
    topic,
    `${actor} escalated "${topic}" to a human. Do not change your plan until it is settled.`,
    at,
  );
  return view(topic, t, at);
}

/**
 * What `POST /revert` with a topic rolls back, from the whole log (not the capped
 * change list). Once a decision exists, only losers — the same set `decide` returns.
 * An open topic has no decision, so every non-revert entry for it is undone.
 */
export function entriesToRevert(doc: Doc, topic: string): number[] {
  const t = own(doc.topics, topic);
  const plan = t?.decision?.plan;
  if (plan !== undefined && t) {
    return doc.log
      .filter((e) => {
        const p = e.topic === topic && !e.reverted ? own(t.positions, e.actor) : undefined;
        return p !== undefined && p.plan !== plan;
      })
      .map((e) => e.n);
  }
  return doc.log.filter((e) => e.topic === topic && !e.reverted && e.tool !== "revert").map((e) => e.n);
}

/**
 * A human decides. Returns the logged writes under this topic by actors whose plan
 * differs from the decision, which the caller may roll back.
 */
export function decide(
  doc: Doc,
  topicIn: unknown,
  planIn: unknown,
  byIn: unknown,
  at: number,
): { decision: Decision; losers: number[] } {
  const topic = cleanTopic(required(topicIn, "topic", 80))!;
  const plan = required(planIn, "plan", 500);
  const by = clean(byIn, "by", 64) ?? "human";
  const t = own(doc.topics, topic);
  if (!t) throw new SettlementError("not_found", `Unknown topic "${topic}"`);
  const decision: Decision = { plan, by, at };
  t.status = "settled";
  t.decision = decision;
  notify(doc, Object.keys(t.positions), undefined, "settled", topic, `${by} settled "${topic}": ${plan}`, at);
  return { decision, losers: entriesToRevert(doc, topic) };
}

/** The writer's plan lost to the decision: say their write may be reverted. */
function warnSettled(doc: Doc, entry: LogEntry, t: Topic, topic: string, at: number): void {
  const mine = own(t.positions, entry.actor);
  if (!mine || mine.plan === t.decision!.plan) return;
  notify(
    doc,
    [entry.actor],
    undefined,
    "settled",
    topic,
    `"${topic}" is settled as "${t.decision!.plan}" but your plan was "${mine.plan}". Your write #${entry.n} may be reverted.`,
    at,
  );
}

/** The topic is contested: warn the writer, and tell the holders of other plans a write landed. */
function warnContested(doc: Doc, entry: LogEntry, t: Topic, topic: string, live: Live, at: number): void {
  const mine = own(t.positions, entry.actor);
  notify(
    doc,
    [entry.actor],
    undefined,
    "conflict",
    topic,
    `"${topic}" is contested: write #${entry.n} is recorded and may be reverted when it is settled.`,
    at,
  );
  notify(
    doc,
    live.filter(([, p]) => p.plan !== mine?.plan).map(([a]) => a),
    entry.actor,
    "write",
    topic,
    `${entry.actor} changed "${entry.canvas}" (#${entry.n}) under contested topic "${topic}".`,
    at,
  );
}

/** After a logged write under a topic: warn when it is contested or settled otherwise. */
export function noteWrite(doc: Doc, entry: LogEntry, at: number): void {
  const topic = entry.topic;
  const t = topic === undefined ? undefined : own(doc.topics, topic);
  if (!t || topic === undefined) return;
  if (t.status === "settled") return warnSettled(doc, entry, t, topic, at);
  const live = livePositions(t, at);
  if (hasConflict(live)) warnContested(doc, entry, t, topic, live, at);
}
