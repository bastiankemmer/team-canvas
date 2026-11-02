import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../../adapters/store/local-fs-canvas-store.js";
import type { CanvasStore } from "../../ports/canvas-store.js";
import { bundleCanvas } from "../build/bundle-canvas.js";
import { sha } from "../settle/doc.js";
import { createCanvasEditOps, type CanvasBacklink } from "./canvas-edit-ops.js";
import { starterSource } from "./new-canvas.js";

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

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

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
    await ops.writeSource("foo/bar", "x");
    expect(await readFile(path.join(root, "foo", "bar.canvas.tsx"), "utf8")).toBe("x");
    await expect(ops.searchSource("..\\win", "x")).rejects.toThrow(
      /Invalid canvas id/,
    );
    expect(await readFile(path.join(root, "other.canvas.tsx"), "utf8")).toBe(
      otherBefore,
    );

    await expect(ops.searchSource("demo", "")).rejects.toThrow(/non-empty/i);
  });

  it("readSources maps each canvas to its source text and keeps a missing id as an error so the other reads still return", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-read-sources-"));
    const indexSource = "export default function Index() { return null }\n";
    const toolsSource = "export default function McpTools() { return null }\n";
    const indexFile = path.join(root, "team-canvas", "index.canvas.tsx");
    const toolsFile = path.join(root, "team-canvas", "reference", "mcp-tools.canvas.tsx");
    await mkdir(path.dirname(indexFile), { recursive: true });
    await mkdir(path.dirname(toolsFile), { recursive: true });
    await writeFile(indexFile, indexSource, "utf8");
    await writeFile(toolsFile, toolsSource, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    // An unsafe id is first: a throw there would drop the canvases that exist.
    const result = await ops.readSources([
      "../escape",
      "team-canvas/index",
      "team-canvas/reference/mcp-tools",
      "team-canvas/missing",
    ]);

    expect(result.sources["team-canvas/index"]).toEqual({ source: indexSource });
    expect(result.sources["team-canvas/reference/mcp-tools"]).toEqual({ source: toolsSource });
    expect(result.sources["team-canvas/missing"]).toEqual({
      error: expect.stringMatching(/^ENOENT: no such file or directory/),
    });
    expect(result.sources["../escape"]).toEqual({
      error: 'Invalid canvas id "../escape": must be a relative path of non-empty segments',
    });
    expect(await ops.readSource("team-canvas/index")).toBe(indexSource);
  });

  it("readSources keeps an id of __proto__ in the JSON map so that canvas source is not omitted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-read-proto-"));
    const source = "export default function Proto() { return null }\n";
    await writeFile(path.join(root, "__proto__.canvas.tsx"), source, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const result = await ops.readSources(["__proto__"]);
    const parsed = JSON.parse(JSON.stringify(result)) as {
      sources: Record<string, { source?: string }>;
    };
    expect(parsed.sources["__proto__"]).toEqual({ source });
  });

  it("createCanvas: starter compiles, custom source wins, blank source falls back, duplicates and bad ids are refused", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-create-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

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

    for (const bad of ["", "..", "../x", "a\\b", "-x", "_x", "a b", "a.b"]) {
      await expect(ops.createCanvas(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
    expect(await ops.listCanvases()).toHaveLength(3);
  });

  it('@task-2: createCanvas("notes/demo") writes notes/demo.canvas.tsx as NotesDemo with H1 notes/demo, and notes/edit is rejected', async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-create-nested-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const reserved = [
      "edit",
      "source",
      "state",
      "watch",
      "check",
      "replace",
      "search",
      "search-linked",
      "orientation",
      "add-oriented",
      "fill-slots",
      "links",
      "backlinks",
    ];

    expect(await ops.createCanvas("notes/demo")).toEqual({ ok: true, id: "notes/demo" });
    const starter = await readFile(path.join(root, "notes", "demo.canvas.tsx"), "utf8");
    expect(starter).toContain("export default function NotesDemo()");
    expect(starter).toContain("<H1>notes/demo</H1>");
    expect((await bundleCanvas({ source: starter })).ok).toBe(true);

    expect(await ops.createCanvas("a/b")).toEqual({ ok: true, id: "a/b" });
    expect(await readFile(path.join(root, "a", "b.canvas.tsx"), "utf8")).toContain(
      "export default function AB()",
    );

    await expect(ops.createCanvas("notes/a.b")).rejects.toThrow(/Invalid canvas id/);

    expect(await ops.createCanvas("notes/my-demo")).toEqual({
      ok: true,
      id: "notes/my-demo",
    });
    expect(await ops.readSource("notes/my-demo")).toContain(
      "export default function NotesMyDemo()",
    );

    expect(await ops.createCanvas("2go")).toEqual({ ok: true, id: "2go" });
    expect(await ops.readSource("2go")).toContain("export default function Canvas2go()");

    expect(await ops.createCanvas("n2")).toEqual({ ok: true, id: "n2" });
    const n2 = await ops.readSource("n2");
    expect(n2).toContain("export default function N2()");
    expect(n2).not.toContain("function CanvasN2()");

    expect(await ops.createCanvas("9/go")).toEqual({ ok: true, id: "9/go" });
    expect(await readFile(path.join(root, "9", "go.canvas.tsx"), "utf8")).toContain(
      "export default function Canvas9Go()",
    );

    for (const bad of ["../x", "-x", "a b"]) {
      await expect(ops.createCanvas(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
    for (const word of reserved) {
      await expect(ops.createCanvas(`notes/${word}`), word).rejects.toThrow(
        /Invalid canvas id/,
      );
      expect(await ops.createCanvas(word)).toEqual({ ok: true, id: word });
    }

    await ops.writeSource(
      "notes/edit",
      "export default function Hand() { return null }\n",
    );
    expect(await ops.listCanvases()).toContain("notes/edit");
    await expect(ops.createCanvas("notes/edit")).rejects.toThrow(/Invalid canvas id/);

    await expect(ops.createCanvas("notes/demo")).rejects.toThrow(/already exists/);
    expect(await readFile(path.join(root, "notes", "demo.canvas.tsx"), "utf8")).toBe(starter);
  });

  it("replaceInSource: swaps exact text, leaves the rest byte-identical, refuses missing or ambiguous matches unless replace_all", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-replace-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
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

  it("replaceInSource applies ordered edits in one write so a later miss cannot leave a half-edited canvas", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-replace-batch-"));
    const inner = LocalFilesystemCanvasStore(root);
    let writes = 0;
    const store: CanvasStore = {
      ...inner,
      writeSource: async (id, source) => {
        writes += 1;
        await inner.writeSource(id, source);
      },
    };
    const ops = createCanvasEditOps(store, { requireLease: false });
    await inner.writeSource("demo", "alpha beta");

    expect(
      await ops.replaceInSource("demo", [
        { old_string: "alpha", new_string: "beta" },
        { old_string: "beta beta", new_string: "gamma" },
      ]),
    ).toEqual({ ok: true, id: "demo", replacements: 2 });
    expect(await inner.readSource("demo")).toBe("gamma");
    expect(writes).toBe(1);

    await inner.writeSource("demo", "red red blue");
    writes = 0;
    expect(
      await ops.replaceInSource("demo", [
        { old_string: "red", new_string: "green", replace_all: true },
        { old_string: "green green", new_string: "done" },
      ]),
    ).toEqual({ ok: true, id: "demo", replacements: 3 });
    expect(await inner.readSource("demo")).toBe("done blue");
    expect(writes).toBe(1);

    await inner.writeSource("demo", "alpha beta");
    writes = 0;
    await expect(
      ops.replaceInSource("demo", [
        { old_string: "alpha", new_string: "beta" },
        { old_string: "missing", new_string: "nope" },
      ]),
    ).rejects.toThrow(/not found in canvas "demo"/);
    expect(await inner.readSource("demo")).toBe("alpha beta");
    expect(writes).toBe(0);

    await expect(ops.replaceInSource("demo", [])).rejects.toThrow(/non-empty/);
    expect(writes).toBe(0);
  });

  it("replaceInSource records the write as replace_in_source so the change log names the edit that landed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-replace-log-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await writeFile(path.join(root, "demo.canvas.tsx"), "alpha beta", "utf8");

    await ops.replaceInSource("demo", [{ old_string: "alpha", new_string: "gamma" }]);

    const log = await ops.settlement.listChanges({ canvas: "demo" });
    expect(log).toHaveLength(1);
    expect(log[0]!.tool).toBe("replace_in_source");
  });

  it("replaceInSource records the tool name replace_in_source so a blank name cannot stand in for that edit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-replace-tool-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await writeFile(path.join(root, "demo.canvas.tsx"), "alpha", "utf8");

    await ops.replaceInSource("demo", "alpha", "beta");

    const tools = (await ops.settlement.listChanges({ canvas: "demo" })).map((entry) => entry.tool);
    expect(tools).toContain("replace_in_source");
  });

  it("checkCanvas: ok for a good canvas; syntax error, bad import and missing default export come back as messages, not throws", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-check-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const put = (id: string, src: string) => writeFile(path.join(root, `${id}.canvas.tsx`), src, "utf8");
    await put("good", "export default function A() { return <div>ok</div> }\n");
    await put("syntax", "export default function A() {\n  return <div>\n}\n");
    await put("import", 'import x from "lodash"\nexport default function A() { return <div>{x}</div> }\n');
    await put("nodefault", "export function A() { return null }\n");

    expect(await ops.checkCanvas("good")).toEqual({ ok: true, id: "good" });
    const syntax = await ops.checkCanvas("syntax");
    expect(syntax).toMatchObject({ ok: false, id: "syntax" });
    expect(syntax.ok === false && syntax.error).toMatch(/^\d+:\d+ /);
    const imp = await ops.checkCanvas("import");
    expect(imp.ok === false && imp.error).toContain('Import "lodash" is not allowed');
    const nd = await ops.checkCanvas("nodefault");
    expect(nd.ok === false && nd.error).toContain("default-export");
    await expect(ops.checkCanvas("missing")).rejects.toThrow();
  });

  it("@task-2: listLinks returns one source-order link with line, label, and exists, or an empty array", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-links-"));
    const notes = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink to="billing">Billing</CanvasLink>',
      "  );",
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "notes.canvas.tsx"), notes, "utf8");
    await writeFile(
      path.join(root, "billing.canvas.tsx"),
      "export default function Billing() { return null }\n",
      "utf8",
    );
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    expect(await ops.listLinks("notes")).toEqual([
      { to: "billing", line: 3, label: "Billing", exists: true },
    ]);

    await ops.writeSource(
      "notes",
      "export default function Notes() { return <div>no links</div> }\n",
    );
    expect(await ops.listLinks("notes")).toEqual([]);
  });

  it("@task-2: listLinks fails with ENOENT when the canvas file is missing and with Invalid canvas id for empty, .., or backslash", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-links-err-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    await expect(ops.listLinks("notes")).rejects.toMatchObject({ code: "ENOENT" });
    for (const bad of ["", "..", "a\\b"]) {
      await expect(ops.listLinks(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
  });

  it("@task-2: listLinks keeps every safe literal tag in source order, including duplicates, self-links, dangling targets, and recovered JSX", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-links-scan-"));
    const notes = [
      'import { CanvasLink as X } from "team-canvas/canvas";',
      'const aside = <CanvasLink to="billing">Billing</CanvasLink>;',
      'const s = "<CanvasLink to=\\"ghost\\">Ghost</CanvasLink>";',
      'const id = "billing";',
      "export default function Notes() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="billing">  Hello {"there"}  </CanvasLink>',
      '      <CanvasLink to="../x">Bad</CanvasLink>',
      '      <CanvasLink to="">Empty</CanvasLink>',
      '      <CanvasLink to="missing">Gone</CanvasLink>',
      "      <CanvasLink to={id}>Dyn</CanvasLink>",
      "      <CanvasLink to={`missing`}>Tpl</CanvasLink>",
      '      <CanvasLink to={"mi" + "ssing"}>Cat</CanvasLink>',
      '      <CanvasLink {...{ to: "billing" }}>Spread</CanvasLink>',
      '      <CanvasLink to="billing">Second</CanvasLink>',
      '      <CanvasLink to="notes">Self</CanvasLink>',
      '      <CanvasLink to={"billing"}>Brace</CanvasLink>',
      "      <CanvasLink to={'billing'}>Squo</CanvasLink>",
      '      <CanvasLink to="billing" />',
      '      <CanvasLink to="billing"></CanvasLink>',
      '      <CanvasLink to="billing"><b>x</b></CanvasLink>',
      '      <CanvasLink to="billing">{id}</CanvasLink>',
      '      <CanvasLink to="billing"><>z</></CanvasLink>',
      '      <CanvasLink to="billing">{"  "}{"ok"}</CanvasLink>',
      '      <CanvasLink to="billing">   </CanvasLink>',
      '      <X to="billing">Alias</X>',
      '      <Foo.CanvasLink to="billing">Member</Foo.CanvasLink>',
      '      {createElement(CanvasLink, { to: "billing" }, "C")}',
      '      {/* <CanvasLink to="ghost">Ghost</CanvasLink> */}',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const broken = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink to="billing">Billing</CanvasLink>',
      "  ;",
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "notes.canvas.tsx"), notes, "utf8");
    await writeFile(
      path.join(root, "billing.canvas.tsx"),
      "export default function Billing() { return null }\n",
      "utf8",
    );
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const line = (needle: string) => {
      const i = notes.split("\n").findIndex((row) => row.includes(needle));
      expect(i, needle).toBeGreaterThanOrEqual(0);
      return i + 1;
    };

    expect(await ops.listLinks("notes")).toEqual([
      { to: "billing", line: line('const aside = <CanvasLink to="billing">Billing</CanvasLink>'), label: "Billing", exists: true },
      { to: "billing", line: line('Hello {"there"}'), label: "Hello there", exists: true },
      { to: "missing", line: line('to="missing"'), label: "Gone", exists: false },
      { to: "billing", line: line(">Second<"), label: "Second", exists: true },
      { to: "notes", line: line('to="notes"'), label: "Self", exists: true },
      { to: "billing", line: line('to={"billing"}>Brace'), label: "Brace", exists: true },
      { to: "billing", line: line("to={'billing'}>Squo"), label: "Squo", exists: true },
      { to: "billing", line: line('to="billing" />'), label: null, exists: true },
      { to: "billing", line: line('to="billing"></CanvasLink>'), label: null, exists: true },
      { to: "billing", line: line("<b>x</b>"), label: null, exists: true },
      { to: "billing", line: line(">{id}<"), label: null, exists: true },
      { to: "billing", line: line("<>z</>"), label: null, exists: true },
      { to: "billing", line: line('{"  "}{"ok"}'), label: "ok", exists: true },
      { to: "billing", line: line(">   <"), label: null, exists: true },
    ]);

    await writeFile(path.join(root, "notes.canvas.tsx"), broken, "utf8");
    expect(await ops.listLinks("notes")).toEqual([
      { to: "billing", line: 3, label: "Billing", exists: true },
    ]);
  });

  it("@task-3: backlinks lists a and c in store.list() order then source order, each with from, line, and label, and no exists field", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-backlinks-"));
    const a = [
      "export default function A() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="b">First</CanvasLink>',
      '      <CanvasLink to="z">Skip</CanvasLink>',
      '      <CanvasLink to="b">Second</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const c = [
      "export default function C() {",
      '  return <CanvasLink to="b">From C</CanvasLink>;',
      "}",
      "",
    ].join("\n");
    const lineOf = (source: string, needle: string) => {
      const i = source.split("\n").findIndex((row) => row.includes(needle));
      expect(i, needle).toBeGreaterThanOrEqual(0);
      return i + 1;
    };
    const perId: Record<string, Array<Omit<CanvasBacklink, "from">>> = {
      a: [
        { line: lineOf(a, ">First<"), label: "First" },
        { line: lineOf(a, ">Second<"), label: "Second" },
      ],
      c: [{ line: lineOf(c, "From C"), label: "From C" }],
    };
    await writeFile(path.join(root, "c.canvas.tsx"), c, "utf8");
    await writeFile(path.join(root, "a.canvas.tsx"), a, "utf8");
    await writeFile(
      path.join(root, "b.canvas.tsx"),
      "export default function B() { return null }\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "z.canvas.tsx"),
      'export default function Z() { return <CanvasLink to="a">Other</CanvasLink> }\n',
      "utf8",
    );

    const inner = LocalFilesystemCanvasStore(root);
    let listed: string[] = [];
    const store: CanvasStore = {
      list: async () => {
        listed = await inner.list();
        return listed;
      },
      readSource: (id) => inner.readSource(id),
      writeSource: (id, source) => inner.writeSource(id, source),
      readState: (id) => inner.readState(id),
      writeState: (id, state) => inner.writeState(id, state),
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    const result = await ops.backlinks("b");
    expect(result).toEqual(
      listed.flatMap((from) => (perId[from] ?? []).map((hit) => ({ from, ...hit }))),
    );
    const froms: string[] = [];
    for (const row of result) {
      if (froms.at(-1) !== row.from) froms.push(row.from);
    }
    expect(froms).toEqual(listed.filter((id) => id === "a" || id === "c"));
    for (const row of result) expect(row).not.toHaveProperty("exists");

    const self = [
      "export default function B() {",
      '  return <CanvasLink to="b">Self</CanvasLink>;',
      "}",
      "",
    ].join("\n");
    await ops.writeSource("b", self);
    const withSelf = await ops.backlinks("b");
    expect(withSelf).toContainEqual({
      from: "b",
      line: lineOf(self, "Self"),
      label: "Self",
    });
    expect(withSelf).toEqual(
      listed.flatMap((from) => {
        if (from === "b") {
          return [{ from: "b", line: lineOf(self, "Self"), label: "Self" }];
        }
        return (perId[from] ?? []).map((hit) => ({ from, ...hit }));
      }),
    );

    const blank = "export default function X() { return null }\n";
    for (const id of ["a", "b", "c", "z"]) await ops.writeSource(id, blank);
    expect(await ops.backlinks("b")).toEqual([]);
  });

  it("@task-3: backlinks fails with ENOENT when the canvas file is missing and with Invalid canvas id for empty, .., or backslash", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-backlinks-err-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    await expect(ops.backlinks("b")).rejects.toMatchObject({ code: "ENOENT" });
    for (const bad of ["", "..", "a\\b"]) {
      await expect(ops.backlinks(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
  });

  it("@task-3: backlinks skips a listed canvas that disappears with ENOENT and propagates any other read error", async () => {
    const enoent = Object.assign(new Error("no such file"), { code: "ENOENT" });
    const sources: Record<string, string> = {
      c: 'export default function C() {\n  return <CanvasLink to="b">From C</CanvasLink>;\n}\n',
      a: [
        "export default function A() {",
        "  return (",
        "    <div>",
        '      <CanvasLink to="b">First</CanvasLink>',
        '      <CanvasLink to="z">Skip</CanvasLink>',
        '      <CanvasLink to="b">Second</CanvasLink>',
        "    </div>",
        "  );",
        "}",
        "",
      ].join("\n"),
      b: [
        "export default function B() {",
        '  return <CanvasLink to="b">Self</CanvasLink>;',
        "}",
        "",
      ].join("\n"),
    };
    const order = ["c", "gone", "a", "b"];
    let boom: string | null = null;
    const store: CanvasStore = {
      list: async () => order,
      async readSource(id) {
        if (id === boom) {
          throw Object.assign(new Error("disk read failed"), { code: "EIO" });
        }
        if (id === "gone") throw enoent;
        const source = sources[id];
        if (source === undefined) throw enoent;
        return source;
      },
      writeSource: async () => {},
      readState: async () => null,
      writeState: async () => {},
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    expect(await ops.backlinks("b")).toEqual([
      { from: "c", line: 2, label: "From C" },
      { from: "a", line: 4, label: "First" },
      { from: "a", line: 6, label: "Second" },
      { from: "b", line: 2, label: "Self" },
    ]);

    boom = "a";
    await expect(ops.backlinks("b")).rejects.toThrow("disk read failed");

    boom = null;
    await expect(ops.backlinks("missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("@task-4: hits are only from b then e in first-seen order, each with that id, the 1-based line, and the full line", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-search-linked-"));
    const bLines = [
      'const code = "needle";',
      "export default function B() {",
      "  return (",
      "    <div>",
      '      <span className="needle">x</span>',
      "      Needle stays",
      '      <CanvasLink to="d">D</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ];
    const eLines = [
      "export default function E() {",
      "  return <code>needle</code>;",
      "}",
      "",
    ];
    const a = [
      "export default function A() {",
      "  return (",
      "    <div>",
      "      needle on a",
      '      <CanvasLink to="b">B</CanvasLink>',
      '      <CanvasLink to="ghost">Gone</CanvasLink>',
      '      <CanvasLink to="b">Again</CanvasLink>',
      '      <CanvasLink to="e">E</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const lineOf = (lines: string[], row: string) => {
      const i = lines.indexOf(row);
      expect(i, row).toBeGreaterThanOrEqual(0);
      return i + 1;
    };
    const codeLine = 'const code = "needle";';
    const tagLine = '      <span className="needle">x</span>';
    const eLine = "  return <code>needle</code>;";
    const expected = [
      { id: "b", line: lineOf(bLines, codeLine), snippet: codeLine },
      { id: "b", line: lineOf(bLines, tagLine), snippet: tagLine },
      { id: "e", line: lineOf(eLines, eLine), snippet: eLine },
    ];
    await writeFile(path.join(root, "a.canvas.tsx"), a, "utf8");
    await writeFile(path.join(root, "b.canvas.tsx"), bLines.join("\n"), "utf8");
    await writeFile(
      path.join(root, "c.canvas.tsx"),
      'export default function C() {\n  return <CanvasLink to="a">needle</CanvasLink>;\n}\n',
      "utf8",
    );
    await writeFile(
      path.join(root, "d.canvas.tsx"),
      "export default function D() {\n  return <div>needle</div>;\n}\n",
      "utf8",
    );
    await writeFile(path.join(root, "e.canvas.tsx"), eLines.join("\n"), "utf8");

    const inner = LocalFilesystemCanvasStore(root);
    let drop: string | null = null;
    const store: CanvasStore = {
      list: () => inner.list(),
      async readSource(id) {
        if (id === drop) {
          throw Object.assign(new Error("no such file"), { code: "ENOENT" });
        }
        return inner.readSource(id);
      },
      writeSource: (id, source) => inner.writeSource(id, source),
      readState: (id) => inner.readState(id),
      writeState: (id, state) => inner.writeState(id, state),
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    const hits = await ops.searchLinked("a", "needle");
    expect(hits).toEqual(expected);
    expect(hits.map((hit) => hit.id)).toEqual(["b", "b", "e"]);
    expect(hits.some((hit) => /Needle/.test(hit.snippet))).toBe(false);
    for (const absent of ["a", "c", "d", "ghost"]) {
      expect(hits.some((hit) => hit.id === absent), absent).toBe(false);
    }
    expect(hits.filter((hit) => hit.id === "b")).toHaveLength(2);

    drop = "e";
    expect(await store.list()).toContain("e");
    expect(await ops.searchLinked("a", "needle")).toEqual(
      expected.filter((hit) => hit.id !== "e"),
    );
    drop = null;

    expect(await ops.searchLinked("a", "zzzz-no-match")).toEqual([]);
    await expect(ops.searchLinked("a", "")).rejects.toThrow(
      "Search query must be non-empty",
    );

    await ops.writeSource(
      "a",
      "export default function A() { return <div>needle</div> }\n",
    );
    expect(await ops.searchLinked("a", "needle")).toEqual([]);

    await ops.writeSource(
      "a",
      'export default function A() { return <CanvasLink to="a">needle</CanvasLink> }\n',
    );
    expect(await ops.searchLinked("a", "needle")).toEqual([]);

    await expect(ops.searchLinked("missing", "needle")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("searchLinked throws Search query must be non-empty before it reads any target", async () => {
    const store: CanvasStore = {
      list: async () => ["a"],
      readSource: async () => "export default function A() { return null }\n",
      writeSource: async () => {},
      readState: async () => null,
      writeState: async () => {},
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    await expect(ops.searchLinked("a", "")).rejects.toThrow(
      "Search query must be non-empty",
    );
  });

  it("searchLinked skips an ENOENT target and propagates any other read error", async () => {
    const a = [
      "export default function A() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="b">B</CanvasLink>',
      '      <CanvasLink to="c">C</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const sources: Record<string, string> = {
      a,
      b: "needle on b\n",
      c: "needle on c\n",
    };
    let failId: string | null = null;
    let failErr: unknown = null;
    const store: CanvasStore = {
      list: async () => ["a", "b", "c"],
      async readSource(id) {
        if (id === failId) throw failErr;
        const source = sources[id];
        if (source === undefined) {
          throw Object.assign(new Error("nope"), { code: "ENOENT" });
        }
        return source;
      },
      writeSource: async () => {},
      readState: async () => null,
      writeState: async () => {},
    };
    const ops = createCanvasEditOps(store, { requireLease: false });
    const fromC = [{ id: "c", line: 1, snippet: "needle on c" }];

    failId = "b";
    failErr = Object.assign(new Error("nope"), { code: "ENOENT" });
    expect(await ops.searchLinked("a", "needle")).toEqual(fromC);

    failErr = new Error("disk");
    await expect(ops.searchLinked("a", "needle")).rejects.toThrow("disk");

    failErr = null;
    await expect(ops.searchLinked("a", "needle")).rejects.toBeNull();

    failErr = "nope";
    await expect(ops.searchLinked("a", "needle")).rejects.toBe("nope");
  });

  it('@task-8: the link to is "reference/mcp-tools" and exists is true', async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-folder-links-"));
    const workflow = [
      "export default function EditingWorkflow() {",
      '  const id = "reference/mcp-tools";',
      "  return (",
      "    <div>",
      '      <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>',
      '      <CanvasLink to="mcp-tools">Short</CanvasLink>',
      '      <CanvasLink to="format">Format</CanvasLink>',
      '      <CanvasLink to="">Empty</CanvasLink>',
      '      <CanvasLink to="/abs">Abs</CanvasLink>',
      "      <CanvasLink to={id}>Dyn</CanvasLink>",
      "      <CanvasLink to={`reference/mcp-tools`}>Tpl</CanvasLink>",
      '      <X to="reference/mcp-tools">Alias</X>',
      '      {createElement(CanvasLink, { to: "reference/mcp-tools" }, "C")}',
      '      <CanvasLink to="a\\b">Win</CanvasLink>',
      '      <CanvasLink to="..">Up</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const target = [
      "export default function McpTools() {",
      "  return (",
      "    <div>",
      "      needle",
      '      <CanvasLink to="reference/elsewhere">Else</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await ops.writeSource("guides/editing-workflow", workflow);
    await ops.writeSource("reference/mcp-tools", target);
    await ops.writeSource(
      "reference/elsewhere",
      "export default function Elsewhere() { return <div>needle</div> }\n",
    );
    await ops.writeSource(
      "spec/format",
      "export default function SpecFormat() { return <div>format body</div> }\n",
    );

    expect(workflow.includes("needle")).toBe(false);
    expect(await ops.listLinks("guides/editing-workflow")).toEqual([
      { to: "reference/mcp-tools", line: 5, label: "MCP tools", exists: true },
      { to: "mcp-tools", line: 6, label: "Short", exists: false },
      { to: "format", line: 7, label: "Format", exists: false },
    ]);

    expect(await ops.backlinks("reference/mcp-tools")).toEqual([
      { from: "guides/editing-workflow", line: 5, label: "MCP tools" },
    ]);

    const hits = await ops.searchLinked("guides/editing-workflow", "needle");
    expect(hits).toEqual([
      { id: "reference/mcp-tools", line: 4, snippet: "      needle" },
    ]);

    for (const bad of ["a\\b", ".."]) {
      await expect(ops.listLinks(bad), bad).rejects.toThrow(/Invalid canvas id/);
    }
  });

  it("returns folder ids sorted, and rejects a type that is not canvas or folder and a depth that is not a positive integer", async () => {
    const store = {
      list: async () => ["z/item", "a/item", "m/n/item"],
      readSource: async () => {
        throw new Error("no read");
      },
      writeSource: async () => {},
      readState: async () => ({}),
      writeState: async () => {},
    } satisfies CanvasStore;
    const ops = createCanvasEditOps(store, { requireLease: false });

    expect(await ops.listCanvases({ type: "folder" })).toEqual(["a", "m", "m/n", "z"]);
    expect(await ops.listCanvases({ type: "folder", depth: 1 })).toEqual(["a", "m", "z"]);
    await expect(ops.listCanvases({ type: "page" as "canvas" })).rejects.toThrow(
      'type must be "canvas" or "folder"',
    );
    for (const depth of [0, -1, 1.5]) {
      await expect(ops.listCanvases({ depth })).rejects.toThrow("depth must be a positive integer");
    }
  });

  it("requires an actor when leases stay on, and the actor checked is the one on the write", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-lease-"));
    await writeFile(path.join(root, "demo.canvas.tsx"), "old", "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));

    await expect(ops.writeSource("demo", "next")).rejects.toThrow(
      'A write needs an actor: pass actor, after acquire_lease on "demo"',
    );
    await ops.settlement.acquireLease({ actor: "ada", canvas: "demo" });
    await expect(ops.writeSource("demo", "next", { actor: "bob" })).rejects.toThrow(/leased by ada/);
    await ops.writeSource("demo", "next", { actor: "ada" });
    expect(await ops.readSource("demo")).toBe("next");
  });

  it("uses the starter source when the create source is empty or only whitespace, and keeps a non-blank source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-starter-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    await ops.createCanvas("fresh", "");
    await ops.createCanvas("blank", " \t\n");
    expect(await ops.readSource("fresh")).toBe(starterSource("fresh"));
    expect(await ops.readSource("blank")).toBe(starterSource("blank"));
    await ops.createCanvas("kept", "  export default () => null\n");
    expect(await ops.readSource("kept")).toBe("  export default () => null\n");
  });

  it("records a null before-image for a new canvas without reading it, and records the source replace already read", async () => {
    const files = new Map<string, string>();
    const state = new Map<string, unknown>();
    let reads = 0;
    const store: CanvasStore = {
      list: async () => [...files.keys()],
      readSource: async () => {
        reads += 1;
        if (reads > 1) throw new Error("reread");
        const hit = files.get("demo");
        if (hit === undefined) throw new Error("unread");
        return hit;
      },
      writeSource: async (id, source) => {
        files.set(id, source);
      },
      readState: async (id) => {
        if (!state.has(id)) {
          const err = new Error("ENOENT");
          (err as { code: string }).code = "ENOENT";
          throw err;
        }
        return state.get(id);
      },
      writeState: async (id, value) => {
        state.set(id, value);
      },
      updateState: async (id, update) => {
        state.set(id, await update(state.get(id)));
      },
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    await ops.createCanvas("fresh", "");
    expect(reads).toBe(0);
    expect(files.get("fresh")).toBe(starterSource("fresh"));
    const created = await ops.settlement.listChanges({ canvas: "fresh" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      tool: "create_canvas",
      canvas: "fresh",
      before: null,
      after: sha(starterSource("fresh")),
    });

    files.set("demo", "alpha beta");
    reads = 0;
    await ops.replaceInSource("demo", "alpha", "gamma");
    expect(reads).toBe(1);
    expect(files.get("demo")).toBe("gamma beta");
    const replaced = await ops.settlement.listChanges({ canvas: "demo" });
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({
      tool: "replace_in_source",
      before: sha("alpha beta"),
      after: sha("gamma beta"),
    });
  });

  it("records add_oriented and fill_slots as the tool names on the write", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-orient-log-"));
    const source = `export default function T() {
  return (
    <Stack>
      <Card>a</Card>
      <Card>b</Card>
    </Stack>
  );
}
`;
    await writeFile(path.join(root, "cards.canvas.tsx"), source, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const added = await ops.addOriented("cards");
    const filled = await ops.fillSlots("cards", { [added.slots[0]!.id]: "Z" });
    expect(filled.slots).toEqual([]);
    const tools = (await ops.settlement.listChanges({ canvas: "cards" })).map((entry) => entry.tool);
    expect(tools).toEqual(["add_oriented", "fill_slots"]);
  });

  it("refuses a move unless pathKind, moveCanvas, and moveDir are all set", async () => {
    const io = {
      list: async () => ["a"],
      readSource: async () => "s",
      writeSource: async () => {},
      readState: async () => ({}),
      writeState: async () => {},
      updateState: async () => {},
    };
    const opsOf = (extra: Partial<CanvasStore>) =>
      createCanvasEditOps({ ...io, ...extra }, { requireLease: false });
    await expect(
      opsOf({ moveCanvas: async () => {}, moveDir: async () => {} }).move("a", "b"),
    ).rejects.toThrow(/cannot move/);
    await expect(
      opsOf({ pathKind: async () => "canvas", moveDir: async () => {} }).move("a", "b"),
    ).rejects.toThrow(/cannot move/);
    await expect(
      opsOf({ pathKind: async () => "canvas", moveCanvas: async () => {} }).move("a", "b"),
    ).rejects.toThrow(/cannot move/);
  });

  it("renames a directory with moveDir and a canvas with moveCanvas, and passes match into the plan", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-move-branch-"));
    const sourceA = "export default function A() { return null }\n";
    const sourceB = "export default function B() { return null }\n";
    await mkdir(path.join(root, "notes"), { recursive: true });
    await writeFile(path.join(root, "notes", "a.canvas.tsx"), sourceA, "utf8");
    await writeFile(path.join(root, "notes", "b.canvas.tsx"), sourceB, "utf8");
    await writeFile(path.join(root, "notes", "keep.txt"), "stay\n", "utf8");
    await writeFile(path.join(root, "solo.canvas.tsx"), sourceA, "utf8");
    await mkdir(path.join(root, "box"), { recursive: true });
    await writeFile(path.join(root, "box", "a.canvas.tsx"), sourceA, "utf8");
    await writeFile(path.join(root, "box", "onlyTest.canvas.tsx"), sourceB, "utf8");

    const inner = LocalFilesystemCanvasStore(root);
    const calls: string[] = [];
    const reads: string[] = [];
    const store: CanvasStore = {
      ...inner,
      pathKind: (id) => inner.pathKind!(id),
      readSource: async (id) => {
        reads.push(id);
        return inner.readSource(id);
      },
      moveDir: async (from, to) => {
        calls.push(`dir ${from} ${to}`);
        await inner.moveDir!(from, to);
      },
      moveCanvas: async (from, to) => {
        calls.push(`canvas ${from} ${to}`);
        await inner.moveCanvas!(from, to);
      },
    };
    const ops = createCanvasEditOps(store, { requireLease: false });

    const folder = await ops.move("notes", "out", { folder: true });
    expect(folder).toEqual({
      ok: true,
      moved: [
        { from: "notes/a", to: "out/a" },
        { from: "notes/b", to: "out/b" },
      ],
    });
    expect(calls).toEqual(["dir notes out"]);
    expect(reads).toEqual(["notes/a", "notes/b"]);
    expect(await readFile(path.join(root, "out", "a.canvas.tsx"), "utf8")).toBe(sourceA);
    expect(await readFile(path.join(root, "out", "b.canvas.tsx"), "utf8")).toBe(sourceB);
    expect(await readFile(path.join(root, "out", "keep.txt"), "utf8")).toBe("stay\n");
    const logged = await ops.settlement.listChanges({});
    const byCanvas = new Map(logged.map((entry) => [entry.canvas, entry]));
    expect(byCanvas.get("out/a")).toMatchObject({
      tool: "move",
      canvas: "out/a",
      before: null,
      after: sha(sourceA),
    });
    expect(byCanvas.get("out/b")).toMatchObject({
      tool: "move",
      canvas: "out/b",
      before: null,
      after: sha(sourceB),
    });

    calls.length = 0;
    const one = await ops.move("solo", "proj/solo");
    expect(one).toEqual({ ok: true, moved: [{ from: "solo", to: "proj/solo" }] });
    expect(calls).toEqual(["canvas solo proj/solo"]);
    expect(await readFile(path.join(root, "proj", "solo.canvas.tsx"), "utf8")).toBe(sourceA);

    const matched = await ops.move("box", "picked", { match: "*Test.canvas.tsx" });
    expect(matched).toEqual({
      ok: true,
      moved: [{ from: "box/onlyTest", to: "picked/onlyTest" }],
    });
    expect(calls).toContain("canvas box/onlyTest picked/onlyTest");
    expect(calls.some((call) => call.startsWith("dir "))).toBe(false);
    expect(await readFile(path.join(root, "box", "a.canvas.tsx"), "utf8")).toBe(sourceA);
    expect(await readFile(path.join(root, "picked", "onlyTest.canvas.tsx"), "utf8")).toBe(sourceB);
  });

  it("limits a canvas list to a folder prefix and a depth, and rejects a folder that leaves the store, so an unfiltered list or an off-by-one depth is a different set", async () => {
    const store = {
      list: async () => [
        "ab",
        "notes/ab",
        "notes/n/item",
        "other/notes",
        "m/child",
        "m/n/item",
      ],
      readSource: async () => {
        throw new Error("no read");
      },
      writeSource: async () => {},
      readState: async () => ({}),
      writeState: async () => {},
    } satisfies CanvasStore;
    const ops = createCanvasEditOps(store, { requireLease: false });

    expect(await ops.listCanvases({ folder: "notes" })).toEqual(["notes/ab", "notes/n/item"]);
    expect(await ops.listCanvases({ folder: "notes", depth: 1 })).toEqual(["notes/ab"]);
    expect(await ops.listCanvases({ depth: 1 })).toEqual(["ab"]);
    expect(await ops.listCanvases({ folder: "m", type: "folder" })).toEqual(["m/n"]);
    expect(await ops.listCanvases({ folder: "m", depth: 1 })).toEqual(["m/child"]);
    await expect(ops.listCanvases({ folder: ".." })).rejects.toThrow(/Invalid canvas id/);
    await expect(ops.listCanvases({ folder: "a/../b" })).rejects.toThrow(/Invalid canvas id/);
  });

  it("logs write_source and the source that was replaced when the before image is omitted, so a blank tool name is not the write that landed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-write-log-"));
    const previous = "export default function Demo() { return null }\n";
    const next = "export default function Demo() { return <p>next</p> }\n";
    await writeFile(path.join(root, "demo.canvas.tsx"), previous, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    await ops.writeSource("demo", next);

    const [entry] = await ops.settlement.listChanges({ canvas: "demo" });
    expect(entry).toMatchObject({
      tool: "write_source",
      canvas: "demo",
      before: sha(previous),
      after: sha(next),
    });
    expect(await ops.readSource("demo")).toBe(next);
  });
});
