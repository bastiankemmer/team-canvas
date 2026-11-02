import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { callMcpTool, MCP_TOOL_DEFS } from "@team-canvas/mcp";
import { projectCanvas } from "../packages/ai/index.js";
import { useCanvasAction } from "../packages/human/hooks.js";
import { collect, collectBySubject, extractFacts } from "../packages/ontology/index.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createCanvasEditOps } from "../src/app/edit/canvas-edit-ops.js";

const id = "notes/weekly";

// Defaults differ from the sidecar so a projection that runs the canvas, or
// that copies the default argument, cannot look like the edited values.
const source = [
  'import {',
  "  CanvasLink,",
  "  Checkbox,",
  "  Code,",
  "  H1,",
  "  H2,",
  "  H3,",
  "  Link,",
  "  Select,",
  "  Stack,",
  "  Table,",
  "  Text,",
  "  TextArea,",
  "  TextInput,",
  "  TodoList,",
  "  Toggle,",
  "  useCanvasState,",
  '} from "team-canvas/canvas";',
  "",
  "export default function Weekly() {",
  '  const skipped = "from a variable";',
  "  const [todos, setTodos] = useCanvasState(\"todos\", [",
  '    { id: "0", content: "default todo", status: "pending" },',
  "  ]);",
  '  const [name, setName] = useCanvasState("author", "");',
  '  const [notes, setNotes] = useCanvasState("notes", "");',
  "  const [done, setDone] = useCanvasState(\"done\", false);",
  "  const [flag, setFlag] = useCanvasState(\"flag\", true);",
  '  const [choice, setChoice] = useCanvasState("choice", "");',
  "  return (",
  "    <Stack gap={16}>",
  "      <H1>Weekly</H1>",
  '      <H2>{"Done"}</H2>',
  "      <H3>Blockers</H3>",
  "      <Text>Shipped the store.</Text>",
  '      <Text>{"Also literal."}</Text>',
  "      <Text>{skipped}</Text>",
  "      <Text>{`from a template`}</Text>",
  '      <Code>{"writeSource"}</Code>',
  '      <Link href={"https://example.test/notes"}>{"Notes"}</Link>',
  '      <CanvasLink to="team-canvas/knowledge-layers/phase-3">Phase 3</CanvasLink>',
  '      <Table headers={["Name", "Status"]} rows={[["Alpha", "done"]]} />',
  '      <Table headers={["Hidden", skipped]} rows={[["nope", "nope"]]} />',
  "      <Link href={`https://example.test/nope`}>Skipped</Link>",
  "      <TodoList todos={todos} />",
  "      <TextInput value={name} onChange={setName} />",
  "      <TextArea value={notes} onChange={setNotes} />",
  "      <Checkbox checked={done} onChange={setDone} />",
  "      <Toggle checked={flag} onChange={setFlag} />",
  "      <Select value={choice} onChange={setChoice} options={[]} />",
  "    </Stack>",
  "  );",
  "}",
  "",
].join("\n");

const state = {
  todos: [{ id: "1", content: "Ship the file", status: "completed" }],
  author: "Ada",
  notes: "Notes from Monday",
  done: true,
  flag: false,
  choice: "beta",
  ignored: "not on the canvas",
};

// The literal notes, nested in layout. Chart and button text sits inside
// those tags, so skipping only the tag name would still copy it.
const chromeSource = [
  'import {',
  "  BarChart,",
  "  Button,",
  "  CanvasLink,",
  "  Card,",
  "  Checkbox,",
  "  Code,",
  "  Grid,",
  "  H1,",
  "  H2,",
  "  H3,",
  "  LineChart,",
  "  Link,",
  "  PieChart,",
  "  Row,",
  "  Select,",
  "  Stack,",
  "  Table,",
  "  Text,",
  "  TextArea,",
  "  TextInput,",
  "  TodoList,",
  "  Toggle,",
  "  useCanvasState,",
  '} from "team-canvas/canvas";',
  "",
  "export default function Weekly() {",
  '  const sectionTitle = "computed-section";',
  '  const hiddenExpr = "hidden-expr";',
  '  const skipped = "from a variable";',
  "  const [todos, setTodos] = useCanvasState(\"todos\", [",
  '    { id: "0", content: "default todo", status: "pending" },',
  "  ]);",
  '  const [name, setName] = useCanvasState("author", "");',
  '  const [notes, setNotes] = useCanvasState("notes", "");',
  "  const [done, setDone] = useCanvasState(\"done\", false);",
  "  const [flag, setFlag] = useCanvasState(\"flag\", true);",
  '  const [choice, setChoice] = useCanvasState("choice", "");',
  "  return (",
  "    <Stack>",
  "      <Row>",
  "        <Grid>",
  "          <Card>",
  "            layout-only",
  "            <H1>Weekly</H1>",
  '            <H2>{"Done"}</H2>',
  "            <H3>Blockers</H3>",
  "            <Text>Shipped the store.</Text>",
  '            <Text>{"Also literal."}</Text>',
  "            <Text>{skipped}</Text>",
  "            <Text>{`from a template`}</Text>",
  "            <Text>Literal beside {hiddenExpr} end.</Text>",
  "            <H2>{sectionTitle}</H2>",
  '            <Code>{"writeSource"}</Code>',
  '            <Link href={"https://example.test/notes"}>{"Notes"}</Link>',
  '            <CanvasLink to="team-canvas/knowledge-layers/phase-3">Phase 3</CanvasLink>',
  '            <Table headers={["Name", "Status"]} rows={[["Alpha", "done"]]} />',
  '            <Table headers={["Hidden", skipped]} rows={[["nope", "nope"]]} />',
  "            <Link href={`https://example.test/nope`}>Skipped</Link>",
  "            <TodoList todos={todos} />",
  "            <TextInput value={name} onChange={setName} />",
  "            <TextArea value={notes} onChange={setNotes} />",
  "            <Checkbox checked={done} onChange={setDone} />",
  "            <Toggle checked={flag} onChange={setFlag} />",
  "            <Select value={choice} onChange={setChoice} options={[]} />",
  '            <BarChart categories={["chart-open"]} series={[{ name: "chart-closed", data: [1] }]}>',
  "              <Text>chart-open</Text>",
  "            </BarChart>",
  '            <LineChart categories={["chart-closed"]} series={[{ name: "chart-open", data: [1] }]}>',
  "              <H2>chart-closed</H2>",
  "            </LineChart>",
  '            <PieChart data={[{ label: "chart-open", value: 1 }, { label: "chart-closed", value: 2 }]}>',
  "              chart-open",
  "            </PieChart>",
  "            <Button>",
  "              <Text>Save notes</Text>",
  "            </Button>",
  '            <Text>{"Kept string literal"}</Text>',
  "          </Card>",
  "        </Grid>",
  "      </Row>",
  "    </Stack>",
  "  );",
  "}",
  "",
].join("\n");

describe("derived canvas markdown", () => {
  it("regenerates the markdown file beside a canvas from literal headings, paragraphs, code, links, tables, and edited sidecar values, so a hand edit is replaced, the canvas stays the source, a canvas action stays a no-op, and the other layers do not write that file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-derived-"));
    const store = LocalFilesystemCanvasStore(root);
    const folder = path.join(root, "notes");
    const mdPath = path.join(folder, "weekly.md");
    const expected = projectCanvas(source, state);

    await store.writeState(id, state);
    await store.writeSource(id, source);
    expect(await readFile(mdPath, "utf8")).toBe(expected);

    // A hand edit of the derived file must not survive the next source write,
    // and must not be written back onto the canvas.
    await writeFile(mdPath, "hand edit", "utf8");
    // The AI projection is a string. It does not write the file; the next source write does.
    projectCanvas(source, state);
    expect(await readFile(mdPath, "utf8")).toBe("hand edit");
    await store.writeSource(id, source);

    const md = await readFile(mdPath, "utf8");
    expect(md).toBe(expected);
    expect(md).not.toContain("hand edit");

    const lines = md.split("\n");
    expect(lines).toContain("# Weekly");
    expect(lines).toContain("## Done");
    expect(lines).toContain("### Blockers");
    expect(lines).toContain("Shipped the store.");
    expect(lines).toContain("Also literal.");
    expect(lines).toContain("`writeSource`");
    expect(lines).toContain("[Notes](https://example.test/notes)");
    expect(lines).toContain("[Phase 3](team-canvas/knowledge-layers/phase-3)");
    expect(lines).toContain("| Name | Status |");
    expect(lines).toContain("| --- | --- |");
    expect(lines).toContain("| Alpha | done |");
    expect(lines).toContain("Ship the file");
    expect(lines).toContain("completed");
    expect(lines).toContain("Ada");
    expect(lines).toContain("Notes from Monday");
    expect(lines).toContain("true");
    expect(lines).toContain("false");
    expect(lines).toContain("beta");

    // These strings exist only as code. Running them, or dumping the whole sidecar, would copy them in.
    expect(md).not.toContain("from a variable");
    expect(md).not.toContain("from a template");
    expect(md).not.toContain("https://example.test/nope");
    expect(md).not.toContain("Skipped");
    expect(md).not.toContain("default todo");
    expect(md).not.toContain("pending");
    expect(md).not.toContain("Hidden");
    expect(md).not.toContain("nope");
    expect(md).not.toContain("not on the canvas");

    const saved = await store.readSource(id);
    expect(saved).toBe(source);
    expect(saved).not.toContain("hand edit");
    expect(saved).not.toContain("| Alpha | done |");
    expect(saved).not.toContain("Ship the file");
    expect(await readFile(path.join(folder, "weekly.canvas.tsx"), "utf8")).toBe(source);
    expect(JSON.parse(await readFile(path.join(folder, "weekly.canvas.data.json"), "utf8"))).toEqual(
      state,
    );

    // The derived file sits beside the canvas and the sidecar, and it is not a canvas.
    expect(await store.list()).toEqual([id]);

    const mdBytes = await readFile(mdPath);
    const canvasBytes = await readFile(path.join(folder, "weekly.canvas.tsx"));
    const namesBefore = (await readdir(folder)).sort();

    // Ontology answers with Turtle from source strings. It does not open the store.
    expect(extractFacts(source)).toEqual([]);
    expect(collect([source], id)).toBe("");
    expect(collectBySubject([source], "notes")).toBe("");

    // Dispatch warns and returns. It does not rewrite the canvas or the derived file.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToStaticMarkup(
      createElement(function DispatchNotes() {
        const dispatch = useCanvasAction();
        dispatch({ type: "openAgent", agentId: "notes" });
        return null;
      }),
    );
    expect(warn.mock.calls.some((call) => /no-op/i.test(String(call[0])))).toBe(true);
    warn.mockRestore();

    // MCP still has the existing tools. Reading the canvas through them leaves the derived file alone.
    const toolNames = MCP_TOOL_DEFS.map((tool) => tool.name);
    expect(toolNames).toHaveLength(22);
    expect(toolNames).not.toContain("collect");
    expect(toolNames).not.toContain("read-area");
    const ops = createCanvasEditOps(store, { requireLease: false });
    const readBack = await callMcpTool(ops, "read_source", { id });
    expect(readBack.isError).toBe(false);
    expect(readBack.content[0]?.text).toBe(source);
    const unknown = await callMcpTool(ops, "read-area", { id });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]?.text).toContain("Unknown tool");

    expect(await readFile(mdPath)).toEqual(mdBytes);
    expect(await readFile(path.join(folder, "weekly.canvas.tsx"))).toEqual(canvasBytes);
    expect((await readdir(folder)).sort()).toEqual(namesBefore);
    expect(await store.list()).toEqual([id]);
  });

  it("omits charts, layout wrappers, controls, and non-literal expressions from the derived file, so the written notes stay and chrome text does not replace them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-derived-"));
    const store = LocalFilesystemCanvasStore(root);
    const mdPath = path.join(root, "notes", "weekly.md");
    // Exact text: a placeholder for an omitted chart, layout node, or button is an extra line.
    const expected = [
      "# Weekly",
      "## Done",
      "### Blockers",
      "Shipped the store.",
      "Also literal.",
      "Literal beside end.",
      "`writeSource`",
      "[Notes](https://example.test/notes)",
      "[Phase 3](team-canvas/knowledge-layers/phase-3)",
      "| Name | Status |\n| --- | --- |\n| Alpha | done |",
      "Ship the file\ncompleted",
      "Ada",
      "Notes from Monday",
      "true",
      "false",
      "beta",
      "Kept string literal",
    ].join("\n\n") + "\n";

    await store.writeState(id, state);
    await store.writeSource(id, chromeSource);

    const md = await readFile(mdPath, "utf8");
    expect(md).toBe(projectCanvas(chromeSource, state));
    expect(md).toBe(expected);
    expect(md).toContain("# Weekly");
    expect(md).toContain("Shipped the store.");
    expect(md).toContain("`writeSource`");
    expect(md).toContain("[Notes](https://example.test/notes)");
    expect(md).toContain("| Alpha | done |");
    expect(md).toContain("Ship the file");
    expect(md).toContain("Ada");
    expect(md).toContain("Literal beside");
    expect(md).toContain("end.");
    expect(md).toContain("Kept string literal");

    // These strings are the chart labels, the button label, and the only
    // initializers of the skipped expressions. Copying the tag, descending
    // into it, or running the expression would put them in the file.
    for (const absent of [
      "chart-open",
      "chart-closed",
      "Save notes",
      "computed-section",
      "hidden-expr",
      "layout-only",
      "Stack",
      "Row",
      "Grid",
      "Card",
      "BarChart",
      "LineChart",
      "PieChart",
      "Button",
    ]) {
      expect(md).not.toContain(absent);
    }

    const saved = await store.readSource(id);
    expect(saved).toBe(chromeSource);
    expect(saved).toContain("chart-open");
    expect(saved).toContain("Save notes");
    expect(saved).toContain("computed-section");
  });

  it("projects a Callout body of literal text the same way as Text, so a sentence that is not a Text node still lands in the derived file", async () => {
    const sentence = "Phase 3 is active. A canvas write regenerates id.md.";
    const skipped = '  const skipped = "from a variable";';
    const callout = [
      'import { Callout, Stack } from "team-canvas/canvas";',
      "export default function Note() {",
      skipped,
      "  return (",
      "    <Stack>",
      `      <Callout tone="success" title="Note">${sentence}</Callout>`,
      '      <Callout>{"Also literal."}</Callout>',
      "      <Callout>{skipped}</Callout>",
      "      <Callout>{`from a template`}</Callout>",
      "    </Stack>",
      "  );",
      "}",
      "",
    ].join("\n");
    const asText = [
      'import { Stack, Text } from "team-canvas/canvas";',
      "export default function Note() {",
      skipped,
      "  return (",
      "    <Stack>",
      `      <Text>${sentence}</Text>`,
      '      <Text>{"Also literal."}</Text>',
      "      <Text>{skipped}</Text>",
      "      <Text>{`from a template`}</Text>",
      "    </Stack>",
      "  );",
      "}",
      "",
    ].join("\n");
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-callout-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource("notes/callout", callout);

    const md = await readFile(path.join(root, "notes/callout.md"), "utf8");
    expect(md).toBe(projectCanvas(asText, {}));
    expect(md).toBe(`${sentence}\n\nAlso literal.\n`);
    expect(md).not.toContain("from a variable");
    expect(md).not.toContain("from a template");
    expect(md).not.toContain("Note");
    expect(md).not.toContain("success");
    expect(md).not.toContain("Stack");
    expect(await store.readSource("notes/callout")).toBe(callout);
  });
});
