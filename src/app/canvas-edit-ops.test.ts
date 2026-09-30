import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../adapters/local-fs-canvas-store.js";
import { createCanvasEditOps } from "./canvas-edit-ops.js";

describe("canvas edit ops", () => {
  it("@task-1: readSource returns full source, writeSource replaces disk, searchSource returns line and snippet, unsafe ids rejected, empty query fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-edit-"));
    const original = [
      "export default function Demo() {",
      '  return <div className="needle-here">ok</div>',
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "demo.canvas.tsx"), original, "utf8");
    await writeFile(
      path.join(root, "other.canvas.tsx"),
      "export default function Other() { return null }\n",
      "utf8",
    );

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));

    // readSource must return store content (BlockStatement→{} would yield undefined).
    const read = await ops.readSource("demo");
    expect(read).toBe(original);
    expect(typeof read).toBe("string");
    expect(read.length).toBeGreaterThan(0);

    const replacement =
      'export default function Demo() { return <span>rewritten</span> }\n';
    await ops.writeSource("demo", replacement);
    expect(
      await readFile(path.join(root, "demo.canvas.tsx"), "utf8"),
    ).toBe(replacement);

    await ops.writeSource("demo", original);
    const hits = await ops.searchSource("demo", "needle-here");
    expect(hits).toEqual([
      { line: 2, snippet: '  return <div className="needle-here">ok</div>' },
    ]);

    const otherBefore = await readFile(
      path.join(root, "other.canvas.tsx"),
      "utf8",
    );
    await expect(ops.readSource("../escape")).rejects.toThrow(/Invalid canvas id/);
    await expect(ops.writeSource("foo/bar", "x")).rejects.toThrow(
      /Invalid canvas id/,
    );
    await expect(ops.searchSource("..\\win", "x")).rejects.toThrow(
      /Invalid canvas id/,
    );
    expect(await readFile(path.join(root, "other.canvas.tsx"), "utf8")).toBe(
      otherBefore,
    );

    await expect(ops.searchSource("demo", "")).rejects.toThrow(/non-empty/i);
  });
});
