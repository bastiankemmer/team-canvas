import { describe, expect, it } from "vitest";
import { collect, collectBySubject, extractFacts, render } from "../packages/ontology/index.js";

function wrap(jsx: string): string {
  return `export default function C(){return (${jsx});}\n`;
}

const fields = {
  id: "id-1",
  subject: "sub",
  claim: "claim",
  area: "canvas/id",
  heading: "head",
};

const factAttrs = 'id="id-1" subject="sub" claim="claim" area="canvas/id" heading="head"';

describe("literal facts and Turtle", () => {
  it("decodes amp, lt, gt, quot, apos, and decimal or hex character references, so an empty entity map cannot leave the claim as source text", () => {
    const facts = extractFacts(
      wrap(
        '<Fact id="ent" subject="s" claim="&amp;&lt;&gt;&quot;&apos;&#38;&#x26;&#X26;&#xD7FF;&#xD800;&#xDFFF;&#xE000;&#x10FFFF;&#x110000;" area="canvas/id" heading="h" />',
      ),
    );
    // Invalid code points stay as the characters the author typed. A scalar is decoded.
    const claim =
      "&<>\"'&&&" +
      String.fromCodePoint(0xd7ff) +
      "&#xD800;&#xDFFF;" +
      String.fromCodePoint(0xe000) +
      String.fromCodePoint(0x10ffff) +
      "&#x110000;";
    expect(facts).toEqual([
      {
        id: "ent",
        subject: "s",
        claim,
        area: "canvas/id",
        heading: "h",
      },
    ]);
  });

  it("reads a quoted string and a string inside a JSX expression as fact fields, so a template or a variable is not a fact", () => {
    expect(
      extractFacts(wrap(`<Fact ${factAttrs} />`)),
    ).toEqual([fields]);
    expect(
      extractFacts(
        wrap(
          '<Fact id={"id-1"} subject={"sub"} claim={"claim"} area={"canvas/id"} heading={"head"} />',
        ),
      ),
    ).toEqual([fields]);

    const mixed = [
      'const id = "id-1";',
      "export default function C() {",
      "  return (",
      "    <>",
      '      <Fact id={`id-1`} subject="sub" claim="claim" area="canvas/id" heading="head" />',
      '      <Fact id={id} subject="sub" claim="claim" area="canvas/id" heading="head" />',
      `      <Fact ${factAttrs} />`,
      "    </>",
      "  );",
      "}",
      "",
    ].join("\n");
    expect(extractFacts(mixed)).toEqual([fields]);
  });

  it("rejects an area that is not a relative canvas id, so a parent segment or a leading slash yields no fact, while a normal id and dot-dot inside a segment still do", () => {
    expect(extractFacts(wrap(`<Fact ${factAttrs} />`))).toEqual([fields]);
    // A drive prefix counts only at the start. Dropping that anchor would reject this id.
    expect(
      extractFacts(
        wrap(
          '<Fact id="id-1" subject="sub" claim="claim" area="canvas/C:/nested" heading="head" />',
        ),
      ),
    ).toEqual([{ ...fields, area: "canvas/C:/nested" }]);

    // Dot-dot inside a segment is not a parent segment. A substring ban would drop this fact.
    expect(
      extractFacts(
        wrap(
          '<Fact id="id-1" subject="sub" claim="claim" area="foo..bar" heading="head" />',
        ),
      ),
    ).toEqual([{ ...fields, area: "foo..bar" }]);

    expect(
      extractFacts(
        wrap(
          '<Fact id="id-1" subject="sub" claim="claim" area="team-canvas/knowledge-layers/phase-2" heading="head" />',
        ),
      ),
    ).toEqual([{ ...fields, area: "team-canvas/knowledge-layers/phase-2" }]);

    const rejected = [
      'area=""',
      'area=".."',
      'area="a\\b"',
      'area="/foo"',
      'area="C:/drive"',
      'area="c:/drive"',
      'area="."',
      'area="a/./b"',
      'area="a/../b"',
      'area="a//b"',
    ];
    for (const area of rejected) {
      expect(
        extractFacts(
          wrap(`<Fact id="id-1" subject="sub" claim="claim" ${area} heading="head" />`),
        ),
        area,
      ).toEqual([]);
    }
  });

  it("drops a fact when any of the five props is missing or not a literal, when a spread stands in for them, or when area is not a canvas id", () => {
    const props = ["id", "subject", "claim", "area", "heading"] as const;
    const valueOf = (name: string) => (name === "area" ? "canvas/id" : name);

    for (const missing of props) {
      const attrs = props
        .filter((name) => name !== missing)
        .map((name) => `${name}="${valueOf(name)}"`)
        .join(" ");
      expect(extractFacts(wrap(`<Fact ${attrs} />`)), `missing ${missing}`).toEqual([]);
    }

    for (const dynamic of props) {
      const attrs = props
        .map((name) =>
          name === dynamic ? `${name}={${name}Value}` : `${name}="${valueOf(name)}"`,
        )
        .join(" ");
      expect(extractFacts(wrap(`<Fact ${attrs} />`)), `dynamic ${dynamic}`).toEqual([]);
    }

    // A bare prop and an empty expression are not string literals.
    expect(
      extractFacts(
        wrap('<Fact id subject="sub" claim="claim" area="canvas/id" heading="head" />'),
      ),
    ).toEqual([]);
    expect(
      extractFacts(
        wrap('<Fact id={} subject="sub" claim="claim" area="canvas/id" heading="head" />'),
      ),
    ).toEqual([]);

    // A spread is not a JSX attribute, so it cannot supply the five literals.
    expect(
      extractFacts(
        wrap(
          '<Fact {...{ id: "id-1", subject: "sub", claim: "claim", area: "canvas/id", heading: "head" }} />',
        ),
      ),
    ).toEqual([]);

    // A later non-literal still drops the fact after a literal id was seen.
    expect(
      extractFacts(
        wrap(
          '<Fact id="id-1" id={idValue} subject="sub" claim="claim" area="canvas/id" heading="head" />',
        ),
      ),
    ).toEqual([]);

    // A non-fact attribute that is not a literal does not drop the five literal props.
    expect(
      extractFacts(wrap(`<Fact ${factAttrs} className={flag} />`)),
    ).toEqual([fields]);
  });

  it("extracts only a tag named Fact from TSX, including an element with children, and returns all five fields", () => {
    expect(extractFacts(wrap(`<Fact ${factAttrs} />`))).toEqual([fields]);
    expect(extractFacts(wrap(`<Fact ${factAttrs}>kept</Fact>`))).toEqual([fields]);
    expect(extractFacts(wrap(`<Note ${factAttrs} />`))).toEqual([]);
    expect(extractFacts(wrap(`<fact ${factAttrs} />`))).toEqual([]);
    expect(extractFacts(wrap(`<Foo.Fact ${factAttrs} />`))).toEqual([]);
  });

  it("escapes backslash, quote, carriage return, and newline in rendered Turtle, so a claim cannot close the literal", () => {
    const fact = {
      id: "esc",
      subject: "sub",
      claim: 'a\\b "c"\r\nd',
      area: "canvas/id",
      heading: "head",
    };
    expect(render(fact)).toBe(
      [
        "@prefix tc: <urn:team-canvas:ontology#> .",
        "<urn:team-canvas:fact:esc> tc:type tc:Fact ;",
        '  tc:subject "sub" ;',
        '  tc:claim "a\\\\b \\"c\\"\\r\\nd" ;',
        '  tc:area "canvas/id" ;',
        '  tc:heading "head" .',
        "",
      ].join("\n"),
    );
  });

  it("returns an empty string when no fact has that subject, while collect still returns the one fact for its id", () => {
    const src = wrap(`<Fact ${factAttrs} />`);
    expect(collectBySubject([src], "missing")).toBe("");
    expect(collectBySubject([], "sub")).toBe("");
    expect(collectBySubject([src], "sub")).toBe(render(fields));
    expect(collect([src], "id-1")).toBe(render(fields));
    expect(collect([src], "sub")).toBe("");
    expect(collect([src], "missing")).toBe("");
  });

  it("returns one Turtle document for every fact with that subject, in source order, so a placeholder between the blocks is not the ontology", () => {
    const src = wrap(
      `<Fact ${factAttrs} /><Fact id="id-2" subject="sub" claim="two" area="canvas/id" heading="h2" />`,
    );
    expect(collectBySubject([src], "sub")).toBe(
      [
        "@prefix tc: <urn:team-canvas:ontology#> .",
        "<urn:team-canvas:fact:id-1> tc:type tc:Fact ;",
        '  tc:subject "sub" ;',
        '  tc:claim "claim" ;',
        '  tc:area "canvas/id" ;',
        '  tc:heading "head" .',
        "<urn:team-canvas:fact:id-2> tc:type tc:Fact ;",
        '  tc:subject "sub" ;',
        '  tc:claim "two" ;',
        '  tc:area "canvas/id" ;',
        '  tc:heading "h2" .',
        "",
      ].join("\n"),
    );
    expect(collect([src], "id-2")).toBe(render({ ...fields, id: "id-2", claim: "two", heading: "h2" }));
  });
});
