import { describe, expect, it } from "vitest";
import {
  bundleCanvas,
  bundleFailureMessage,
  formatEsbuildErrors,
  isAllowedCanvasImport,
  isBarePackageImport,
} from "./bundle-canvas.js";

describe("bundleCanvas edge paths", () => {
  it("mutation: isAllowedCanvasImport allowlists team-canvas/canvas + react only", () => {
    expect(isAllowedCanvasImport("team-canvas/canvas")).toBe(true);
    expect(isAllowedCanvasImport("react")).toBe(true);
    expect(isAllowedCanvasImport("react/jsx-runtime")).toBe(true);
    expect(isAllowedCanvasImport("react-dom")).toBe(true);
    expect(isAllowedCanvasImport("react-dom/client")).toBe(true);
    expect(isAllowedCanvasImport("fs")).toBe(false);
    expect(isAllowedCanvasImport("node:fs")).toBe(false);
    expect(isAllowedCanvasImport("lodash")).toBe(false);
    expect(isAllowedCanvasImport("@scope/pkg")).toBe(false);
  });

  it("mutation: virtual: imports are excluded from bare-package external resolution", () => {
    expect(isBarePackageImport("virtual:canvas-source")).toBe(false);
    expect(isBarePackageImport("virtual:anything")).toBe(false);
    expect(isBarePackageImport("./rel")).toBe(false);
    expect(isBarePackageImport("/abs")).toBe(false);
    expect(isBarePackageImport("lodash")).toBe(true);
    expect(isBarePackageImport("react")).toBe(true);
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
});
