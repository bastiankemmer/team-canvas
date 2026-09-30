import ts from "typescript";

export type OrientationInfo = {
  kind: string | null;
  addAvailable: boolean;
};

export type OrientSlot = { id: string };

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
  if (!pattern) return { kind: null, addAvailable: false };
  return { kind: pattern.kind, addAvailable: true };
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

  const slots: OrientSlot[] = [];
  for (const r of ranges) {
    const id = newSlotId();
    slots.push({ id });
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
  return {
    source: source.slice(0, tEnd) + `\n${indent}${clone}` + source.slice(tEnd),
    slots,
  };
}

/** Ids still present as `__tc_slot_<id>__` tokens — source of truth across restarts. */
export function slotIdsFromSource(source: string): Set<string> {
  const ids = new Set<string>();
  for (const m of source.matchAll(/__tc_slot_([A-Za-z0-9]+)__/g)) {
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
  let out = source;
  for (const id of ids) {
    if (!knownIds.has(id)) {
      throw new Error(`Unknown or expired slot id "${id}"`);
    }
    const token = `__tc_slot_${id}__`;
    if (!out.includes(token)) {
      throw new Error(`Unknown or expired slot id "${id}"`);
    }
    // ponytail: raw replace; metachar-heavy values use writeSource
    out = out.replaceAll(token, slots[id]!);
  }
  return out;
}
