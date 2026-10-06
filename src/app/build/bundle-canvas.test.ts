import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bundleCanvas,
  bundleFailureMessage,
  formatEsbuildErrors,
  isAllowedCanvasImport,
} from "./bundle-canvas.js";

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../package.json",
);

describe("bundleCanvas edge paths", () => {
  it("mutation: isAllowedCanvasImport allowlists team-canvas/canvas + react only", () => {
    expect(isAllowedCanvasImport("team-canvas/canvas")).toBe(true);
    expect(isAllowedCanvasImport("react")).toBe(true);
    expect(isAllowedCanvasImport("react/jsx-runtime")).toBe(true);
    expect(isAllowedCanvasImport("react-dom")).toBe(true);
    expect(isAllowedCanvasImport("react-dom/client")).toBe(false);
    expect(isAllowedCanvasImport("./package.json")).toBe(false);
    expect(isAllowedCanvasImport(packageJsonPath)).toBe(false);
    expect(isAllowedCanvasImport("fs")).toBe(false);
    expect(isAllowedCanvasImport("node:fs")).toBe(false);
    expect(isAllowedCanvasImport("lodash")).toBe(false);
    expect(isAllowedCanvasImport("@scope/pkg")).toBe(false);
  });

  it("crap:formatEsbuildErrors: empty errors, missing text, and joined texts", () => {
    expect(formatEsbuildErrors({})).toBe("Bundle failed");
    expect(formatEsbuildErrors({ errors: [] })).toBe("Bundle failed");
    expect(formatEsbuildErrors({ errors: [{}, { text: "boom" }] })).toBe(
      "error\nboom",
    );
  });

  it("crap:bundleFailureMessage: Error, esbuild errors object, and string fallback", () => {
    expect(bundleFailureMessage(new Error("nope"))).toBe("nope");
    expect(bundleFailureMessage({ errors: [{ text: "e1" }] })).toBe("e1");
    expect(bundleFailureMessage(42)).toBe("42");
  });

  it("crap:bundleCanvas: syntax error returns ok false with message", async () => {
    const result = await bundleCanvas({
      source: "export default function Broken( { return null }\n",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("crap:bundleCanvas: unresolved import returns ok false naming the package", async () => {
    const result = await bundleCanvas({
      source: `import { x } from "totally-missing-pkg-xyz";
export default function C() { return <div>{String(x)}</div> }
`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(
      /totally-missing-pkg-xyz|not allowed|Could not resolve/,
    );
  });

  it("challenger: bare package outside allowlist fails with actionable message", async () => {
    const result = await bundleCanvas({
      source: `import fs from "node:fs";
export default function C() { return <div>{String(fs)}</div> }
`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/not allowed/);
    expect(result.error).toMatch(/team-canvas\/canvas/);
  });

  it("relative and absolute imports are not inlined into the viewer bundle", async () => {
    const relative = await bundleCanvas({
      source: `import pkg from "./package.json";
export default function C() { return pkg.name }
`,
    });
    expect(relative.ok).toBe(false);
    if (relative.ok) throw new Error(relative.js);
    expect(relative.error).toContain('Import "./package.json" is not allowed');

    const absolute = await bundleCanvas({
      source: `import pkg from ${JSON.stringify(packageJsonPath)};
export default function C() { return pkg.name }
`,
    });
    expect(absolute.ok).toBe(false);
    if (absolute.ok) throw new Error(absolute.js);
    expect(absolute.error).toContain(`Import "${packageJsonPath}" is not allowed`);
  });

  it("foreign canvas module fails with a convert hint", async () => {
    expect(isAllowedCanvasImport("some-lib/canvas")).toBe(false);
    const result = await bundleCanvas({
      source: `import { Text } from "some-lib/canvas";
export default function C() { return <Text>x</Text> }
`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("team-canvas convert --from some-lib/canvas");
  });

  it("crap:bundleCanvas: valid default export returns js string", async () => {
    const result = await bundleCanvas({
      source: `export default function Ok() { return null }\n`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.js).toMatch(/function|Ok|createRoot/);
    // browser + iife: IIFE/browser bundle, not ESM exports or node require
    expect(result.js.trimStart().startsWith("export ")).toBe(false);
    expect(result.js).toMatch(/createRoot/);
    expect(result.js).not.toMatch(/\brequire\s*\(\s*["']fs["']\s*\)/);
  });

  it("viewer bundle is minified", async () => {
    const result = await bundleCanvas({
      source: "export default function Ok() { return null }\n",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    // ~711KB with minify off (react-dom). minify keeps it near 230KB.
    expect(result.js.length).toBeLessThan(400_000);
  });
});
