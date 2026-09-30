import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../../adapters/store/local-fs-canvas-store.js";
import { bundleCanvas } from "../build/bundle-canvas.js";
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

  it("createCanvas: starter compiles, custom source wins, blank source falls back, duplicates and bad ids are refused", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-create-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));

    expect(await ops.createCanvas("team-notes")).toEqual({ ok: true, id: "team-notes" });
    const starter = await ops.readSource("team-notes");
    expect(starter).toContain("export default function TeamNotes()");
    expect(starter).toContain("<H1>team-notes</H1>");
    const bundled = await bundleCanvas({ source: starter });
    expect(bundled.ok, bundled.ok ? "" : bundled.error).toBe(true);

    await ops.createCanvas("2024", "   \n");
    expect(await ops.readSource("2024")).toContain("export default function Canvas2024()");

    await ops.createCanvas("given", "export default () => null\n");
    expect(await ops.readSource("given")).toBe("export default () => null\n");

    await expect(ops.createCanvas("given", "other")).rejects.toThrow(/already exists/);
    expect(await ops.readSource("given")).toBe("export default () => null\n");
    expect((await ops.listCanvases()).sort()).toEqual(["2024", "given", "team-notes"]);

    for (const bad of ["", "..", "../x", "a/b", "a\\b", "-x", "_x", "a b", "a.b"]) {
      await expect(ops.createCanvas(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
    expect(await ops.listCanvases()).toHaveLength(3);
  });

  it("replaceInSource: swaps exact text, leaves the rest byte-identical, refuses missing or ambiguous matches unless replace_all", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-replace-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));
    const big = "// header\n" + "const filler = 1;\n".repeat(5000);
    const original = `${big}<Text>Alpha</Text>\n<Text>Beta</Text>\n<Text>Beta</Text>\n${big}`;
    await writeFile(path.join(root, "big.canvas.tsx"), original, "utf8");
    const read = () => readFile(path.join(root, "big.canvas.tsx"), "utf8");

    // Unique match: only that text changes, everything else identical.
    expect(await ops.replaceInSource("big", "<Text>Alpha</Text>", "<Text>Alpha 2</Text>")).toEqual({
      ok: true,
      id: "big",
      replacements: 1,
    });
    expect(await read()).toBe(original.replace("<Text>Alpha</Text>", "<Text>Alpha 2</Text>"));

    // Ambiguous: refused, file untouched, message says how to fix.
    const before = await read();
    await expect(ops.replaceInSource("big", "<Text>Beta</Text>", "<Text>B</Text>")).rejects.toThrow(
      /matches 2 places.*replace_all/,
    );
    expect(await read()).toBe(before);

    // Missing text and empty old string: refused, file untouched.
    await expect(ops.replaceInSource("big", "nope-not-here", "x")).rejects.toThrow(/not found in canvas "big"/);
    await expect(ops.replaceInSource("big", "", "x")).rejects.toThrow(/non-empty/);
    expect(await read()).toBe(before);

    // replace_all handles every match; "$&" style text in the replacement is literal.
    expect(
      await ops.replaceInSource("big", "<Text>Beta</Text>", "<Text>$&$1</Text>", true),
    ).toEqual({ ok: true, id: "big", replacements: 2 });
    expect((await read()).match(/<Text>\$&\$1<\/Text>/g)).toHaveLength(2);

    // Empty new string deletes the text.
    await ops.replaceInSource("big", "<Text>Alpha 2</Text>\n", "");
    expect(await read()).not.toContain("Alpha 2");
    expect(await read()).toContain("<Text>$&$1</Text>");

    // Unknown canvas and unsafe id are errors, nothing is created.
    await expect(ops.replaceInSource("ghost", "a", "b")).rejects.toThrow();
    await expect(ops.replaceInSource("../x", "a", "b")).rejects.toThrow(/Invalid canvas id/);
    expect(await ops.listCanvases()).toEqual(["big"]);
  });
});
