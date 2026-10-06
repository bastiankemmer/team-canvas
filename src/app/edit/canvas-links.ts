import ts from "typescript";
import { assertSafeCanvasId } from "../../adapters/store/local-fs-canvas-store.js";

/** A CanvasLink tag before the store says whether `to` exists. */
export type CanvasLinkHit = {
  to: string;
  line: number;
  label: string | null;
};

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

function tagName(el: JsxTag): string | null {
  const tag = ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName;
  return ts.isIdentifier(tag) ? tag.text : null;
}

function isToAttr(attr: ts.JsxAttributeLike): attr is ts.JsxAttribute {
  return ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === "to";
}

const JSX_NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** TS stores JSX entities raw; the esbuild bundle decodes them. */
function decodeJsxEntities(value: string): string {
  return value.replace(
    /&(?:#([xX][\da-fA-F]+|\d+)|(amp|lt|gt|quot|apos));/g,
    (match, num: string | undefined, named: string | undefined) => {
      if (named) return JSX_NAMED[named]!;
      const hex = num![0] === "x" || num![0] === "X";
      const cp = Number.parseInt(hex ? num!.slice(1) : num!, hex ? 16 : 10);
      // Surrogates sit inside 0..10FFFF but are not scalar values; other illegal points throw.
      const scalar =
        Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff);
      return scalar ? String.fromCodePoint(cp) : match;
    },
  );
}

/** Unquoted text of a string literal, including `to={"id"}`. */
function literalText(init: ts.JsxAttribute["initializer"]): string | null {
  if (init && ts.isStringLiteral(init)) return init.text;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
  return ts.isStringLiteral(init.expression) ? init.expression.text : null;
}

/** String literal `to`, or null when the attribute is missing or not a literal. */
function literalTo(el: JsxTag): string | null {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const attr of attrs.properties) {
    if (!isToAttr(attr)) continue;
    const raw = literalText(attr.initializer);
    return raw === null ? null : decodeJsxEntities(raw);
  }
  return null;
}

function safeTo(to: string): boolean {
  try {
    assertSafeCanvasId(to);
    return true;
  } catch {
    return false;
  }
}

/** Direct text and string-literal children, or null when anything else is present. */
function linkLabel(el: ts.JsxElement): string | null {
  const parts: string[] = [];
  for (const child of el.children) {
    if (ts.isJsxText(child)) {
      const text = decodeJsxEntities(child.text).trim();
      if (text) parts.push(text);
      continue;
    }
    if (
      ts.isJsxExpression(child) &&
      child.expression &&
      ts.isStringLiteral(child.expression)
    ) {
      const text = decodeJsxEntities(child.expression.text).trim();
      if (text) parts.push(text);
      continue;
    }
    return null;
  }
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * ponytail: whole-file JSX walk per read, no index.
 * Upgrade path: an incremental index if a store is too large to re-read on every backlinks call — not a new database.
 */
export function extractCanvasLinks(source: string): CanvasLinkHit[] {
  // setParentNodes unused; positions are read with the source file argument.
  // Parse diagnostics are ignored: recovered JSX still counts.
  const sf = ts.createSourceFile(
    "canvas.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const links: CanvasLinkHit[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      tagName(node) === "CanvasLink"
    ) {
      const to = literalTo(node);
      if (to !== null && safeTo(to)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        links.push({
          to,
          line: line + 1,
          label: ts.isJsxElement(node) ? linkLabel(node) : null,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return links;
}
