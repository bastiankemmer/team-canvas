/** team-canvas SDK design tokens. */

export type CanvasHostThemeBrand = "default";

export type Color =
  | "gray"
  | "purple"
  | "green"
  | "yellow"
  | "cyan"
  | "pink"
  | "blue"
  | "orange"
  | "red";

export type CategoryPalette = Readonly<Record<Color, string>>;

export interface CanvasPalette {
  readonly foreground: string;
  readonly foregroundSecondary: string;
  readonly foregroundTertiary: string;
  readonly foregroundQuaternary: string;
  readonly editor: string;
  readonly chrome: string;
  readonly sidebar: string;
  readonly elevated: string;
  readonly fillPrimary: string;
  readonly fillSecondary: string;
  readonly fillTertiary: string;
  readonly fillQuaternary: string;
  readonly strokePrimary: string;
  readonly strokeSecondary: string;
  readonly strokeTertiary: string;
  readonly strokeFocused: string;
  readonly accent: string;
  readonly buttonBackground: string;
  readonly buttonForeground: string;
  readonly buttonHoverBackground: string;
  readonly link: string;
  readonly diffInsertedLine: string;
  readonly diffRemovedLine: string;
  readonly diffStripAdded: string;
  readonly diffStripRemoved: string;
}

export interface CanvasTokens {
  bg: {
    editor: string;
    chrome: string;
    elevated: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    link: string;
    onAccent: string;
  };
  stroke: {
    primary: string;
    secondary: string;
    tertiary: string;
    focused: string;
  };
  fill: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
  };
  accent: {
    primary: string;
    control: string;
    controlHover: string;
  };
  diff: {
    insertedLine: string;
    removedLine: string;
    stripAdded: string;
    stripRemoved: string;
  };
  category: CategoryPalette;
}

export interface CanvasHostThemeOverrides {
  readonly brand?: CanvasHostThemeBrand;
  readonly primary?: string;
  readonly editorBackground?: string;
  readonly editorForeground?: string;
}

/** Published chart palette keys from the public SDK contract. */
export const chartPalette = {
  green: "#16A34AE8",
  darkGreen: "#15803DE0",
  lightGreen: "#4ADE80E0",
  mintGreen: "#86EFACE0",
  blue: "#2563EBE0",
  lightBlue: "#60A5FAE0",
  indigo: "#4F46E5F0",
  lightIndigo: "#A5B4FCE0",
  purple: "#7C3AEDF0",
  lightPurple: "#A78BFAE0",
  warmPink: "#DB2777E0",
  lightPink: "#F9A8D4E0",
  brightOrange: "#F97316E0",
  deepOrange: "#C2410CE0",
  goldenYellow: "#FACC15E0",
  darkAmber: "#EF4444E0",
  warmPeach: "#FDA4AFE0",
  vibrantTeal: "#14B8A6E0",
  muted: "#A1A1AAE0",
  neutralLine: "#71717AD0",
} as const;

export type ChartPalette = {
  readonly [K in keyof typeof chartPalette]: string;
};

export const chartPaletteAlt: ChartPalette = {
  green: "#34D399E8",
  darkGreen: "#059669E0",
  lightGreen: "#6EE7B7E0",
  mintGreen: "#A7F3D0E0",
  blue: "#0EA5E9E0",
  lightBlue: "#38BDF8E0",
  indigo: "#1D4ED8F0",
  lightIndigo: "#7DD3FCE0",
  purple: "#8B5CF6F0",
  lightPurple: "#C4B5FDE0",
  warmPink: "#D946EFE0",
  lightPink: "#E879F9E0",
  brightOrange: "#FB923CE0",
  deepOrange: "#9A3412E0",
  goldenYellow: "#F59E0BE0",
  darkAmber: "#DC2626E0",
  warmPeach: "#FDBA74E0",
  vibrantTeal: "#2DD4BFE0",
  muted: "#A3A3A3E0",
  neutralLine: "#737373D0",
};

export const chartColorSequence: readonly string[] = [
  chartPalette.blue,
  chartPalette.brightOrange,
  chartPalette.purple,
  chartPalette.green,
  chartPalette.warmPink,
  chartPalette.goldenYellow,
  chartPalette.indigo,
  chartPalette.vibrantTeal,
  chartPalette.deepOrange,
  chartPalette.lightBlue,
];

export const chartColorSequenceAlt: readonly string[] = [
  chartPaletteAlt.blue,
  chartPaletteAlt.brightOrange,
  chartPaletteAlt.purple,
  chartPaletteAlt.green,
  chartPaletteAlt.warmPink,
  chartPaletteAlt.goldenYellow,
  chartPaletteAlt.indigo,
  chartPaletteAlt.vibrantTeal,
  chartPaletteAlt.deepOrange,
  chartPaletteAlt.lightBlue,
];

// ponytail: flat approximation of the semantic colors; no per-surface mixing
export const canvasPaletteDark: CanvasPalette = {
  foreground: "#F4F4F5",
  foregroundSecondary: "#F4F4F5BD",
  foregroundTertiary: "#F4F4F599",
  foregroundQuaternary: "#F4F4F55C",
  editor: "#18181B",
  chrome: "#09090B",
  sidebar: "#111113",
  elevated: "#27272A",
  fillPrimary: "#F4F4F533",
  fillSecondary: "#F4F4F524",
  fillTertiary: "#F4F4F514",
  fillQuaternary: "#F4F4F50F",
  strokePrimary: "#F4F4F533",
  strokeSecondary: "#F4F4F51F",
  strokeTertiary: "#F4F4F514",
  strokeFocused: "#60A5FA",
  accent: "#60A5FA",
  buttonBackground: "#60A5FA",
  buttonForeground: "#18181B",
  buttonHoverBackground: "#60A5FAE6",
  link: "#60A5FA",
  diffInsertedLine: "#16A34A26",
  diffRemovedLine: "#EF444426",
  diffStripAdded: "#16A34AA0",
  diffStripRemoved: "#EF4444A0",
};

export const canvasPaletteLight: CanvasPalette = {
  foreground: "#18181B",
  foregroundSecondary: "#18181BBD",
  foregroundTertiary: "#18181B99",
  foregroundQuaternary: "#18181B5C",
  editor: "#F8FAFC",
  chrome: "#F1F5F9",
  sidebar: "#E2E8F0",
  elevated: "#FFFFFF",
  fillPrimary: "#18181B33",
  fillSecondary: "#18181B24",
  fillTertiary: "#18181B14",
  fillQuaternary: "#18181B0F",
  strokePrimary: "#18181B33",
  strokeSecondary: "#18181B1F",
  strokeTertiary: "#18181B14",
  strokeFocused: "#2563EB",
  accent: "#2563EB",
  buttonBackground: "#2563EB",
  buttonForeground: "#F8FAFC",
  buttonHoverBackground: "#2563EBE6",
  link: "#2563EB",
  diffInsertedLine: "#16A34A26",
  diffRemovedLine: "#EF444426",
  diffStripAdded: "#16A34AA0",
  diffStripRemoved: "#EF4444A0",
};

export const canvasPaletteAltDark: CanvasPalette = {
  ...canvasPaletteDark,
  accent: "#E4E4E7",
  buttonBackground: "#E4E4E7",
  buttonForeground: "#09090B",
  buttonHoverBackground: "#E4E4E7E6",
  link: "#E4E4E7",
  strokeFocused: "#E4E4E7",
};

export const canvasPaletteAltLight: CanvasPalette = {
  ...canvasPaletteLight,
  accent: "#09090B",
  buttonBackground: "#09090B",
  buttonForeground: "#E4E4E7",
  buttonHoverBackground: "#09090BE6",
  link: "#09090B",
  strokeFocused: "#09090B",
};

export const categoryPaletteDark: CategoryPalette = {
  gray: "#F4F4F599",
  purple: "#A78BFA",
  green: "#4ADE80",
  yellow: "#FACC15",
  cyan: "#2DD4BF",
  pink: "#F472B6",
  blue: "#60A5FA",
  orange: "#FB923C",
  red: "#F87171",
};

export const categoryPaletteLight: CategoryPalette = {
  gray: "#18181B99",
  purple: "#7C3AED",
  green: "#16A34A",
  yellow: "#CA8A04",
  cyan: "#0D9488",
  pink: "#DB2777",
  blue: "#2563EB",
  orange: "#EA580C",
  red: "#DC2626",
};

export const categoryPaletteAltDark: CategoryPalette = {
  ...categoryPaletteDark,
  blue: "#38BDF8",
  orange: "#F97316",
  purple: "#C084FC",
};

export const categoryPaletteAltLight: CategoryPalette = {
  ...categoryPaletteLight,
  blue: "#0284C7",
  orange: "#C2410C",
  purple: "#6D28D9",
};

/** Legacy alias — dark category table. */
export const colorPalette: CategoryPalette = categoryPaletteDark;

export const usageColorSequence: readonly Color[] = [
  "blue",
  "purple",
  "green",
  "yellow",
  "cyan",
  "pink",
  "orange",
  "red",
  "gray",
];

function tokensFrom(
  palette: CanvasPalette,
  category: CategoryPalette,
): CanvasTokens {
  return {
    bg: {
      editor: palette.editor,
      chrome: palette.chrome,
      elevated: palette.elevated,
    },
    text: {
      primary: palette.foreground,
      secondary: palette.foregroundSecondary,
      tertiary: palette.foregroundTertiary,
      quaternary: palette.foregroundQuaternary,
      link: palette.link,
      onAccent: palette.buttonForeground,
    },
    stroke: {
      primary: palette.strokePrimary,
      secondary: palette.strokeSecondary,
      tertiary: palette.strokeTertiary,
      focused: palette.strokeFocused,
    },
    fill: {
      primary: palette.fillPrimary,
      secondary: palette.fillSecondary,
      tertiary: palette.fillTertiary,
      quaternary: palette.fillQuaternary,
    },
    accent: {
      primary: palette.accent,
      control: palette.buttonBackground,
      controlHover: palette.buttonHoverBackground,
    },
    diff: {
      insertedLine: palette.diffInsertedLine,
      removedLine: palette.diffRemovedLine,
      stripAdded: palette.diffStripAdded,
      stripRemoved: palette.diffStripRemoved,
    },
    category,
  };
}

export const canvasTokens: CanvasTokens = tokensFrom(
  canvasPaletteDark,
  categoryPaletteDark,
);
export const canvasTokensLight: CanvasTokens = tokensFrom(
  canvasPaletteLight,
  categoryPaletteLight,
);

export function parseCanvasHostThemeBrand(_value: unknown): CanvasHostThemeBrand {
  return "default";
}

export function applyWorkbenchSurfaces(
  palette: CanvasPalette,
  surfaces: Pick<CanvasHostThemeOverrides, "editorBackground" | "editorForeground">,
): CanvasPalette {
  const editorBackground =
    typeof surfaces.editorBackground === "string"
      ? surfaces.editorBackground
      : undefined;
  const editorForeground =
    typeof surfaces.editorForeground === "string"
      ? surfaces.editorForeground
      : undefined;
  if (!editorBackground && !editorForeground) return palette;
  return {
    ...palette,
    ...(editorBackground
      ? { editor: editorBackground, elevated: editorBackground }
      : {}),
    ...(editorForeground
      ? {
          foreground: editorForeground,
        }
      : {}),
  };
}

function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return canvasPaletteLight.editor;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? canvasPaletteLight.foreground : canvasPaletteLight.editor;
}

export function applyPrimaryColor(
  palette: CanvasPalette,
  primary: string,
): CanvasPalette {
  if (!/^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(primary)) return palette;
  const accent = primary.startsWith("#") ? primary.slice(0, 7) : `#${primary.slice(0, 6)}`;
  return {
    ...palette,
    accent,
    buttonBackground: accent,
    buttonHoverBackground: `${accent}E6`,
    buttonForeground: readableOn(accent),
    link: accent,
    strokeFocused: accent,
  };
}

function isLightKind(kind: string): boolean {
  return kind === "light" || kind === "hc-light";
}

function basePaletteFor(light: boolean): CanvasPalette {
  return light ? canvasPaletteLight : canvasPaletteDark;
}

function categoryFor(light: boolean): CategoryPalette {
  return light ? categoryPaletteLight : categoryPaletteDark;
}

export function buildHostTokens(
  kind: string,
  overrides: CanvasHostThemeOverrides = {},
): {
  tokens: CanvasTokens;
  palette: CanvasPalette;
  brand: CanvasHostThemeBrand;
} {
  const brand = parseCanvasHostThemeBrand(overrides.brand);
  const light = isLightKind(kind);
  let palette = applyWorkbenchSurfaces(basePaletteFor(light), overrides);
  if (overrides.primary) {
    palette = applyPrimaryColor(palette, overrides.primary);
  }
  return {
    tokens: tokensFrom(palette, categoryFor(light)),
    palette,
    brand,
  };
}

export function chartThemeForBrand(_brand: CanvasHostThemeBrand): {
  palette: ChartPalette;
  sequence: readonly string[];
} {
  return { palette: chartPalette, sequence: chartColorSequence };
}
