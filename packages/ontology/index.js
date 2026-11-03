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

/**
 * Turtle for every literal fact whose project-weighted score is at or above the threshold.
 * Highest score first; equal scores use fact id in UTF-16 code unit order.
 * Score 0 stays when the threshold is 0. No qualifying fact is "" so the caller does not get a bare prefix.
 * Weights are inverse document frequency over these sources only (one project).
 * ponytail: scans every source twice (facts, then token frequency). Ceiling: one project folder.
 * Upgrade: a saved frequency table if one project is too big to scan per query.
 */
export function collectByQuery(sources, query, threshold) {
  const facts = [];
  for (const source of sources) {
    for (const fact of extractFacts(source)) facts.push(fact);
  }
  const idf = documentFrequency(facts);
  const question = applyIdf(counts(query), idf);
  const hits = [];
  for (const fact of facts) {
    const value = cosine(question, applyIdf(counts(fact), idf));
    if (value >= threshold) hits.push({ fact, value });
  }
  if (hits.length === 0) return "";
  // `<` on strings is UTF-16 code units, so "Alpha" stays before "alpha".
  hits.sort((a, b) =>
    a.value < b.value ? 1 : a.value > b.value ? -1 : a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0,
  );
  return PREFIX + hits.map((hit) => factTriples(hit.fact)).join("");
}

// A Fact is the same bag as a question: these five fields, nothing else. Order does not matter.
function vectorText(input) {
  if (typeof input === "string") return input;
  return [input.subject, input.heading, input.claim, input.id, input.area].join(" ");
}

// Hyphen, space, and punctuation are splits. "ux-design" and "UX Design" are the same tokens.
// A `+` is the same once empty pieces are dropped, and deleting it cannot change the score.
function tokens(text) {
  return text.toLowerCase().split(/[^a-z0-9]/).filter(Boolean);
}

function counts(input) {
  const bag = new Map();
  for (const token of tokens(vectorText(input))) {
    bag.set(token, (bag.get(token) ?? 0) + 1);
  }
  return bag;
}

/**
 * Token counts for a question or a Fact.
 * Pure math: no model call and no vector file.
 */
export function vector(input) {
  // Insertion order. Cosine only sums counts, so sorting tokens cannot change the score.
  return [...counts(input)];
}

// How many facts in this project contain the token, then ln(N/df).
// A token in every fact weighs 0, so it cannot outrank a rare word.
// One fact makes every token "in every fact"; keep raw counts there or the only fact always scores 0.
function documentFrequency(facts) {
  const df = new Map();
  for (const fact of facts) {
    for (const token of counts(fact).keys()) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const n = facts.length;
  const idf = new Map();
  for (const [token, seen] of df) idf.set(token, n < 2 ? 1 : Math.log(n / seen));
  return idf;
}

// A question token that no fact contains is dropped so it cannot inflate the question's length.
function applyIdf(bag, idf) {
  const weighted = new Map();
  for (const [token, count] of bag) {
    const weight = idf.get(token);
    if (weight === undefined) continue;
    weighted.set(token, count * weight);
  }
  return weighted;
}

function cosine(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [token, weight] of left) {
    leftNorm += weight * weight;
    const other = right.get(token);
    if (other !== undefined) dot += weight * other;
  }
  for (const weight of right.values()) rightNorm += weight * weight;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * Cosine of the two bags. An empty question or Fact is 0, never NaN.
 * Counts are non-negative, so the result stays in [0, 1].
 * Pass the project's facts to weight tokens by inverse document frequency. Omit them for raw counts.
 */
export function score(question, fact, facts) {
  if (facts === undefined) return cosine(counts(question), counts(fact));
  const idf = documentFrequency(facts);
  return cosine(applyIdf(counts(question), idf), applyIdf(counts(fact), idf));
}
