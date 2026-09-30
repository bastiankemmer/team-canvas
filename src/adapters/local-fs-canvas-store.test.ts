import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "./local-fs-canvas-store.js";

describe("LocalFilesystemCanvasStore", () => {
  it("@task-1: lists canvas ids, reads source, and round-trips sidecar state without HTTP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-"));
    const source = "export default function Demo() { return null }\n";
    await writeFile(path.join(root, "demo.canvas.tsx"), source, "utf8");
    await writeFile(
      path.join(root, "other.canvas.tsx"),
      "export default function Other() { return null }\n",
      "utf8",
    );

    const store = LocalFilesystemCanvasStore(root);

    const ids = await store.list();
    expect(ids).toEqual(expect.arrayContaining(["demo", "other"]));
    expect(ids).toHaveLength(2);

    expect(await store.readSource("demo")).toBe(source);

    const state = { count: 3, label: "ok" };
    await store.writeState("demo", state);
    expect(await store.readState("demo")).toEqual(state);
  });

  it("rejects canvas ids that escape the store root via path separators or ..", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-"));
    const store = LocalFilesystemCanvasStore(root);
    await expect(store.readSource("../etc/passwd")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeState("foo/bar", {})).rejects.toThrow(/Invalid canvas id/);
    await expect(store.readState("..\\windows")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.readSource("")).rejects.toThrow(/Invalid canvas id/);
  });

  it("mutation: list keeps only *.canvas.tsx ids; readSource is utf8", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-utf8-"));
    const source = 'export default function Demo() { return "café 🎨" }\n';
    await writeFile(path.join(root, "demo.canvas.tsx"), source, "utf8");
    await writeFile(path.join(root, "demo.canvas.data.json"), '{"x":1}', "utf8");
    await writeFile(path.join(root, "notes.txt"), "ignore", "utf8");
    await writeFile(path.join(root, "almost.canvas.ts"), "nope", "utf8");

    const store = LocalFilesystemCanvasStore(root);
    expect(await store.list()).toEqual(["demo"]);
    expect(await store.readSource("demo")).toBe(source);
    expect(await store.readSource("demo")).toContain("café");
  });
});
