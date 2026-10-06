import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../../adapters/store/local-fs-canvas-store.js";
import { bundleCanvas } from "../build/bundle-canvas.js";
import { createCanvasEditOps } from "./canvas-edit-ops.js";
import {
  addOrientedSibling,
  applySlotFills,
  inspectSourceOrientation,
  pendingSlots,
  slotIdsFromSource,
} from "./canvas-orientation.js";

const TWO_CARDS = `import { Button, Card, CardBody, CardHeader, Stack, Text } from "team-canvas/canvas";

function onAct() {}

export default function OrientedDemo() {
  return (
    <Stack gap={8}>
      <Card>
        <CardHeader>Alpha</CardHeader>
        <CardBody>
          <Text>Body alpha</Text>
          <Button onClick={onAct}>Go alpha</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>Beta</CardHeader>
        <CardBody>
          <Text>Body beta</Text>
          <Button onClick={onAct}>Go beta</Button>
        </CardBody>
      </Card>
    </Stack>
  );
}
`;

const NO_PATTERN = `import { Card, CardBody, Stack, Text } from "team-canvas/canvas";

export default function Solo() {
  return (
    <Stack>
      <Card>
        <CardBody>
          <Text>Only one</Text>
        </CardBody>
      </Card>
    </Stack>
  );
}
`;

describe("canvas oriented edit", () => {
  it("@task-2: inspectOrientation reports kind and Add; addOriented clones blank sibling slots; fillSlots writes values; no pattern / bad slots leave source unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-orient-"));
    await writeFile(path.join(root, "cards.canvas.tsx"), TWO_CARDS, "utf8");
    await writeFile(path.join(root, "solo.canvas.tsx"), NO_PATTERN, "utf8");

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const orientation = await ops.inspectOrientation("cards");
    expect(orientation).toEqual({ kind: "Card", addAvailable: true, slots: [] });

    const added = await ops.addOriented("cards");
    const { slots } = added;
    expect(added).toMatchObject({ ok: true, id: "cards" });
    // Document order, labelled by the wrapping element.
    expect(slots.map((s) => s.label)).toEqual(["Card header", "Text", "Button label"]);
    // Blank slots are discoverable later without remembering the add reply.
    expect((await ops.inspectOrientation("cards")).slots).toEqual(slots);

    const afterAdd = await ops.readSource("cards");
    expect(afterAdd.match(/<Card>/g)?.length).toBe(3);
    expect(afterAdd).toContain("onClick={onAct}");
    expect(afterAdd).not.toMatch(/__tc_slot_\w+__[\s\S]*Alpha/);
    for (const s of slots) {
      expect(afterAdd).toContain(`__tc_slot_${s.id}__`);
    }
    // No invented copy from the template's Beta strings on the new piece.
    const thirdCard = afterAdd.slice(afterAdd.lastIndexOf("<Card>"));
    expect(thirdCard).not.toContain("Beta");
    expect(thirdCard).not.toContain("Body beta");
    expect(thirdCard).not.toContain("Go beta");

    const fills: Record<string, string> = {};
    const values = ["Gamma", "Body gamma", "Go gamma"];
    slots.forEach((s, i) => {
      fills[s.id] = values[i] ?? `v${i}`;
    });
    const fillResult = await ops.fillSlots("cards", fills);
    expect(fillResult).toEqual({ ok: true, id: "cards", slots: [] });

    const filled = await ops.readSource("cards");
    // Values were given in slot order: header, text, button.
    expect(filled).toMatch(/<CardHeader>Gamma<\/CardHeader>/);
    expect(filled).toMatch(/<Text>Body gamma<\/Text>/);
    expect(filled).toMatch(/<Button onClick=\{onAct\}>Go gamma<\/Button>/);
    expect(filled).toContain("Gamma");
    expect(filled).toContain("Body gamma");
    expect(filled).toContain("Go gamma");
    expect(filled).toMatch(/export\s+default/);
    for (const s of slots) {
      expect(filled).not.toContain(`__tc_slot_${s.id}__`);
    }

    const bundled = await bundleCanvas({ source: filled });
    expect(bundled.ok, bundled.ok ? "" : bundled.error).toBe(true);

    const soloBefore = await readFile(path.join(root, "solo.canvas.tsx"), "utf8");
    await expect(ops.addOriented("solo")).rejects.toThrow(/no repeating sibling pattern/i);
    expect(await readFile(path.join(root, "solo.canvas.tsx"), "utf8")).toBe(
      soloBefore,
    );

    const cardsBeforeBad = await ops.readSource("cards");
    await expect(
      ops.fillSlots("cards", { "not-a-real-slot": "x" }),
    ).rejects.toThrow(/unknown or expired/i);
    expect(await ops.readSource("cards")).toBe(cardsBeforeBad);

    // Partial fill: only filled tokens go; leftovers stay fillable (no expire-all).
    await writeFile(path.join(root, "partial.canvas.tsx"), TWO_CARDS, "utf8");
    const { slots: partSlots } = await ops.addOriented("partial");
    expect(partSlots.length).toBeGreaterThan(1);
    await ops.fillSlots("partial", { [partSlots[0]!.id]: "OnlyFirst" });
    const afterPartial = await ops.readSource("partial");
    expect(afterPartial).toContain("OnlyFirst");
    expect(afterPartial).not.toContain(`__tc_slot_${partSlots[0]!.id}__`);
    for (const s of partSlots.slice(1)) {
      expect(afterPartial).toContain(`__tc_slot_${s.id}__`);
    }
    // Fresh ops instance (no in-memory pending) can still fill leftover tokens.
    const ops2 = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const rest: Record<string, string> = {};
    partSlots.slice(1).forEach((s, i) => {
      rest[s.id] = `Rest${i}`;
    });
    await ops2.fillSlots("partial", rest);
    const afterRest = await ops2.readSource("partial");
    expect(afterRest).toContain("Rest0");
    for (const s of partSlots) {
      expect(afterRest).not.toContain(`__tc_slot_${s.id}__`);
    }
  });

  it("crap:orientation: skips lowercase tags, prefers deeper Card run, blanks {\"str\"} children, rejects empty/missing fills", () => {
    const mixed = `export default function M() {
  return (
    <Stack>
      <Stack><Text>a</Text></Stack>
      <Stack><Text>b</Text></Stack>
      <div />
      <Card><Text>{"one"}</Text></Card>
      <Card><Text>{"two"}</Text></Card>
      <Card><Text>{"three"}</Text></Card>
    </Stack>
  );
}
`;
    expect(inspectSourceOrientation(mixed)).toEqual({
      kind: "Card",
      addAvailable: true,
      slots: [],
    });
    const { source, slots } = addOrientedSibling(mixed);
    expect(source.match(/<Card>/g)?.length).toBe(4);
    expect(slots.length).toBeGreaterThan(0);
    expect(source).toContain(`__tc_slot_${slots[0]!.id}__`);

    expect(() => applySlotFills(source, {}, new Set())).toThrow(/at least one/);
    const known = new Set(slots.map((s) => s.id));
    // known id but token already gone
    expect(() =>
      applySlotFills("no tokens here", { [slots[0]!.id]: "x" }, known),
    ).toThrow(/unknown or expired/i);

    expect(inspectSourceOrientation("export default function X() { return null }")).toEqual({
      kind: null,
      addAvailable: false,
      slots: [],
    });
  });

  it("mutation:orientation: PascalCase bounds, longer same-depth run, tab indent, paren unwrap, whitespace text", () => {
    // Lowercase / non-component tags never form a run; A…Z bounds count.
    const lowerOnly = `export default function L() {
  return (
    <section>
      <div>x</div>
      <div>y</div>
      <span>z</span>
    </section>
  );
}
`;
    expect(inspectSourceOrientation(lowerOnly)).toEqual({
      kind: null,
      addAvailable: false,
      slots: [],
    });

    // $ is ID_Start but codepoint < 'A' — must not count as component.
    const dollar = `export default function D() {
  return (
    <>
      <$X>1</$X>
      <$X>2</$X>
    </>
  );
}
`;
    expect(inspectSourceOrientation(dollar)).toEqual({
      kind: null,
      addAvailable: false,
      slots: [],
    });

    // Inclusive A: `> 'A'` mutant rejects this run.
    const onlyA = `export default function B() {
  return (
    <>
      <A>1</A>
      <A>2</A>
    </>
  );
}
`;
    expect(inspectSourceOrientation(onlyA)).toEqual({
      kind: "A",
      addAvailable: true,
      slots: [],
    });

    // Inclusive Z: `< 'Z'` mutant rejects this run.
    const onlyZ = `export default function B() {
  return (
    <>
      <Z>3</Z>
      <Z>4</Z>
    </>
  );
}
`;
    expect(inspectSourceOrientation(onlyZ)).toEqual({
      kind: "Z",
      addAvailable: true,
      slots: [],
    });

    // Same depth: longer run wins (three Text over two Card).
    const longer = `export default function L() {
  return (
    <Stack>
      <Card>a</Card>
      <Card>b</Card>
      <Text>1</Text>
      <Text>2</Text>
      <Text>3</Text>
    </Stack>
  );
}
`;
    expect(inspectSourceOrientation(longer)).toEqual({
      kind: "Text",
      addAvailable: true,
      slots: [],
    });

    // Same depth, equal length: keep earlier run (not `>=` replace).
    const tie = `export default function T() {
  return (
    <Stack>
      <Card>a</Card>
      <Card>b</Card>
      <Text>1</Text>
      <Text>2</Text>
    </Stack>
  );
}
`;
    expect(inspectSourceOrientation(tie)).toEqual({
      kind: "Card",
      addAvailable: true,
      slots: [],
    });

    // Deeper shorter run beats shallower longer (depth comparison, not length-only).
    const deeper = `export default function D() {
  return (
    <Stack>
      <Text>1</Text>
      <Text>2</Text>
      <Text>3</Text>
      <Box>
        <Card>a</Card>
        <Card>b</Card>
      </Box>
    </Stack>
  );
}
`;
    expect(inspectSourceOrientation(deeper)).toEqual({
      kind: "Card",
      addAvailable: true,
      slots: [],
    });

    // Tab indent preserved on cloned sibling.
    const tabs = `export default function T() {
\treturn (
\t\t<Stack>
\t\t\t<Card>one</Card>
\t\t\t<Card>two</Card>
\t\t</Stack>
\t);
}
`;
    const added = addOrientedSibling(tabs);
    expect(added.source).toMatch(/\n\t\t\t<Card>/);
    expect(added.slots.length).toBeGreaterThan(0);
    // Last Card open after add is the clone — exact three tabs, no spaces.
    const lastCardOpen = [...added.source.matchAll(/\n([ \t]*)<Card>/g)].pop();
    expect(lastCardOpen?.[1]).toBe("\t\t\t");

    // Single-line source: no newline before template (lineStart stays 0).
    const oneLine =
      "export default function O() { return (<><Card>a</Card><Card>b</Card></>); }";
    const oneAdd = addOrientedSibling(oneLine);
    expect(oneAdd.source).toMatch(/\n<Card>__tc_slot_\w+__/);
    expect(oneAdd.slots.length).toBeGreaterThan(0);

    // Space indent preserved on cloned sibling.
    const spaces = `export default function S() {
  return (
    <Stack>
      <Card>one</Card>
      <Card>two</Card>
    </Stack>
  );
}
`;
    const spaceAdd = addOrientedSibling(spaces);
    const lastSpaceCard = [...spaceAdd.source.matchAll(/\n([ \t]*)<Card>/g)].pop();
    expect(lastSpaceCard?.[1]).toBe("      ");

    // Parenthesized return + whitespace-only JsxText does not create a slot.
    const paren = `export default function P() {
  return ((
    <Stack>
      <Card>
        {"keep"}
        {" "}
      </Card>
      <Card>
        {"keep2"}
      </Card>
    </Stack>
  ));
}
`;
    expect(inspectSourceOrientation(paren).kind).toBe("Card");
    const { source: blanked, slots: blankSlots } = addOrientedSibling(paren);
    expect(blankSlots.length).toBeGreaterThan(0);
    // String-literal children blanked; whitespace-only `{" "}` is not a fill token.
    expect(blanked).toMatch(/__tc_slot_\w+__/);
    expect(blanked).toContain('{" "}');
    expect(blanked.match(/__tc_slot_\w+__/g)?.length).toBe(blankSlots.length);

    // Quotes stay around the slot token ( ±1 on lit bounds would eat/include quotes).
    expect(blanked).toMatch(/\{"__tc_slot_\w+__"\}/);
    const filledLit = applySlotFills(
      blanked,
      Object.fromEntries(blankSlots.map((s) => [s.id, "X"])),
      new Set(blankSlots.map((s) => s.id)),
    );
    expect(filledLit).toContain('{"X"}');
    expect(filledLit).not.toContain('"\"X\""');
    expect(filledLit).not.toMatch(/\{X\}/);

    // Attribute string literals are not blanked (asChild guard).
    const attrs = `export default function A() {
  return (
    <Stack>
      <Card title={"keepAttr"}>body1</Card>
      <Card title={"keepAttr2"}>body2</Card>
    </Stack>
  );
}
`;
    const attrAdd = addOrientedSibling(attrs);
    expect(attrAdd.source).toContain('title={"keepAttr2"}');
    expect(attrAdd.source).toMatch(/title=\{"keepAttr2"\}[\s\S]*__tc_slot_/);
    for (const s of attrAdd.slots) {
      expect(attrAdd.source).not.toMatch(
        new RegExp(`title=\\{"__tc_slot_${s.id}__"\\}`),
      );
    }

    // Whitespace-only JsxText between tags is not a fill range.
    const ws = `export default function W() {
  return (
    <Stack>
      <Card>   </Card>
      <Card>   </Card>
    </Stack>
  );
}
`;
    const wsAdd = addOrientedSibling(ws);
    expect(wsAdd.slots).toEqual([]);

    // Leading/trailing spaces inside text are trimmed out of the range (pad).
    const padded = `export default function P() {
  return (
    <Stack>
      <Card>  hi  </Card>
      <Card>  lo  </Card>
    </Stack>
  );
}
`;
    const padAdd = addOrientedSibling(padded);
    expect(padAdd.slots.length).toBe(1);
    expect(padAdd.source).toMatch(/<Card>  __tc_slot_\w+__  <\/Card>/);

    // Non-default export function is ignored.
    expect(
      inspectSourceOrientation(
        `function NotDefault() { return (<Stack><Card>a</Card><Card>b</Card></Stack>); }`,
      ),
    ).toEqual({ kind: null, addAvailable: false, slots: [] });

    // Named export with a pattern must not win over missing default.
    expect(
      inspectSourceOrientation(
        `export function Named() { return (<Stack><Card>a</Card><Card>b</Card></Stack>); }
export default function D() { return null; }`,
      ),
    ).toEqual({ kind: null, addAvailable: false, slots: [] });

    // ExpressionStatement before return must not be treated as the returned tree.
    expect(
      inspectSourceOrientation(
        `export default function F() {
  (<Card>x</Card>);
  return (<Stack><Card>a</Card><Card>b</Card></Stack>);
}`,
      ),
    ).toEqual({ kind: "Card", addAvailable: true, slots: [] });

    // Member tag names (not Identifier) are skipped by tagName.
    const member = `export default function M() {
  return (
    <Stack>
      <Foo.Bar>a</Foo.Bar>
      <Foo.Bar>b</Foo.Bar>
      <Card>c</Card>
      <Card>d</Card>
    </Stack>
  );
}
`;
    expect(inspectSourceOrientation(member)).toEqual({
      kind: "Card",
      addAvailable: true,
      slots: [],
    });

    // Default function with empty return expression is not a pattern.
    expect(
      inspectSourceOrientation(
        `export default function E() { return; }`,
      ),
    ).toEqual({ kind: null, addAvailable: false, slots: [] });

    // Unknown slot id rejected even when a matching token exists in source
    // (knownIds.has guard — not only the includes(token) check).
    const withTok = "hello __tc_slot_abc123__ world";
    expect(() =>
      applySlotFills(withTok, { abc123: "nope" }, new Set()),
    ).toThrow(/unknown or expired/i);
    expect(() =>
      applySlotFills(withTok, { abc123: "nope" }, new Set(["other"])),
    ).toThrow(/unknown or expired/i);
    // Control: known id + present token fills.
    expect(
      applySlotFills(withTok, { abc123: "yes" }, new Set(["abc123"])),
    ).toBe("hello yes world");
  });
  it("applySlotFills leaves a slot value that contains a later slot token unchanged", () => {
    expect(
      applySlotFills(
        "__tc_slot_aaa__ __tc_slot_bbb__",
        { aaa: "keep __tc_slot_bbb__", bbb: "later" },
        new Set(["aaa", "bbb"]),
      ),
    ).toBe("keep __tc_slot_bbb__ later");
  });

  it("pendingSlots: document order, labels from the wrapper, repeats numbered, partial fill keeps the rest", () => {
    const src = `import { Card, CardBody, CardHeader, Stack, Text } from "team-canvas/canvas";
export default function C() {
  return (
    <Stack>
      <Card>
        <CardHeader>__tc_slot_aaa__</CardHeader>
        <CardBody>
          <Text>__tc_slot_bbb__</Text>
          <Text>{"__tc_slot_ccc__"}</Text>
        </CardBody>
      </Card>
    </Stack>
  );
}
`;
    expect(pendingSlots(src)).toEqual([
      { id: "aaa", label: "Card header" },
      { id: "bbb", label: "Text 1" },
      { id: "ccc", label: "Text 2" },
    ]);
    const next = applySlotFills(src, { bbb: "B" }, slotIdsFromSource(src));
    expect(pendingSlots(next).map((s) => s.id)).toEqual(["aaa", "ccc"]);
    // Same id twice is one slot; tokens outside JSX are not slots.
    expect(pendingSlots(`const x = "__tc_slot_zzz__";\nexport default function C(){return <p/>}`)).toEqual([]);
  });

  it("mutation:orientation: non-function skip, bare return, paren depth, labels, dedupe, expression children, new-slot filter", () => {
    // Non-function with export default must be skipped (class has no function body).
    expect(inspectSourceOrientation("export default class C {}")).toEqual({
      kind: null,
      addAvailable: false,
      slots: [],
    });
    // Default function with no body is not a pattern; a later real default is illegal,
    // so this stands alone. `||` → `&&` would walk the missing body and throw.
    expect(inspectSourceOrientation("export default function F();")).toEqual({
      kind: null,
      addAvailable: false,
      slots: [],
    });
    // Import / const before the default function are skipped; the default return is used.
    expect(
      inspectSourceOrientation(`import { Card } from "x";
const n = 1;
export default function F() {
  return (<Stack><Card>a</Card><Card>b</Card></Stack>);
}`),
    ).toEqual({ kind: "Card", addAvailable: true, slots: [] });

    // `return;` has no expression — must not win over the later returned tree.
    expect(
      inspectSourceOrientation(`export default function F() {
  return;
  return (<Stack><Card>a</Card><Card>b</Card></Stack>);
}`),
    ).toEqual({ kind: "Card", addAvailable: true, slots: [] });

    // Extra parens must not add depth. Same real depth: longer Text beats shorter Card.
    // Leaving parens wrapped makes the Card run look deeper and it would win instead.
    const parenDepth = `export default function P() {
  return (
    <Stack>
      <Box>
        {
          <>
            <Text>1</Text>
            <Text>2</Text>
            <Text>3</Text>
          </>
        }
      </Box>
      <Box>
        {((
          <>
            <Card>a</Card>
            <Card>b</Card>
          </>
        ))}
      </Box>
    </Stack>
  );
}`;
    expect(inspectSourceOrientation(parenDepth)).toEqual({
      kind: "Text",
      addAvailable: true,
      slots: [],
    });

    // Same-depth longer run is the one cloned (not merely the reported kind).
    const longerClone = `export default function L() {
  return (
    <Stack>
      <Card>a</Card>
      <Card>b</Card>
      <Text>1</Text>
      <Text>2</Text>
      <Text>3</Text>
      <Box>z</Box>
    </Stack>
  );
}`;
    const cloned = addOrientedSibling(longerClone);
    expect(inspectSourceOrientation(longerClone).kind).toBe("Text");
    expect(cloned.source.match(/<Text>/g)?.length).toBe(4);
    expect(cloned.source.match(/<Card>/g)?.length).toBe(2);
    expect(cloned.source.match(/<Box>/g)?.length).toBe(1);

    // Tag at column 0 (the line starts at `<`) vs a space-indented sibling.
    const col0 = `export default function O() {
return (
<Stack>
<Card>a</Card>
<Card>b</Card>
</Stack>
);
}
`;
    const colAdd = addOrientedSibling(col0);
    const lastCol = [...colAdd.source.matchAll(/\n([ \t]*)<Card>/g)].pop();
    expect(lastCol?.[1]).toBe("");
    const indented = `export default function S() {
  return (
    <Stack>
      <Card>one</Card>
      <Card>two</Card>
    </Stack>
  );
}
`;
    const indAdd = addOrientedSibling(indented);
    const lastInd = [...indAdd.source.matchAll(/\n([ \t]*)<Card>/g)].pop();
    expect(lastInd?.[1]).toBe("      ");

    expect(
      pendingSlots(`export default function F() {
  return <ABCParser>__tc_slot_a1__</ABCParser>;
}`),
    ).toEqual([{ id: "a1", label: "Abc parser" }]);
    expect(
      pendingSlots(`export default function F() {
  return <Row2Cell>__tc_slot_c1__</Row2Cell>;
}`),
    ).toEqual([{ id: "c1", label: "Row2 cell" }]);
    // No identifier tag (member or fragment) → "Text".
    expect(
      pendingSlots(`export default function F() {
  return <Foo.Bar>__tc_slot_d1__</Foo.Bar>;
}`),
    ).toEqual([{ id: "d1", label: "Text" }]);
    expect(
      pendingSlots(`export default function F(){return <>__tc_slot_e1__</>;}`),
    ).toEqual([{ id: "e1", label: "Text" }]);
    // Same id twice is one slot; the first wrapper's label wins.
    expect(
      pendingSlots(`export default function F() {
  return (
    <Stack>
      <CardHeader>__tc_slot_same__</CardHeader>
      <Text>__tc_slot_same__</Text>
    </Stack>
  );
}`),
    ).toEqual([{ id: "same", label: "Card header" }]);

    // String-literal child is a slot; a non-string expression that contains JSX is not
    // collected as that expression's own text (the inner element still labels the slot).
    expect(
      pendingSlots(`export default function N() {
  return (
    <Stack>
      {flag && <CardHeader>__tc_slot_aaa__</CardHeader>}
      <Text>{"__tc_slot_bbb__"}</Text>
    </Stack>
  );
}`),
    ).toEqual([
      { id: "aaa", label: "Card header" },
      { id: "bbb", label: "Text" },
    ]);

    const exprKids = `export default function E() {
  return (
    <Stack>
      <Card>{name}{"one"}</Card>
      <Card>{name}{"two"}</Card>
    </Stack>
  );
}`;
    const exprAdd = addOrientedSibling(exprKids);
    const exprClone = exprAdd.source.slice(exprAdd.source.lastIndexOf("<Card>"));
    expect(exprClone).toContain("{name}");
    expect(exprClone).toMatch(/\{"__tc_slot_\w+__"\}/);
    expect(exprClone).not.toContain("two");

    // Pre-existing tokens stay in the file but are not the slots just created.
    const withOld = `export default function F() {
  return (
    <Stack>
      <Card>__tc_slot_old1__</Card>
      <Card>beta</Card>
    </Stack>
  );
}`;
    const added = addOrientedSibling(withOld);
    expect(added.slots.map((s) => s.id)).not.toContain("old1");
    expect(added.slots.length).toBeGreaterThan(0);
    expect(pendingSlots(added.source).map((s) => s.id)).toContain("old1");
    for (const s of added.slots) {
      expect(pendingSlots(added.source).map((x) => x.id)).toContain(s.id);
    }

    // A parenthesized string is not a direct string-literal child, so it is not a slot.
    expect(
      pendingSlots(
        `export default function F(){return <Text>{("__tc_slot_paren__")}</Text>;}`,
      ),
    ).toEqual([]);

    // Fillable text nested in a non-string expression is still blanked on the clone.
    const nestedText = `export default function E() {
  return (
    <Stack>
      <Card>{flag && <Text>hello</Text>}</Card>
      <Card>{flag && <Text>world</Text>}</Card>
    </Stack>
  );
}`;
    const nestedAdd = addOrientedSibling(nestedText);
    const nestedClone = nestedAdd.source.slice(nestedAdd.source.lastIndexOf("<Card>"));
    expect(nestedClone).not.toContain("world");
    expect(nestedClone).toMatch(/__tc_slot_\w+__/);

    // Newline at index 1 is a real line break (nl !== +1 must not skip it).
    const nlAt1 =
      " \nexport default function F(){return (<><Card>a</Card><Card>b</Card></>);}";
    const nlAdd = addOrientedSibling(nlAt1);
    expect(nlAdd.source).toMatch(/\n<Card>__tc_slot_/);
    expect(nlAdd.source).not.toMatch(/\n <Card>/);
  });
});
