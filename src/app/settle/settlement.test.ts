import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callMcpTool } from "../../adapters/mcp/mcp-server.js";
import { LocalFilesystemCanvasStore } from "../../adapters/store/local-fs-canvas-store.js";
import type { CanvasStore } from "../../ports/canvas-store.js";
import { createCanvasEditOps } from "../edit/canvas-edit-ops.js";
import { createSettlement, MAX_ROUNDS, SettlementError } from "./settlement.js";

const src = (label: string) => `export default function C() { return <span>${label}</span> }\n`;

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "team-canvas-settle-"));
  const store = LocalFilesystemCanvasStore(root);
  // Leases are covered below; the other scenarios are about topics and the log.
  const ops = createCanvasEditOps(store, { requireLease: false });
  await ops.createCanvas("arch", src("start"));
  return { root, store, ops, s: ops.settlement };
}

const intent = (actor: string, plan: string, extra: Record<string, unknown> = {}) => ({
  actor,
  topic: "db",
  plan,
  canvas: "arch",
  ...extra,
});

describe("agent settlement", () => {
  it("@task-1: contradiction is found at declare time, negotiation escalates, a human settles and the losing write is reverted", async () => {
    const { root, ops, s } = await setup();

    const first = await s.declareIntent(intent("alice", "postgres"));
    expect(first.conflict).toBe(false);

    const clash = await s.declareIntent(intent("bob", "mongo"));
    expect(clash).toMatchObject({ conflict: true, status: "open" });
    expect(clash.message).toContain("alice wants");
    // alice hears about it on her next call, once
    const heard = await s.takeNotices("alice");
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kind: "conflict", topic: "db" });
    expect(await s.takeNotices("alice")).toEqual([]);

    await ops.writeSource("arch", src("postgres"), { actor: "alice", reason: "use pg", topic: "db" });
    await ops.writeSource("arch", src("mongo"), { actor: "bob", reason: "use mongo", topic: "db" });
    // each learns the other is already writing under the contested topic
    expect((await s.takeNotices("alice")).map((n) => n.kind)).toContain("write");
    expect((await s.takeNotices("bob")).map((n) => n.kind)).toContain("conflict");

    // bounded negotiation: both insist until the rounds run out
    for (let round = 1; round < MAX_ROUNDS; round++) {
      await s.declareIntent(intent("alice", "postgres"));
      await s.declareIntent(intent("bob", "mongo"));
    }
    const last = await s.declareIntent(intent("alice", "postgres"));
    expect(last.status).toBe("escalated");
    expect((await s.takeNotices("bob")).map((n) => n.kind)).toContain("escalated");
    await expect(s.declareIntent(intent("bob", "mongo"))).rejects.toThrow(/escalated/);

    const settled = await s.settle("db", "postgres", "basti", true);
    expect(settled.decision).toMatchObject({ plan: "postgres", by: "basti" });
    expect(settled.reverted).toHaveLength(1);
    expect(await readFile(path.join(root, "arch.canvas.tsx"), "utf8")).toBe(src("postgres"));
    expect((await s.takeNotices("bob")).map((n) => n.kind)).toContain("settled");

    const log = await s.listChanges({ canvas: "arch" });
    expect(log.map((e) => [e.actor, e.tool])).toEqual([
      ["anonymous", "create_canvas"],
      ["alice", "write_source"],
      ["bob", "write_source"],
      ["basti", "revert"],
    ]);
    expect(log[1]).toMatchObject({ reason: "use pg", topic: "db" });
    expect(log[2]!.reverted).toBe(true);
  });

  it("@task-2: the same plan settles by agreement, then a different plan is a conflict that is not recorded", async () => {
    const { s } = await setup();
    await s.declareIntent(intent("alice", "postgres"));
    const agreed = await s.declareIntent(intent("bob", "postgres"));
    expect(agreed).toMatchObject({ status: "settled", conflict: false });
    expect((await s.takeNotices("alice"))[0]).toMatchObject({ kind: "settled" });

    const late = await s.declareIntent(intent("carol", "mongo"));
    expect(late).toMatchObject({ conflict: true, status: "settled" });
    expect(late.decision?.plan).toBe("postgres");
    const topics = await s.listTopics("settled");
    expect(topics[0]!.positions.map((p) => p.actor)).toEqual(["alice", "bob"]);
  });

  it("@task-3: conceding settles, expired claims do not conflict, and other topics on the same canvas are listed as related", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-settle-"));
    let t = 1_000;
    const s = createSettlement(LocalFilesystemCanvasStore(root), () => t);

    await s.declareIntent(intent("alice", "postgres", { ttlSeconds: 10 }));
    t += 11_000; // alice's claim lapses
    const after = await s.declareIntent(intent("bob", "mongo"));
    expect(after.conflict).toBe(false);
    expect(after.positions.map((p) => p.actor)).toEqual(["bob"]);

    const other = await s.declareIntent({ actor: "carol", topic: "cache", plan: "redis", canvas: "arch" });
    expect(other.related).toEqual(["db"]);

    await s.declareIntent(intent("alice", "postgres"));
    const conceded = await s.declareIntent(intent("bob", "postgres"));
    expect(conceded.status).toBe("settled");
  });

  it("@task-4: a revert never overwrites a newer change by someone else", async () => {
    const { root, ops, s } = await setup();
    await s.declareIntent(intent("alice", "postgres"));
    await s.declareIntent(intent("bob", "mongo"));
    await ops.writeSource("arch", src("mongo"), { actor: "bob", topic: "db" });
    await ops.writeSource("arch", src("carol-edit"), { actor: "carol" });

    const settled = await s.settle("db", "postgres", "basti", true);
    expect(settled.reverted).toEqual([]);
    expect(settled.skipped[0]!.reason).toMatch(/changed since/);
    expect(await readFile(path.join(root, "arch.canvas.tsx"), "utf8")).toBe(src("carol-edit"));

    // a revert of the creation, a missing entry and a repeat are all reported, not forced
    const again = await s.revert([1, 99], "basti");
    expect(again.skipped.map((x) => x.reason)).toEqual([
      "no such log entry",
      "this write created the canvas",
    ]);
  });

  it("@task-4b: after a decision, a write by an agent whose plan lost is flagged to that agent only", async () => {
    const { ops, s } = await setup();
    await s.declareIntent(intent("alice", "postgres"));
    await s.declareIntent(intent("bob", "mongo"));
    await s.settle("db", "postgres", "basti");
    await s.takeNotices("alice");
    await s.takeNotices("bob");

    await ops.writeSource("arch", src("pg"), { actor: "alice", topic: "db" });
    expect(await s.takeNotices("alice")).toEqual([]);
    await ops.writeSource("arch", src("mongo"), { actor: "bob", topic: "db" });
    const flagged = await s.takeNotices("bob");
    expect(flagged[0]!.message).toContain('settled as "postgres" but your plan was "mongo"');
    expect(await s.takeNotices("alice")).toEqual([]);
  });

  it("@task-5: bad topic or actor is refused before the write lands; escalate needs a live conflict", async () => {
    const { root, ops, s } = await setup();
    await expect(ops.writeSource("arch", src("x"), { topic: "Not Valid" })).rejects.toThrow(/Invalid topic/);
    await expect(ops.writeSource("arch", src("x"), { actor: "__proto__" })).rejects.toThrow(/Invalid actor/);
    expect(await readFile(path.join(root, "arch.canvas.tsx"), "utf8")).toBe(src("start"));

    await s.declareIntent(intent("alice", "postgres"));
    await expect(s.escalate("alice", "db")).rejects.toThrow(/no open conflict/);
    await expect(s.escalate("alice", "nope")).rejects.toThrow(/Unknown topic/);
    await s.declareIntent(intent("bob", "mongo"));
    expect((await s.escalate("alice", "db")).status).toBe("escalated");
    // names that collide with Object.prototype members are ordinary names
    await expect(s.declareIntent({ actor: "constructor", topic: "constructor", plan: "p" })).resolves.toMatchObject({
      conflict: false,
    });
  });

  it("@task-6: two processes writing at once lose no log entry", async () => {
    const { root } = await setup();
    const a = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const b = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => [
        a.writeSource("arch", src(`a${i}`), { actor: "a" }),
        b.writeSource("arch2", src(`b${i}`), { actor: "b" }),
      ]).flat(),
    );
    const log = await a.settlement.listChanges({ limit: 500 });
    expect(log.length).toBeGreaterThanOrEqual(30);
    expect(new Set(log.map((e) => e.n)).size).toBe(log.length);
  });

  it("@task-7: MCP calls carry notices for the actor as a second item and tools expose the log", async () => {
    const { ops } = await setup();
    await callMcpTool(ops, "declare_intent", { actor: "alice", topic: "db", plan: "postgres" });
    const bob = await callMcpTool(ops, "declare_intent", { actor: "bob", topic: "db", plan: "mongo" });
    expect(bob.content).toHaveLength(1);
    expect(JSON.parse(bob.content[0]!.text).conflict).toBe(true);

    const alice = await callMcpTool(ops, "write_source", {
      id: "arch",
      source: src("pg"),
      actor: "alice",
      reason: "use pg",
      topic: "db",
    });
    expect(JSON.parse(alice.content[0]!.text)).toEqual({ ok: true, id: "arch" });
    const notices = JSON.parse(alice.content[1]!.text).notices as Array<{ kind: string }>;
    expect(notices.map((n) => n.kind)).toContain("conflict");

    const noActor = await callMcpTool(ops, "read_source", { id: "arch" });
    expect(noActor.content).toHaveLength(1);

    const changes = await callMcpTool(ops, "list_changes", { topic: "db" });
    expect(JSON.parse(changes.content[0]!.text)).toHaveLength(1);
    const topics = await callMcpTool(ops, "list_topics", { status: "open" });
    expect(JSON.parse(topics.content[0]!.text)[0].topic).toBe("db");
    expect((await callMcpTool(ops, "list_topics", { status: "bogus" })).isError).toBe(true);
    expect((await callMcpTool(ops, "escalate_topic", { actor: "bob", topic: "db" })).isError).toBeFalsy();
    expect((await callMcpTool(ops, "declare_intent", { actor: "bob", topic: "db", plan: "x" })).isError).toBe(true);
  });

  it("@task-8: a store without updateState still works, and corrupt state is never overwritten", async () => {
    const files = new Map<string, unknown>();
    const store: CanvasStore = {
      list: async () => [],
      readSource: async () => {
        throw Object.assign(new Error("nope"), { code: "ENOENT" });
      },
      writeSource: async () => {},
      readState: async (id) => {
        if (!files.has(id)) throw Object.assign(new Error("nope"), { code: "ENOENT" });
        return files.get(id);
      },
      writeState: async (id, state) => void files.set(id, state),
    };
    const s = createSettlement(store);
    await s.declareIntent({ actor: "a", topic: "t", plan: "p" });
    expect((await s.listTopics()).map((x) => x.topic)).toEqual(["t"]);

    files.set(".settlement", { weird: true });
    await expect(s.declareIntent({ actor: "a", topic: "t", plan: "p" })).rejects.toThrow(/Corrupt/);
    expect(files.get(".settlement")).toEqual({ weird: true });
  });
});

describe("write leases", () => {
  const kinds = async (p: Promise<unknown>) => {
    try {
      await p;
      return "ok";
    } catch (err) {
      return err instanceof SettlementError ? err.kind : "other";
    }
  };

  async function strict() {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-lease-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));
    return { root, ops, s: ops.settlement };
  }

  it("@task-12: a write needs an actor that holds the lease; others wait and are told when it is free", async () => {
    const { root, ops, s } = await strict();

    // nothing is written without an actor and a lease, including creating a canvas
    expect(await kinds(ops.createCanvas("arch", src("a")))).toBe("invalid");
    expect(await kinds(ops.createCanvas("arch", src("a"), { actor: "alice" }))).toBe("conflict");
    await expect(ops.readSource("arch")).rejects.toThrow();

    expect(await s.acquireLease({ actor: "alice", canvas: "arch" })).toMatchObject({
      acquired: true,
      holder: "alice",
    });
    await ops.createCanvas("arch", src("a"), { actor: "alice", reason: "start" });

    // bob is refused, both on acquire and on every kind of write, and alice hears he waits
    const denied = await s.acquireLease({ actor: "bob", canvas: "arch" });
    expect(denied).toMatchObject({ acquired: false, holder: "alice" });
    expect((await s.takeNotices("alice"))[0]).toMatchObject({ kind: "lease", topic: "arch" });
    const bob = { actor: "bob" };
    for (const attempt of [
      () => ops.writeSource("arch", src("b"), bob),
      () => ops.replaceInSource("arch", "a</span>", "b</span>", false, bob),
      () => ops.addOriented("arch", bob),
      () => ops.fillSlots("arch", {}, bob),
    ]) {
      expect(await kinds(attempt())).toBe("conflict");
    }
    expect(await readFile(path.join(root, "arch.canvas.tsx"), "utf8")).toBe(src("a"));

    // alice may write, and only she may release
    await ops.writeSource("arch", src("alice-2"), { actor: "alice" });
    expect(await kinds(s.releaseLease({ actor: "bob", canvas: "arch" }))).toBe("conflict");
    expect(await s.listLeases()).toMatchObject([{ canvas: "arch", actor: "alice", waiters: ["bob"] }]);
    expect(await s.releaseLease({ actor: "alice", canvas: "arch" })).toEqual({ released: true });
    expect((await s.takeNotices("bob"))[0]).toMatchObject({ kind: "lease" });

    expect(await kinds(ops.writeSource("arch", src("late"), { actor: "alice" }))).toBe("conflict");
    await s.acquireLease({ actor: "bob", canvas: "arch" });
    await ops.writeSource("arch", src("bob-1"), bob);
    expect((await s.listChanges({ canvas: "arch" })).map((e) => e.actor)).toEqual(["alice", "alice", "bob"]);
    // releasing a lease nobody holds is not an error
    expect(await s.releaseLease({ actor: "alice", canvas: "nothing" })).toEqual({ released: false });
  });

  it("@task-13: a lease expires on its own, the holder can renew it, a human can force it free", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-lease-"));
    let t = 10_000;
    const s = createSettlement(LocalFilesystemCanvasStore(root), () => t);

    await s.acquireLease({ actor: "alice", canvas: "arch", ttlSeconds: 60 });
    t += 50_000;
    const renewed = await s.acquireLease({ actor: "alice", canvas: "arch", ttlSeconds: 60 });
    expect(renewed.expiresAt).toBe(t + 60_000);
    t += 59_000;
    await s.assertLease("arch", "alice"); // renewed, so still held
    t += 2_000; // now past the renewed expiry: a crashed agent does not hold the canvas
    expect(await kinds(s.assertLease("arch", "alice"))).toBe("conflict");
    expect(await s.listLeases()).toEqual([]);
    expect((await s.acquireLease({ actor: "bob", canvas: "arch" })).acquired).toBe(true);

    expect(await kinds(s.acquireLease({ actor: "bob", canvas: "arch", ttlSeconds: 99_999 }))).toBe("invalid");
    expect(await kinds(s.acquireLease({ actor: "bob" }))).toBe("invalid");
    expect(await kinds(s.releaseLease({ canvas: "arch" }))).toBe("invalid");
    await s.acquireLease({ actor: "carol", canvas: "arch" }); // waits behind bob
    await s.releaseLease({ canvas: "arch", actor: "basti", force: true });
    expect(await s.listLeases()).toEqual([]);
    expect((await s.takeNotices("bob")).map((n) => n.message).join("\n")).toContain("released by basti");
    expect((await s.takeNotices("carol"))[0]!.message).toContain("is free");
  });

  it("@task-14: over MCP a write is refused until the lease is acquired; a revert never overrides someone else's lease", async () => {
    const { ops, s } = await strict();
    const write = { id: "arch", source: src("x"), actor: "alice" };

    const refused = await callMcpTool(ops, "write_source", write);
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toContain("needs a lease");

    const got = await callMcpTool(ops, "acquire_lease", { actor: "alice", canvas: "arch", ttl_seconds: 120 });
    expect(JSON.parse(got.content[0]!.text)).toMatchObject({ acquired: true, holder: "alice" });
    expect((await callMcpTool(ops, "write_source", write)).isError).toBeFalsy();
    const listed = await callMcpTool(ops, "list_leases");
    expect(JSON.parse(listed.content[0]!.text)).toMatchObject([{ canvas: "arch", actor: "alice" }]);

    // alice's write is entry 1 (the refused create wrote nothing); bob holds the lease now
    await callMcpTool(ops, "release_lease", { actor: "alice", canvas: "arch" });
    await s.acquireLease({ actor: "bob", canvas: "arch" });
    const rolledBack = await s.revert([1], "basti");
    expect(rolledBack.skipped[0]!.reason).toBe("this write created the canvas");
    await ops.writeSource("arch", src("y"), { actor: "bob" });
    const second = (await s.listChanges({ canvas: "arch" })).at(-1)!;
    expect((await s.revert([second.n], "basti")).skipped[0]!.reason).toContain("is leased by bob");
    expect((await s.revert([second.n], "bob")).reverted).toEqual([second.n]);
  });
});
