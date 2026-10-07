import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../../adapters/store/local-fs-canvas-store.js";
import { callMcpTool } from "../../adapters/mcp/mcp-server.js";
import { createCanvasEditOps } from "./canvas-edit-ops.js";
import type { CanvasStore } from "../../ports/canvas-store.js";

const SOURCE = "export default function Demo() { return null }\n";

async function canvas(root: string, id: string, source = SOURCE): Promise<void> {
  const file = path.join(root, `${id}.canvas.tsx`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
}

describe("move", () => {
  it("moves one canvas with its state, a whole folder, or a filename glob", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-move-"));
    await canvas(root, "index");
    await writeFile(path.join(root, "index.canvas.data.json"), JSON.stringify({ n: 1 }), "utf8");
    await canvas(root, "notes/a");
    await canvas(root, "notes/aTest", "export default function ATest() { return null }\n");
    await mkdir(path.join(root, "notes"), { recursive: true });
    await writeFile(path.join(root, "notes/keep.txt"), "stay\n", "utf8");
    await canvas(root, "box/a");
    await canvas(root, "box/onlyTest");

    const store = LocalFilesystemCanvasStore(root);
    const ops = createCanvasEditOps(store, { requireLease: false });
    await expect(createCanvasEditOps(store).move("index", "proj/index")).rejects.toThrow(/actor/);

    const one = await callMcpTool(ops, "move", { from: "index", to: "proj/index", actor: "ada" });
    expect(one.isError).toBeFalsy();
    expect(JSON.parse(one.content[0]!.text)).toEqual({
      ok: true,
      moved: [{ from: "index", to: "proj/index" }],
    });
    expect(await store.readSource("proj/index")).toBe(SOURCE);
    expect(await store.readState("proj/index")).toEqual({ n: 1 });
    await expect(store.readSource("index")).rejects.toThrow(/ENOENT/);

    const glob = await ops.move("box", "out", { match: "*Test.canvas.tsx" });
    expect(glob.moved).toEqual([{ from: "box/onlyTest", to: "out/onlyTest" }]);
    expect(await store.readSource("box/a")).toBe(SOURCE);
    expect(await store.readSource("out/onlyTest")).toBe(SOURCE);

    const folder = await ops.move("notes", "proj/notes", { folder: true });
    expect(folder.moved).toEqual([
      { from: "notes/a", to: "proj/notes/a" },
      { from: "notes/aTest", to: "proj/notes/aTest" },
    ]);
    expect(await readFile(path.join(root, "proj/notes/keep.txt"), "utf8")).toBe("stay\n");
    await expect(readFile(path.join(root, "notes/keep.txt"), "utf8")).rejects.toThrow(/ENOENT/);

    await canvas(root, "dual");
    await canvas(root, "dual/child");
    expect((await ops.move("dual", "proj/dual")).moved).toEqual([{ from: "dual", to: "proj/dual" }]);
    expect((await ops.move("dual", "proj/dual-dir", { folder: true })).moved).toEqual([
      { from: "dual/child", to: "proj/dual-dir/child" },
    ]);

    await mkdir(path.join(root, "empty"));
    expect((await ops.move("empty", "proj/empty")).moved).toEqual([]);
    await mkdir(path.join(root, "occupied"));
    await expect(ops.move("box", "occupied", { folder: true })).rejects.toThrow(/already exists/);
    await writeFile(path.join(root, "plain"), "x", "utf8");
    await expect(store.moveDir!("plain", "proj/plain")).rejects.toThrow(/not a folder/);
    await expect(store.moveDir!("missing-dir", "proj/missing-dir")).rejects.toThrow(/does not exist/);
    await expect(store.moveDir!("box", "box")).rejects.toThrow(/into itself/);
    await symlink(path.join(root, "box"), path.join(root, "linked"));
    await expect(store.moveDir!("linked", "proj/linked")).rejects.toThrow(/not a folder/);

    const bare = createCanvasEditOps({
      list: async () => [],
      readSource: async () => "",
      writeSource: async () => {},
      readState: async () => ({}),
      writeState: async () => {},
    } as CanvasStore);
    await expect(bare.move("a", "b")).rejects.toThrow(/cannot move/);

    await expect(ops.move("../x", "proj/x")).rejects.toThrow(/Invalid canvas id/);
    await expect(ops.move("box", "box/inner", { folder: true })).rejects.toThrow(/into itself/);
    await expect(ops.move("missing", "gone")).rejects.toThrow(/Nothing at/);
    await expect(ops.move("proj/index", "elsewhere", { folder: true })).rejects.toThrow(/not a folder/);
    await expect(ops.move("box", "out", { match: "" })).rejects.toThrow(/match must be non-empty/);
    await expect(ops.move("box/a", "box/a")).rejects.toThrow(/already at/);
    await canvas(root, "taken");
    await expect(ops.move("box/a", "taken")).rejects.toThrow(/already exists/);

    const logRoot = await mkdtemp(path.join(tmpdir(), "team-canvas-move-log-"));
    await canvas(logRoot, "one");
    await canvas(logRoot, "two");
    const inner = LocalFilesystemCanvasStore(logRoot);
    let logs = 0;
    const failing = {
      ...inner,
      updateState: async () => {
        logs += 1;
        throw logs === 1 ? new Error("log down") : "log down";
      },
    };
    const logged = createCanvasEditOps(failing, { requireLease: false });
    expect((await logged.move("one", "moved/one")).moved).toEqual([{ from: "one", to: "moved/one" }]);
    expect((await logged.move("two", "moved/two")).moved).toEqual([{ from: "two", to: "moved/two" }]);
    expect(await inner.readSource("moved/one")).toBe(SOURCE);
  });
});
