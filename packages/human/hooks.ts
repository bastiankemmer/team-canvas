import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  buildHostTokens,
  chartThemeForBrand,
  type CanvasHostThemeBrand,
  type CanvasPalette,
  type CanvasTokens,
  type ChartPalette,
} from "./canvas-tokens.js";
import {
  canvasRadiusForBrand,
  canvasTypographyForBrand,
  type CanvasRadius,
  type CanvasTypography,
} from "./theme.js";

export type CanvasAction =
  | { type: "openAgent"; agentId: string }
  | { type: "newComposerChat"; userPrompt?: string }
  | {
      type: "openFile";
      path: string;
      selection?: {
        startLineNumber?: number;
        startColumn?: number;
        endLineNumber?: number;
        endColumn?: number;
      };
    };

export interface CanvasHostTheme extends CanvasTokens {
  readonly kind: string;
  readonly brand: CanvasHostThemeBrand;
  readonly tokens: CanvasTokens;
  readonly palette: CanvasPalette;
  readonly radius: CanvasRadius;
  readonly typography: CanvasTypography;
  readonly chart: {
    readonly palette: ChartPalette;
    readonly sequence: readonly string[];
  };
}

export type SetCanvasState<T> = (action: T | ((prev: T) => T)) => void;

/** Injectable sidecar/backing store for `useCanvasState` (viewer wires this later). */
export type CanvasStateStore = {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown): void;
};

type RawHostThemeState = {
  readonly kind?: unknown;
  readonly brand?: unknown;
  readonly primary?: unknown;
  readonly editorBackground?: unknown;
  readonly editorForeground?: unknown;
};

let injectedHostTheme: RawHostThemeState | undefined;
let hostThemeVersion = 0;
const hostThemeListeners = new Set<() => void>();

let injectedStateStore: CanvasStateStore | null = null;

function emitHostTheme(): void {
  hostThemeVersion += 1;
  for (const listener of hostThemeListeners) listener();
}

/** Inject host theme payload; `undefined` clears to prefers-color-scheme fallback. */
export function provideHostTheme(
  raw: RawHostThemeState | undefined,
): void {
  injectedHostTheme = raw;
  emitHostTheme();
}

/** Inject canvas state backing; `null` uses in-memory-only React state. */
export function provideCanvasStateStore(store: CanvasStateStore | null): void {
  injectedStateStore = store;
}

function prefersColorSchemeDark(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribePrefersColorScheme(onStoreChange: () => void): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => {};
  const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function subscribeHostTheme(onStoreChange: () => void): () => void {
  hostThemeListeners.add(onStoreChange);
  const unsubMedia = subscribePrefersColorScheme(onStoreChange);
  return () => {
    hostThemeListeners.delete(onStoreChange);
    unsubMedia();
  };
}

function resolveThemeKind(raw: RawHostThemeState | undefined): string {
  if (typeof raw?.kind === "string" && raw.kind.length > 0) return raw.kind;
  return prefersColorSchemeDark() ? "dark" : "light";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hostOverridesFrom(raw: RawHostThemeState | undefined): {
  brand?: CanvasHostThemeBrand;
  primary?: string;
  editorBackground?: string;
  editorForeground?: string;
} {
  return {
    brand: optionalString(raw?.brand) as CanvasHostThemeBrand | undefined,
    primary: optionalString(raw?.primary),
    editorBackground: optionalString(raw?.editorBackground),
    editorForeground: optionalString(raw?.editorForeground),
  };
}

/** Exported for unit tests; not part of the public `"team-canvas/canvas"` barrel. */
export function resolveTheme(
  raw: RawHostThemeState | undefined,
): CanvasHostTheme {
  const kind = resolveThemeKind(raw);
  const { tokens, palette, brand } = buildHostTokens(
    kind,
    hostOverridesFrom(raw),
  );
  return {
    ...tokens,
    kind,
    brand,
    tokens,
    palette,
    radius: canvasRadiusForBrand(brand),
    typography: canvasTypographyForBrand(brand),
    chart: chartThemeForBrand(brand),
  };
}

export function useHostTheme(): CanvasHostTheme {
  const version = useSyncExternalStore(
    subscribeHostTheme,
    () => hostThemeVersion + (prefersColorSchemeDark() ? 1 : 0),
    () => hostThemeVersion,
  );
  return useMemo(() => resolveTheme(injectedHostTheme), [version]);
}

export function useCanvasState<T>(
  key: string,
  defaultValue: T,
): [T, SetCanvasState<T>] {
  const store = injectedStateStore;
  const [value, setValue] = useState<T>(() => {
    const existing = store?.get(key);
    return existing === undefined ? defaultValue : (existing as T);
  });
  const valueRef = useRef(value);
  valueRef.current = value;

  const set: SetCanvasState<T> = useCallback(
    (action) => {
      const next =
        typeof action === "function"
          ? (action as (prev: T) => T)(valueRef.current)
          : action;
      // A discarded React updater must not write the sidecar, so persist the
      // computed value and then store that same value in state.
      valueRef.current = next;
      store?.set(key, next);
      setValue(next);
    },
    [key, store],
  );

  return [value, set];
}

export function useCanvasAction(): (action: CanvasAction) => void {
  return useCallback((action: CanvasAction) => {
    // ponytail: v1 no-op; CanvasActionConnector protocol deferred
    console.warn(
      "[team-canvas] useCanvasAction: dispatch is a no-op until CanvasActionConnector is configured",
      action,
    );
  }, []);
}
