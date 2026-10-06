import { describe, expect, it } from "vitest";
import { convertCanvasSource } from "./convert-canvas.js";

const FROM = "some-lib/canvas";
const NEXT = "team-canvas/canvas";

describe("convertCanvasSource", () => {
  it("rewrites double-quoted from imports", () => {
    const { source, changed } = convertCanvasSource(
      `import { Text } from "${FROM}";\n`,
      FROM,
    );
    expect(changed).toBe(true);
    expect(source).toBe(`import { Text } from "${NEXT}";\n`);
  });

  it("rewrites single-quoted from imports", () => {
    const { source, changed } = convertCanvasSource(
      `export { Text } from '${FROM}';\n`,
      FROM,
    );
    expect(changed).toBe(true);
    expect(source).toBe(`export { Text } from '${NEXT}';\n`);
  });

  it("leaves unrelated and already-converted sources unchanged", () => {
    const src = `import { Text } from "${NEXT}";\nimport x from "other";\n`;
    expect(convertCanvasSource(src, FROM)).toEqual({ source: src, changed: false });
  });

  it("rewrites side-effect import declarations and leaves dynamic import() calls", () => {
    expect(convertCanvasSource(`import "${FROM}";\n`, FROM).source).toBe(
      `import "${NEXT}";\n`,
    );
    expect(convertCanvasSource(`const m = import("${FROM}");\n`, FROM)).toEqual({
      source: `const m = import("${FROM}");\n`,
      changed: false,
    });
  });

  it("rewrites import declarations and export-from clauses, not the same text in strings or comments", () => {
    const src = [
      `import { Text } from "${FROM}";`,
      `export { Card } from '${FROM}';`,
      `const note = 'import "${FROM}"';`,
      `// export { Card } from '${FROM}'`,
      `/* from "${FROM}" */`,
      "",
    ].join("\n");
    expect(convertCanvasSource(src, FROM)).toEqual({
      source: [
        `import { Text } from "${NEXT}";`,
        `export { Card } from '${NEXT}';`,
        `const note = 'import "${FROM}"';`,
        `// export { Card } from '${FROM}'`,
        `/* from "${FROM}" */`,
        "",
      ].join("\n"),
      changed: true,
    });
  });

  it("does not touch the module name inside other string literals", () => {
    const src = `const tip = "use ${FROM}";\n`;
    expect(convertCanvasSource(src, FROM)).toEqual({ source: src, changed: false });
  });

  it("treats regex characters in the module name literally", () => {
    const src = `import { a } from "x.y/canvas";\nimport { b } from "xzy/canvas";\n`;
    const { source } = convertCanvasSource(src, "x.y/canvas");
    expect(source).toBe(
      `import { a } from "${NEXT}";\nimport { b } from "xzy/canvas";\n`,
    );
  });
});
