import ts from "typescript";

/** Rewrite a canvas's import of another canvas module to team-canvas/canvas. */

const NEXT = "team-canvas/canvas";

/**
 * Rewrite import declarations and `export … from` clauses that load `from`.
 * The same text inside strings and comments stays put.
 */
export function convertCanvasSource(
  source: string,
  from: string,
): { source: string; changed: boolean } {
  const sf = ts.createSourceFile(
    "canvas.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const spans: { start: number; end: number }[] = [];
  const visit = (node: ts.Node): void => {
    const spec =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : undefined;
    if (spec && ts.isStringLiteral(spec) && spec.text === from) {
      spans.push({ start: spec.getStart(sf), end: spec.end });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (spans.length === 0) return { source, changed: false };

  let next = source;
  for (const { start, end } of spans.sort((a, b) => b.start - a.start)) {
    const q = source[start] === "'" ? "'" : '"';
    next = `${next.slice(0, start)}${q}${NEXT}${q}${next.slice(end)}`;
  }
  return { source: next, changed: next !== source };
}
