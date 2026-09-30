import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../adapters/local-fs-canvas-store.js";
import { bundleCanvas } from "./bundle-canvas.js";
import { createCanvasEditOps } from "./canvas-edit-ops.js";
import {
  addOrientedSibling,
  applySlotFills,
  inspectSourceOrientation,
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

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));

    const orientation = await ops.inspectOrientation("cards");
    expect(orientation).toEqual({ kind: "Card", addAvailable: true });

    const { slots } = await ops.addOriented("cards");
    expect(slots.length).toBeGreaterThan(0);

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
    await ops.fillSlots("cards", fills);

    const filled = await ops.readSource("cards");
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
    const ops2 = createCanvasEditOps(LocalFilesystemCanvasStore(root));
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
    expect(oneAdd.source).toContain("\n<Card>");
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
    ).toEqual({ kind: null, addAvailable: false });

    // Named export with a pattern must not win over missing default.
    expect(
      inspectSourceOrientation(
        `export function Named() { return (<Stack><Card>a</Card><Card>b</Card></Stack>); }
export default function D() { return null; }`,
      ),
    ).toEqual({ kind: null, addAvailable: false });

    // ExpressionStatement before return must not be treated as the returned tree.
    expect(
      inspectSourceOrientation(
        `export default function F() {
  (<Card>x</Card>);
  return (<Stack><Card>a</Card><Card>b</Card></Stack>);
}`,
      ),
    ).toEqual({ kind: "Card", addAvailable: true });

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
    });

    // Default function with empty return expression is not a pattern.
    expect(
      inspectSourceOrientation(
        `export default function E() { return; }`,
      ),
    ).toEqual({ kind: null, addAvailable: false });

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
});
