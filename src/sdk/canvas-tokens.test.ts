import { describe, expect, it } from "vitest";
import {
  canvasPaletteDark,
  canvasPaletteLight,
  type CanvasPalette,
} from "./canvas-tokens.js";

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const PALETTE_KEYS: (keyof CanvasPalette)[] = [
  "foreground",
  "foregroundSecondary",
  "foregroundTertiary",
  "foregroundQuaternary",
  "editor",
  "chrome",
  "sidebar",
  "elevated",
  "fillPrimary",
  "fillSecondary",
  "fillTertiary",
  "fillQuaternary",
  "strokePrimary",
  "strokeSecondary",
  "strokeTertiary",
  "strokeFocused",
  "accent",
  "buttonBackground",
  "buttonForeground",
  "buttonHoverBackground",
  "link",
  "diffInsertedLine",
  "diffRemovedLine",
  "diffStripAdded",
  "diffStripRemoved",
];

function srgb(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function parseRgb(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function lum(hex: string, over?: string): number {
  const [r, g, b, a] = parseRgb(hex);
  let R = r;
  let G = g;
  let B = b;
  if (over && a < 1) {
    const [br, bg, bb] = parseRgb(over);
    R = Math.round(r * a + br * (1 - a));
    G = Math.round(g * a + bg * (1 - a));
    B = Math.round(b * a + bb * (1 - a));
  }
  return 0.2126 * srgb(R) + 0.7152 * srgb(G) + 0.0722 * srgb(B);
}

function contrast(fg: string, bg: string): number {
  const L1 = lum(fg, bg);
  const L2 = lum(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("canvas tokens palette", () => {
  it("dark and light palettes use valid hex and meet contrast", () => {
    for (const palette of [canvasPaletteDark, canvasPaletteLight]) {
      for (const key of PALETTE_KEYS) {
        expect(palette[key], key).toMatch(HEX);
      }
      expect(contrast(palette.foreground, palette.editor)).toBeGreaterThanOrEqual(
        7,
      );
      expect(
        contrast(palette.foregroundSecondary, palette.editor),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
