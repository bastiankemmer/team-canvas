import ts from "typescript";

const FACT_PROPS = ["id", "subject", "claim", "area", "heading"];

const JSX_NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

// JSX stores entities raw. Decode so the claim matches the sentence the author wrote.
function decodeJsxEntities(value) {
  return value.replace(
    /&(?:#([xX][\da-fA-F]+|\d+)|(amp|lt|gt|quot|apos));/g,
    (match, num, named) => {
      if (named) return JSX_NAMED[named];
      const hex = num[0] === "x" || num[0] === "X";
      const cp = Number.parseInt(hex ? num.slice(1) : num, hex ? 16 : 10);
      const scalar = cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff);
      return scalar ? String.fromCodePoint(cp) : match;
    },
  );
}

function tagName(el) {
  const tag = ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName;
  return ts.isIdentifier(tag) ? tag.text : null;
}

/** Unquoted text of a string literal, including `prop={"text"}`. A template is not a literal. */
function literalText(init) {
  if (init && ts.isStringLiteral(init)) return init.text;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
  return ts.isStringLiteral(init.expression) ? init.expression.text : null;
}

// Same shape as a canvas id: relative segments, no escape. Not a lookup that the canvas exists.
// A parent segment is exactly `..`. The characters dot-dot inside a segment are a name.
// An empty segment already rejects a leading, trailing, or doubled slash.
function safeCanvasId(id) {
  if (!id || id.includes("\\") || /^[A-Za-z]:[\\/]/.test(id)) {
    return false;
  }
  return id.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function literalFact(el) {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  const values = {};
  let nonLiteral = false;
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    const name = attr.name.text;
    if (!FACT_PROPS.includes(name)) continue;
    const raw = literalText(attr.initializer);
    if (raw === null) {
      nonLiteral = true;
      continue;
    }
    values[name] = decodeJsxEntities(raw);
  }
  if (nonLiteral) return null;
  for (const name of FACT_PROPS) {
    if (!Object.hasOwn(values, name)) return null;
  }
  if (!safeCanvasId(values.area)) return null;
  return {
    id: values.id,
    subject: values.subject,
    claim: values.claim,
    area: values.area,
    heading: values.heading,
  };
}

/**
 * Literal Fact tags in canvas source, in document order.
 * ponytail: whole-file JSX walk per read, no index. Ceiling: re-parse on every read.
 * Upgrade: a store index if fact reads show up on a hot path.
 */
export function extractFacts(source) {
  // Script kind selects TSX, so the file name is unused. Parent links default off; this walk does not use them.
  const sf = ts.createSourceFile(
    String(),
    source,
    ts.ScriptTarget.Latest,
    undefined,
    ts.ScriptKind.TSX,
  );
  const facts = [];
  const visit = (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagName(node) === "Fact") {
      const fact = literalFact(node);
      if (fact) facts.push(fact);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return facts;
}

// One prefix. `tc:type tc:Fact` is the type predicate; the other four are subject, claim, area, heading.
const PREFIX = "@prefix tc: <urn:team-canvas:ontology#> .\n";

// Quoted Turtle literal. Escape so a claim cannot close the string or add a triple.
function turtleLiteral(value) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

// Bracket IRI so a fact id cannot inject Turtle syntax. encodeURIComponent leaves kebab-case ids readable.
function factTerm(id) {
  return `<urn:team-canvas:fact:${encodeURIComponent(id)}>`;
}

// Triples for one fact, without the prefix, so several facts can share one document.
function factTriples(fact) {
  return (
    `${factTerm(fact.id)} tc:type tc:Fact ;\n` +
    `  tc:subject ${turtleLiteral(fact.subject)} ;\n` +
    `  tc:claim ${turtleLiteral(fact.claim)} ;\n` +
    `  tc:area ${turtleLiteral(fact.area)} ;\n` +
    `  tc:heading ${turtleLiteral(fact.heading)} .\n`
  );
}

/** One fact as Turtle. The claim sentence is a literal. This does not write a file. */
export function render(fact) {
  return PREFIX + factTriples(fact);
}

/**
 * Turtle for the literal fact with this id.
 * `sources` are canvas texts the caller already read, so this module never opens the store.
 * A missing id is an empty Turtle document: no invented fact, no derived file.
 * ponytail: scans every source for one id. Ceiling: a knowledge folder.
 * Upgrade: an id index if collect is called on a hot path.
 */
export function collect(sources, factId) {
  for (const source of sources) {
    for (const fact of extractFacts(source)) {
      if (fact.id === factId) return render(fact);
    }
  }
  return "";
}

/**
 * Turtle for every literal fact with this subject, in source order.
 * A subject is not a fact id, so this stays beside collect and cannot match by id.
 * No match is an empty Turtle document. This does not write a file.
 * ponytail: scans every source. Ceiling: a knowledge folder.
 * Upgrade: a subject index if collect-by-subject is called on a hot path.
 */
export function collectBySubject(sources, subject) {
  const blocks = [];
  for (const source of sources) {
    for (const fact of extractFacts(source)) {
      if (fact.subject === subject) blocks.push(factTriples(fact));
    }
  }
  if (blocks.length === 0) return "";
  return PREFIX + blocks.join("");
}
