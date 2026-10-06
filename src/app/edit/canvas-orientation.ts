import ts from "typescript";

export type OrientSlot = { id: string; label: string };

export type OrientationInfo = {
  kind: string | null;
  addAvailable: boolean;
  /** Blank slots still in the source, in document order. */
  slots: OrientSlot[];
};

export type AddOrientedTransform = {
  source: string;
  slots: OrientSlot[];
};

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

type Pattern = {
  kind: string;
  nodes: JsxTag[];
  depth: number;
};

function isJsxTag(n: ts.Node): n is JsxTag {
  return ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
}

function tagName(el: JsxTag): string | null {
  const tag = ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName;
  return ts.isIdentifier(tag) ? tag.text : null;
}

function isComponentTag(name: string | null): name is string {
  // PascalCase only: first char in A–Z (inclusive).
  return !!name && name.charCodeAt(0) >= 65 && name.charCodeAt(0) <= 90;
}

/** Return expr of `export default function …`. */
function defaultFunctionReturn(sf: ts.SourceFile): ts.Expression | undefined {
  for (const stmt of sf.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.body) continue;
    if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      continue;
    }
    for (const s of stmt.body.statements) {
      if (!ts.isReturnStatement(s)) continue;
      if (s.expression) return s.expression;
    }
  }
  return undefined;
}

/** Prefer deeper runs; at equal depth prefer longer; ties keep earlier. */
function isBetterRun(
  out: Pattern | null,
  depth: number,
  run: number,
  runLen: number,
): boolean {
  if (run < 2) return false;
  if (!out) return true;
  if (depth > out.depth) return true;
  // Shallower-after-deeper does not occur with parent-before-child visit; equal depth only.
  return depth === out.depth && run > runLen;
}

/** Longest/deepest run of 2+ consecutive same PascalCase JSX siblings. */
function bestRunAt(
  tags: JsxTag[],
  depth: number,
  best: Pattern | null,
): Pattern | null {
  let i = 0;
  let out = best;
  while (i < tags.length) {
    const kind = tagName(tags[i]!);
    if (!isComponentTag(kind)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < tags.length && tagName(tags[j]!) === kind) j++;
    const run = j - i;
    if (isBetterRun(out, depth, run, out?.nodes.length ?? 0)) {
      out = { kind, nodes: tags.slice(i, j), depth };
    }
    i = j; // j >= i+1 always after the inner while
  }
  return out;
}

function findPattern(root: ts.Expression): Pattern | null {
  let best: Pattern | null = null;

  function visit(node: ts.Node, depth: number) {
    // Unwrap parens in-place so depth stays accurate without a separate helper.
    if (ts.isParenthesizedExpression(node)) {
      visit(node.expression, depth);
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      best = bestRunAt(node.children.filter(isJsxTag), depth, best);
    }
    ts.forEachChild(node, (c) => visit(c, depth + 1));
  }

  visit(root, 0);
  return best;
}

function parse(source: string): { sf: ts.SourceFile; pattern: Pattern | null } {
  // setParentNodes unused; getText/getStart take sf explicitly.
  const sf = ts.createSourceFile(
    "canvas.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const ret = defaultFunctionReturn(sf);
  return { sf, pattern: ret ? findPattern(ret) : null };
}

/** JsxText + child `{"…"}` string literals inside a tag (not attribute enums). */
function contentRanges(sf: ts.SourceFile, el: JsxTag): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];

  function visit(node: ts.Node, asChild: boolean) {
    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      const trimmed = raw.trim();
      if (!trimmed) return;
      const pad = raw.indexOf(trimmed);
      const start = node.getStart(sf) + pad;
      ranges.push({ start, end: start + trimmed.length });
      return;
    }
    if (
      asChild &&
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteral(node.expression)
    ) {
      const lit = node.expression;
      // Exclude surrounding quotes.
      ranges.push({ start: lit.getStart(sf) + 1, end: lit.getEnd() - 1 });
      return;
    }
    // Only descend into element/fragment children as fillable; attributes stay asChild=false.
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      ts.forEachChild(node, (c) => visit(c, true));
    } else {
      ts.forEachChild(node, (c) => visit(c, false));
    }
  }

  visit(el, false);
  return ranges;
}

function newSlotId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}

export function inspectSourceOrientation(source: string): OrientationInfo {
  const { pattern } = parse(source);
  const slots = pendingSlots(source);
  if (!pattern) return { kind: null, addAvailable: false, slots };
  return { kind: pattern.kind, addAvailable: true, slots };
}

const SLOT_TOKEN = /__tc_slot_([A-Za-z0-9]+)__/g;

/** "CardHeader" -> "Card header"; Button text is its label; no wrapper -> "Text". */
function slotLabel(tag: string | null): string {
  if (!tag) return "Text";
  if (tag === "Button") return "Button label";
  const words = tag
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Blank slots left in the source, in document order, labelled by the element
 * that wraps them. Repeated labels are numbered ("Text 1", "Text 2").
 */
export function pendingSlots(source: string): OrientSlot[] {
  const sf = ts.createSourceFile(
    "canvas.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const found: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  const collect = (text: string, tag: string | null) => {
    for (const m of text.matchAll(SLOT_TOKEN)) {
      if (seen.has(m[1]!)) continue;
      seen.add(m[1]!);
      found.push({ id: m[1]!, label: slotLabel(tag) });
    }
  };

  function visit(node: ts.Node, tag: string | null) {
    if (ts.isJsxText(node)) {
      collect(node.getText(sf), tag);
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
      collect(node.expression.getText(sf), tag);
      return;
    }
    const next = ts.isJsxElement(node) ? tagName(node) : tag;
    ts.forEachChild(node, (c) => visit(c, next));
  }
  visit(sf, null);

  const total: Record<string, number> = {};
  for (const f of found) total[f.label] = (total[f.label] ?? 0) + 1;
  const index: Record<string, number> = {};
  return found.map((f) => {
    if (total[f.label]! < 2) return f;
    index[f.label] = (index[f.label] ?? 0) + 1;
    return { id: f.id, label: `${f.label} ${index[f.label]}` };
  });
}

/**
 * Clone last repeating sibling with blanked fill fields.
 * ponytail: literal JSX siblings only — `.map` / data-array lists never form a pattern.
 */
export function addOrientedSibling(source: string): AddOrientedTransform {
  const { sf, pattern } = parse(source);
  if (!pattern) {
    throw new Error(
      "No repeating sibling pattern of SDK components; oriented Add is unavailable",
    );
  }
  const template = pattern.nodes[pattern.nodes.length - 1]!;
  const tStart = template.getStart(sf);
  const tEnd = template.getEnd();
  let clone = source.slice(tStart, tEnd);
  const ranges = contentRanges(sf, template)
    .map((r) => ({ start: r.start - tStart, end: r.end - tStart }))
    .sort((a, b) => b.start - a.start);

  const ids = new Set<string>();
  for (const r of ranges) {
    const id = newSlotId();
    ids.add(id);
    clone = clone.slice(0, r.start) + `__tc_slot_${id}__` + clone.slice(r.end);
  }

  // Indent = leading spaces/tabs on the template's line (no regex).
  let lineStart = 0;
  const nl = source.lastIndexOf("\n", tStart - 1);
  if (nl !== -1) lineStart = nl + 1;
  let indentEnd = lineStart;
  while (indentEnd < tStart) {
    const ch = source[indentEnd];
    if (ch !== " " && ch !== "\t") break;
    indentEnd++;
  }
  const indent = source.slice(lineStart, indentEnd);
  const next = source.slice(0, tEnd) + `\n${indent}${clone}` + source.slice(tEnd);
  // Read the slots back from the finished source: document order, with labels.
  return { source: next, slots: pendingSlots(next).filter((s) => ids.has(s.id)) };
}

/** Ids still present as `__tc_slot_<id>__` tokens — source of truth across restarts. */
export function slotIdsFromSource(source: string): Set<string> {
  const ids = new Set<string>();
  for (const m of source.matchAll(SLOT_TOKEN)) {
    ids.add(m[1]!);
  }
  return ids;
}

export function applySlotFills(
  source: string,
  slots: Record<string, string>,
  knownIds: ReadonlySet<string>,
): string {
  const ids = Object.keys(slots);
  if (ids.length === 0) {
    throw new Error("fillSlots requires at least one slot");
  }
  for (const id of ids) {
    if (!knownIds.has(id)) {
      throw new Error(`Unknown or expired slot id "${id}"`);
    }
    if (!source.includes(`__tc_slot_${id}__`)) {
      throw new Error(`Unknown or expired slot id "${id}"`);
    }
  }
  // One pass over the original text; inserted values are not scanned.
  return source.replaceAll(SLOT_TOKEN, (token, id: string) =>
    Object.hasOwn(slots, id) ? slots[id]! : token,
  );
}
