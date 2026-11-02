import { describe, expect, it } from "vitest";
import { projectCanvas } from "../packages/ai/index.js";

// Decoy bindings come after the real ones. A wider match would point `name` at a key
// the sidecar does not have, and the edited author would disappear.
const source = [
  "export default function Weekly() {",
  '  const [todos, setTodos] = useCanvasState("todos", []);',
  '  const [name, setName] = useCanvasState("author", "");',
  '  const [notes, setNotes] = useCanvasState("notes", "");',
  '  const [done, setDone] = useCanvasState("done", false);',
  '  const [flag, setFlag] = useCanvasState("flag", true);',
  '  const [choice, setChoice] = useCanvasState("choice", "");',
  '  const skipped = "from a variable";',
  '  function later([name] = useCanvasState("nope")) {',
  '    const [name, setName] = useOther("nope", "");',
  '    const [name, setName] = useCanvasState(dynamic, "");',
  "  }",
  "  return (",
  "    <Stack>",
  "      <H1 />",
  "      <Text />",
  "      <H1>Weekly</H1>",
  '      <H2>{"Done"}</H2>',
  "      <H3>Blockers</H3>",
  "      <Text>  padded  </Text>",
  '      <Text>{"Alpha"}{"Beta"}</Text>',
  '      <Text>{"A"}{" "}{"B"}</Text>',
  '      <Text>Fish &amp; chips &lt;b&gt; &quot;hi&quot; it&apos;s &#65; &#x42;</Text>',
  "      <Text>See <Code>saveFile</Code> now.</Text>",
  "      <Text>{skipped}</Text>",
  "      <Text>Literal beside {skipped} end.</Text>",
  '      <Code>{"writeSource"}</Code>',
  "      <Code></Code>",
  "      <Code>   </Code>",
  '      <Link {...extra} id="nope" href={"https://example.test/notes"}>{"Notes"}</Link>',
  '      <CanvasLink to="team-canvas/knowledge-layers/phase-3">Phase 3</CanvasLink>',
  "      <Link>Skipped label</Link>",
  '      <Table headers={["Name", "Status"]} rows={[["Alpha", "done"]]} />',
  "      <TodoList {...extra} todos={todos} />",
  "      <TodoList todos={missing} />",
  "      <TodoList todos />",
  "      <TextInput {...extra} value={name} onChange={setName} />",
  "      <TextInput value={missing} />",
  "      <TextInput value />",
  "      <Link href>Dropped</Link>",
  "      <TextArea value={notes} onChange={setNotes} />",
  "      <Select value={choice} onChange={setChoice} options={[]} />",
  "      <Checkbox checked={done} onChange={setDone} />",
  "      <Toggle checked={flag} onChange={setFlag} />",
  "      <TextInput />",
  '      <Callout tone="success" title="aside-title">Phase 3 is active.</Callout>',
  "      <BarChart><Text>chart-bar</Text></BarChart>",
  "      <LineChart><Text>chart-line</Text></LineChart>",
  "      <PieChart><Text>chart-pie</Text></PieChart>",
  "      <UsageBar><Text>chart-usage</Text></UsageBar>",
  "      <DiffStats><Text>chart-diffstats</Text></DiffStats>",
  "      <DiffView><Text>chart-diffview</Text></DiffView>",
  "      <Stat><Text>chart-stat</Text></Stat>",
  "      <Swatch><Text>chart-swatch</Text></Swatch>",
  "      <Button><Text>chart-button</Text></Button>",
  "      <Pill><Text>chart-pill</Text></Pill>",
  "      <IconButton><Text>chart-icon</Text></IconButton>",
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
};

const notes = [
  "# Weekly",
  "## Done",
  "### Blockers",
  "padded",
  "AlphaBeta",
  "A B",
  `Fish & chips <b> "hi" it's A B`,
  "See saveFile now.",
  "Literal beside end.",
  "writeSource",
  "[Notes](https://example.test/notes)",
  "[Phase 3](team-canvas/knowledge-layers/phase-3)",
  "| Name | Status |\n| --- | --- |\n| Alpha | done |",
  "Ship the file\ncompleted",
  "Ada",
  "Notes from Monday",
  "beta",
  "true",
  "false",
  "Phase 3 is active.",
].join("\n\n") + "\n";

describe("canvas markdown projection", () => {
  it("projects literal headings, sentences, links, tables, todos, and edited values, so a placeholder string or a skipped tag is a different document", () => {
    const md = projectCanvas(source, state);
    expect(md).toBe(notes);
    for (const absent of [
      "from a variable",
      "Skipped label",
      "Dropped",
      "aside-title",
      "success",
      "nope",
      "chart-bar",
      "chart-line",
      "chart-pie",
      "chart-usage",
      "chart-diffstats",
      "chart-diffview",
      "chart-stat",
      "chart-swatch",
      "chart-button",
      "chart-pill",
      "chart-icon",
      "Stryker was here!",
      "`writeSource`",
    ]) {
      expect(md).not.toContain(absent);
    }
  });

  it("returns an empty document when there are no notes, and ignores state that is not an own plain object, so inherited or missing values are not written", () => {
    expect(projectCanvas("export default function X(){return null}\n")).toBe("");
    expect(projectCanvas(null)).toBe("");
    expect(projectCanvas(undefined)).toBe("");

    for (const ignored of [null, 1, [], Object.create({ author: "Ada", notes: "Notes from Monday" })]) {
      const md = projectCanvas(source, ignored);
      expect(md).toContain("# Weekly");
      expect(md).not.toContain("Ada");
      expect(md).not.toContain("Notes from Monday");
      expect(md).not.toContain("Ship the file");
    }

    const leaky = { ...state, undefined: "leaked" };
    const md = projectCanvas(source, leaky);
    expect(md).toContain("Ada");
    expect(md).not.toContain("leaked");

    // A function can own properties. It is still not the sidecar object.
    const fn = () => {};
    fn.author = "Ada";
    fn.notes = "Notes from Monday";
    const fromFn = projectCanvas(source, fn);
    expect(fromFn).toContain("# Weekly");
    expect(fromFn).not.toContain("Ada");
    expect(fromFn).not.toContain("Notes from Monday");
  });

  it("decodes scalar character references and writes only real tables, string todo fields, and finite numbers, so an invalid code point, a missing expression, or a non-value cannot change the notes", () => {
    const skipped = "from a variable";
    const edge = [
      "export default function Edge() {",
      `  const skipped = ${JSON.stringify(skipped)};`,
      '  const [todos, setTodos] = useCanvasState("todos", []);',
      '  const [count, setCount] = useCanvasState("count", 0);',
      '  const [bad, setBad] = useCanvasState("bad", 0);',
      '  const [huge, setHuge] = useCanvasState("huge", 0);',
      '  const [label, setLabel] = useCanvasState("label", "");',
      '  const [blank, setBlank] = useCanvasState("blank", "");',
      "  return (",
      "    <Stack>",
      "      <Text>&#X41;&#xD7FF;&#xD800;&#xDFFF;&#xE000;&#X10FFFF;&#x110000;</Text>",
      "      <Text>Hello {}</Text>",
      "      <Text>See <Code /> now.</Text>",
      "      <Text>Before <H1>Nope</H1> after</Text>",
      "      <Callout>Keep <H2>Nested</H2></Callout>",
      '      <Table headers={["A", "B"]} rows={[["a|b", "hello\\nworld"]]} />',
      '      <Table headers={["C", "D"]} rows={[["only"]]} />',
      '      <Table headers={[]} rows={[["x"]]} />',
      '      <Table rows={[["x"]]} />',
      '      <Table headers={"Name"} rows={[["x"]]} />',
      '      <Table headers={["Name", skipped]} rows={[["x", "y"]]} />',
      '      <Table headers={["Name"]} />',
      '      <Table headers={["Name"]} rows={skipped} />',
      '      <Table headers={["Name"]} rows={[[skipped]]} />',
      "      <TodoList todos={todos} />",
      "      <TextInput value={count} />",
      "      <TextInput value={bad} />",
      "      <TextInput value={huge} />",
      "      <TextInput value={label} />",
      "      <TextInput value={blank} />",
      "    </Stack>",
      "  );",
      "}",
      "",
    ].join("\n");
    const entities =
      "A" +
      String.fromCodePoint(0xd7ff) +
      "&#xD800;&#xDFFF;" +
      String.fromCodePoint(0xe000) +
      String.fromCodePoint(0x10ffff) +
      "&#x110000;";
    const md = projectCanvas(edge, {
      todos: [
        null,
        1,
        { content: "Ship", status: 2 },
        { content: 3, status: "open" },
        { content: "Only words" },
      ],
      count: 0,
      bad: NaN,
      huge: Infinity,
      label: null,
      blank: "",
    });
    expect(md).toBe(
      [
        entities,
        "Hello",
        "See now.",
        "Before after",
        "Keep",
        "| A | B |\n| --- | --- |\n| a\\|b | hello world |",
        "| C | D |\n| --- | --- |\n| only |  |",
        "Ship\nopen\nOnly words",
        "0",
      ].join("\n\n") + "\n",
    );
    expect(edge).not.toContain("Stryker was here!");
    expect(md).not.toContain("Stryker was here!");
    for (const absent of ["Nope", "Nested", "Name", "NaN", "Infinity", "null", skipped, "2", "3"]) {
      expect(md).not.toContain(absent);
    }
  });
});
