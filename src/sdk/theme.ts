import type { CanvasHostThemeBrand } from "./canvas-tokens.js";

export type {
  CanvasHostThemeBrand,
  CanvasPalette,
  CanvasTokens,
  ChartPalette,
} from "./canvas-tokens.js";
export {
  canvasPaletteDark,
  canvasPaletteAltDark,
  canvasPaletteAltLight,
  canvasPaletteLight,
  canvasTokens,
  canvasTokensLight,
  chartThemeForBrand,
  parseCanvasHostThemeBrand,
} from "./canvas-tokens.js";

export const canvasTypography = {
  fontFamily: "inherit",
  h1: { fontSize: "24px", lineHeight: "30px", fontWeight: 590 },
  h2: { fontSize: "18px", lineHeight: "24px", fontWeight: 590 },
  h3: { fontSize: "16px", lineHeight: "22px", fontWeight: 590 },
  body: { fontSize: "14px", lineHeight: "20px", fontWeight: 400 },
  small: { fontSize: "12px", lineHeight: "16px", fontWeight: 400 },
} as const;

export const canvasFontFamilyDefault = "inherit" as const;

export const canvasFontFamilyAlt =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const canvasSpacing = {
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "4.5": 18,
  "5": 20,
  "6": 24,
  "7": 28,
  "8": 32,
  "9": 36,
  "10": 40,
} as const;

export type CanvasSpacing = typeof canvasSpacing;

export const canvasRadius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export type CanvasRadius = {
  readonly [K in keyof typeof canvasRadius]: number;
};

export type CanvasTypography = {
  readonly fontFamily: string;
  readonly h1: {
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly fontWeight: number;
  };
  readonly h2: {
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly fontWeight: number;
  };
  readonly h3: {
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly fontWeight: number;
  };
  readonly body: {
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly fontWeight: number;
  };
  readonly small: {
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly fontWeight: number;
  };
};

export const canvasRadiusAlt: CanvasRadius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 10,
  xl: 14,
  full: 9999,
};

export const canvasTypographyAlt: CanvasTypography = {
  ...canvasTypography,
  fontFamily: canvasFontFamilyAlt,
};

export function canvasRadiusForBrand(_brand: CanvasHostThemeBrand): CanvasRadius {
  return canvasRadius;
}

export function canvasTypographyForBrand(
  _brand: CanvasHostThemeBrand,
): CanvasTypography {
  return canvasTypography;
}
