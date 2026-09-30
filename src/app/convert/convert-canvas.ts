/** Rewrite a canvas's import of another canvas module to team-canvas/canvas. */

const NEXT = "team-canvas/canvas";

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Rewrite `from "<from>"`, `import("<from>")` and `import "<from>"` to the
 * team-canvas module. Leaves the same text alone inside other strings/comments.
 */
export function convertCanvasSource(
  source: string,
  from: string,
): { source: string; changed: boolean } {
  const f = escapeRegExp(from);
  const next = source
    .replace(
      new RegExp(`from(\\s*)(['"])${f}\\2`, "g"),
      (_m, ws: string, q: string) => `from${ws}${q}${NEXT}${q}`,
    )
    .replace(
      new RegExp(`import(\\s*\\(\\s*)(['"])${f}\\2`, "g"),
      (_m, open: string, q: string) => `import${open}${q}${NEXT}${q}`,
    )
    .replace(
      new RegExp(`import(\\s+)(['"])${f}\\2`, "g"),
      (_m, ws: string, q: string) => `import${ws}${q}${NEXT}${q}`,
    );
  return { source: next, changed: next !== source };
}
