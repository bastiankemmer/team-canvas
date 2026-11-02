import ts from "typescript";

const JSX_NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

// JSX stores entities raw. Decode so a heading matches the sentence the author wrote.
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

function literalAttr(el, name) {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    if (attr.name.text !== name) continue;
    const raw = literalText(attr.initializer);
    return raw === null ? null : decodeJsxEntities(raw);
  }
  return null;
}

/** Expression inside `{...}`, or null when the attribute is missing or not an expression. */
function attrExpr(el, name) {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    if (attr.name.text !== name) continue;
    const init = attr.initializer;
    if (!init || !ts.isJsxExpression(init)) return null;
    return init.expression ?? null;
  }
  return null;
}

/**
 * Direct text, string-literal expressions, and nested Code words.
 * Code is plain text in the sentence, not a code span. An identifier is not
 * replaced by its initializer. Anything else is skipped, not run.
 */
function literalChildren(el) {
  if (!ts.isJsxElement(el)) return "";
  const parts = [];
  for (const child of el.children) {
    if (ts.isJsxText(child)) {
      // The join below collapses whitespace. Doing it again here cannot change the sentence.
      parts.push(decodeJsxEntities(child.text));
      continue;
    }
    if (
      ts.isJsxExpression(child) &&
      child.expression &&
      ts.isStringLiteral(child.expression)
    ) {
      parts.push(decodeJsxEntities(child.expression.text));
      continue;
    }
    if (
      (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) &&
      tagName(child) === "Code"
    ) {
      parts.push(ts.isJsxElement(child) ? literalChildren(child) : "");
    }
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

function literalStringArray(expr) {
  if (!expr || !ts.isArrayLiteralExpression(expr)) return null;
  const values = [];
  for (const el of expr.elements) {
    if (!ts.isStringLiteral(el)) return null;
    values.push(decodeJsxEntities(el.text));
  }
  return values;
}

function tableBlock(el) {
  const headers = literalStringArray(attrExpr(el, "headers"));
  const rowExpr = attrExpr(el, "rows");
  if (!headers || headers.length === 0 || !rowExpr || !ts.isArrayLiteralExpression(rowExpr)) {
    return null;
  }
  const rows = [];
  for (const row of rowExpr.elements) {
    const cells = literalStringArray(row);
    if (!cells) return null;
    rows.push(cells);
  }
  const cell = (value) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const headerLine = `| ${headers.map(cell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${headers.map((_, i) => cell(row[i] ?? "")).join(" | ")} |`,
  );
  return [headerLine, sep, ...body].join("\n");
}

/**
 * ponytail: one file-level map from the first destructured name to the literal
 * useCanvasState key. A shadowed name in an inner function wins for the whole file.
 * The call must be spelled useCanvasState. Upgrade: a scope stack and the import binding.
 */
function stateBindings(sf) {
  const bindings = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "useCanvasState" &&
      ts.isArrayBindingPattern(node.name)
    ) {
      const key = node.initializer.arguments[0];
      const first = node.name.elements[0];
      if (
        key &&
        ts.isStringLiteral(key) &&
        first &&
        ts.isBindingElement(first) &&
        ts.isIdentifier(first.name)
      ) {
        bindings.set(first.name.text, key.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bindings;
}

function identifierState(expr, bindings, state) {
  if (!expr || !ts.isIdentifier(expr)) return undefined;
  const key = bindings.get(expr.text);
  if (key === undefined || !Object.hasOwn(state, key)) return undefined;
  return state[key];
}

function todoBlock(value) {
  if (!Array.isArray(value)) return null;
  const lines = [];
  for (const item of value) {
    // null has no fields; reading them throws. A number has none that are strings.
    if (!item) continue;
    if (typeof item.content === "string") lines.push(item.content);
    if (typeof item.status === "string") lines.push(item.status);
  }
  return lines.join("\n");
}

function formBlock(value) {
  // An empty string is dropped by the caller, same as null.
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  // Number.isFinite is false for NaN, Infinity, and every non-number.
  if (Number.isFinite(value)) return String(value);
  return null;
}

const HEADING = { H1: "#", H2: "##", H3: "###" };

// Chrome, not notes. Skip the tag, the text inside it, and any nested notes.
// Layout wrappers stay out of this set: the walk enters them, writes the
// headings and paragraphs they hold, and leaves no placeholder.
const OPAQUE = {
  BarChart: true,
  LineChart: true,
  PieChart: true,
  UsageBar: true,
  DiffStats: true,
  DiffView: true,
  Stat: true,
  Swatch: true,
  Button: true,
  Pill: true,
  IconButton: true,
};
const VALUE_PROP = {
  TextInput: "value",
  TextArea: "value",
  Select: "value",
  Checkbox: "checked",
  Toggle: "checked",
};

function renderTag(name, el, bindings, state) {
  if (Object.hasOwn(HEADING, name)) {
    const text = literalChildren(el);
    return text ? `${HEADING[name]} ${text}` : null;
  }
  // Callout's body is literal text, not a nested Text node. Tone and title stay out.
  if (name === "Text" || name === "Callout") {
    const text = literalChildren(el);
    return text || null;
  }
  if (name === "Link" || name === "CanvasLink") {
    const target = literalAttr(el, name === "Link" ? "href" : "to");
    const text = literalChildren(el);
    if (!target || !text) return null;
    return `[${text}](${target})`;
  }
  if (name === "Table") return tableBlock(el);
  if (name === "TodoList") {
    return todoBlock(identifierState(attrExpr(el, "todos"), bindings, state));
  }
  // A name that is not a control has no prop, so this is null rather than a paragraph.
  return formBlock(identifierState(attrExpr(el, VALUE_PROP[name]), bindings, state));
}

/**
 * Markdown projection of a canvas. Literal JSX only: a string, or a JSX
 * expression whose expression is only a string. Variables and templates are
 * not run, and an identifier is not replaced by its initializer. The canvas
 * is not rendered. Charts and controls are skipped with their text. Layout
 * wrappers are not written. A Code tag is the words only, inside the
 * surrounding sentence when it has one. A Callout's literal body is a paragraph; its
 * tone and title are not. Edited todo and form values come from the state
 * sidecar object already loaded by the caller.
 */
export function projectCanvas(source, state) {
  // createSourceFile throws on a non-string. That is an empty document, not a crash.
  if (typeof source !== "string") return "";
  const data =
    state && typeof state === "object" && !Array.isArray(state) ? state : {};
  // The file name is not read; script kind selects TSX. Parent links are not walked.
  const sf = ts.createSourceFile(
    String(),
    source,
    ts.ScriptTarget.Latest,
    undefined,
    ts.ScriptKind.TSX,
  );
  const bindings = stateBindings(sf);
  const blocks = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      // The flag is the skip. A present key whose value is false still has children.
      if (OPAQUE[name]) return;
      if (name === "Text" || name === "Callout" || Object.hasOwn(HEADING, name)) {
        const block = renderTag(name, node, bindings, data);
        if (block) blocks.push(block);
        return;
      }
      if (name === "Code") {
        const text = literalChildren(node);
        if (text) blocks.push(text);
        return;
      }
      const block = renderTag(name, node, bindings, data);
      if (block) blocks.push(block);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

/**
 * Read one area. The area id is the canvas id. `read` is the port the shell
 * uses to supply the derived file for that id. The id is not a heading, so
 * the result is the whole file. Nothing is written.
 */
export function areaRead(areaId, read) {
  return read(areaId);
}
