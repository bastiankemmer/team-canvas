import { describe, expect, it } from "vitest";
import { extractCanvasLinks } from "./canvas-links.js";

function lineOf(source: string, needle: string): number {
  const i = source.split("\n").findIndex((row) => row.includes(needle));
  expect(i, needle).toBeGreaterThanOrEqual(0);
  return i + 1;
}

describe("extractCanvasLinks", () => {
  it("@task-2: a CanvasLink string literal is one link on its tag line; unsafe, dynamic, aliased, and non-JSX tags are omitted", () => {
    const source = [
      'import { CanvasLink as X } from "team-canvas/canvas";',
      'const aside = <CanvasLink to="billing">Billing</CanvasLink>;',
      'const s = "<CanvasLink to=\\"ghost\\">Ghost</CanvasLink>";',
      'const id = "billing";',
      "export default function Notes() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="../x">Bad</CanvasLink>',
      "      <CanvasLink to>Bare</CanvasLink>",
      "      <CanvasLink to={}>EmptyExpr</CanvasLink>",
      '      <CanvasLink to="">Empty</CanvasLink>',
      '      <CanvasLink to="a/b">Slash</CanvasLink>',
      '      <CanvasLink to="a\\b">Back</CanvasLink>',
      '      <CanvasLink to="..">Dots</CanvasLink>',
      "      <CanvasLink to={id}>Dyn</CanvasLink>",
      "      <CanvasLink to={`billing`}>Tpl</CanvasLink>",
      '      <CanvasLink to={"bill" + "ing"}>Cat</CanvasLink>',
      '      <CanvasLink {...{ to: "billing" }}>Spread</CanvasLink>',
      '      <CanvasLink to="billing">Second</CanvasLink>',
      '      <CanvasLink to="notes">Self</CanvasLink>',
      '      <CanvasLink to={"billing"}>Brace</CanvasLink>',
      "      <CanvasLink to={'billing'}>Squo</CanvasLink>",
      '      <X to="billing">Alias</X>',
      '      <Foo.CanvasLink to="billing">Member</Foo.CanvasLink>',
      '      {createElement(CanvasLink, { to: "billing" }, "C")}',
      '      {/* <CanvasLink to="ghost">Ghost</CanvasLink> */}',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      { to: "billing", line: lineOf(source, "const aside"), label: "Billing" },
      { to: "a/b", line: lineOf(source, 'to="a/b"'), label: "Slash" },
      { to: "billing", line: lineOf(source, ">Second<"), label: "Second" },
      { to: "notes", line: lineOf(source, 'to="notes"'), label: "Self" },
      { to: "billing", line: lineOf(source, 'to={"billing"}>Brace'), label: "Brace" },
      { to: "billing", line: lineOf(source, "to={'billing'}>Squo"), label: "Squo" },
    ]);
  });

  it("@task-2: label joins trimmed text and string literals; self-closing, empty, and other children are null", () => {
    const source = [
      "export default function Notes() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="a">  Hello {"there"}  </CanvasLink>',
      '      <CanvasLink to="b">{"  "}{"ok"}</CanvasLink>',
      '      <CanvasLink to="c" />',
      '      <CanvasLink to="d"></CanvasLink>',
      '      <CanvasLink to="e">   </CanvasLink>',
      '      <CanvasLink to="f"><b>x</b></CanvasLink>',
      '      <CanvasLink to="g">{id}</CanvasLink>',
      '      <CanvasLink to="h"><>z</></CanvasLink>',
      '      <CanvasLink to="i">{/* c */}Hi</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      { to: "a", line: lineOf(source, "Hello"), label: "Hello there" },
      { to: "b", line: lineOf(source, '{"  "}{"ok"}'), label: "ok" },
      { to: "c", line: lineOf(source, 'to="c" />'), label: null },
      { to: "d", line: lineOf(source, 'to="d">'), label: null },
      { to: "e", line: lineOf(source, 'to="e">'), label: null },
      { to: "f", line: lineOf(source, "<b>x</b>"), label: null },
      { to: "g", line: lineOf(source, "{id}"), label: null },
      { to: "h", line: lineOf(source, "<>z</>"), label: null },
      { to: "i", line: lineOf(source, "{/* c */}"), label: null },
    ]);
  });

  it("@task-2: a link outside the default function and JSX recovered from a syntax error are still listed", () => {
    const outside = [
      'const aside = <CanvasLink to="billing">Billing</CanvasLink>;',
      "export default function Notes() { return null }",
      "",
    ].join("\n");
    expect(extractCanvasLinks(outside)).toEqual([
      { to: "billing", line: 1, label: "Billing" },
    ]);

    const broken = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink to="billing">Billing</CanvasLink>',
      "  ;",
      "}",
      "",
    ].join("\n");
    expect(extractCanvasLinks(broken)).toEqual([
      { to: "billing", line: 3, label: "Billing" },
    ]);
  });

  it("@task-2: a CanvasLink whose to and text contain &amp; is discovered as the decoded characters", () => {
    const source = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink to="a&amp;b">Fish &amp; chips</CanvasLink>',
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      { to: "a&b", line: lineOf(source, "CanvasLink"), label: "Fish & chips" },
    ]);
  });

  it("@task-2: a canvas with no CanvasLink yields an empty array", () => {
    expect(
      extractCanvasLinks(
        "export default function Notes() { return <div>no links</div> }\n",
      ),
    ).toEqual([]);
  });

  it("a non-to attribute is ignored and the tag still counts when to is present", () => {
    const source = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink href="other" to="billing" className="x">Billing</CanvasLink>',
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      { to: "billing", line: lineOf(source, "CanvasLink"), label: "Billing" },
    ]);
  });

  it("decodes lt gt quot apos and decimal or hex character references; an unknown entity stays raw", () => {
    const source = [
      "export default function Notes() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="a&lt;b&gt;c&quot;d&apos;e">x&lt;y&gt;z&quot;q&apos;w</CanvasLink>',
      '      <CanvasLink to="n&#38;h&#x26;H&#X26;">d&#38;x&#x26;X&#X26;</CanvasLink>',
      '      <CanvasLink to="edge">&#x10FFFF;</CanvasLink>',
      '      <CanvasLink to="over">&#x110000;</CanvasLink>',
      '      <CanvasLink to="unk">pre &unknown; post</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      {
        to: "a<b>c\"d'e",
        line: lineOf(source, "a&lt;"),
        label: "x<y>z\"q'w",
      },
      {
        to: "n&h&H&",
        line: lineOf(source, "n&#38;"),
        label: "d&x&X&",
      },
      {
        to: "edge",
        line: lineOf(source, 'to="edge"'),
        label: "\u{10FFFF}",
      },
      {
        to: "over",
        line: lineOf(source, 'to="over"'),
        label: "&#x110000;",
      },
      {
        to: "unk",
        line: lineOf(source, 'to="unk"'),
        label: "pre &unknown; post",
      },
    ]);
  });

  it("drops a to that is unsafe after decode and still returns the other safe links", () => {
    const source = [
      "export default function Notes() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="a&#47;b">Slash</CanvasLink>',
      '      <CanvasLink to="&#46;&#46;&#47;x">Dots</CanvasLink>',
      '      <CanvasLink to="..">DotsRaw</CanvasLink>',
      '      <CanvasLink to="">Empty</CanvasLink>',
      '      <CanvasLink to="a/b">SlashRaw</CanvasLink>',
      '      <CanvasLink to="ok">Kept</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");

    expect(extractCanvasLinks(source)).toEqual([
      { to: "a/b", line: lineOf(source, "a&#47;b"), label: "Slash" },
      { to: "a/b", line: lineOf(source, 'to="a/b"'), label: "SlashRaw" },
      { to: "ok", line: lineOf(source, 'to="ok"'), label: "Kept" },
    ]);
  });
});
