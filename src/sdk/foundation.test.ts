/**
 * @vitest-environment jsdom
 */
import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canvasPaletteDark,
  canvasPaletteLight,
  canvasTokens,
  canvasTokensLight,
  categoryPaletteDark,
  colorPalette,
  usageColorSequence,
} from "./index.js";
import {
  provideCanvasStateStore,
  provideHostTheme,
  useCanvasAction,
  useCanvasState,
  useHostTheme,
  type CanvasAction,
  type CanvasHostTheme,
} from "./hooks.js";
import * as barrel from "./index.js";

function mountHook<T>(
  useHook: () => T,
  options?: { strict?: boolean },
): {
  result: { current: T };
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  const result: { current: T } = { current: undefined as T };

  function Probe() {
    result.current = useHook();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(
      options?.strict
        ? createElement(StrictMode, null, createElement(Probe))
        : createElement(Probe),
    );
  });

  return {
    result,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  provideHostTheme(undefined);
  provideCanvasStateStore(null);
  vi.restoreAllMocks();
});

describe("SDK foundation", () => {
  it("@task-2: theme tokens, injectable state, no-op action, and barrel surface", () => {
    expect(canvasPaletteDark.editor).toBeTruthy();
    expect(canvasPaletteLight.editor).toBeTruthy();
    expect(canvasTokens.bg.editor).toBe(canvasPaletteDark.editor);
    expect(canvasTokensLight.bg.editor).toBe(canvasPaletteLight.editor);
    expect(categoryPaletteDark.blue).toBeTruthy();
    expect(colorPalette).toEqual(categoryPaletteDark);
    expect(usageColorSequence.length).toBeGreaterThan(0);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("dark"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });

    provideHostTheme(undefined);
    const themeMount = mountHook(() => useHostTheme());
    const fallbackTheme: CanvasHostTheme = themeMount.result.current;
    expect(fallbackTheme.kind).toBe("dark");
    expect(fallbackTheme.bg.editor).toBe(canvasTokens.bg.editor);
    expect(fallbackTheme.text.primary).toBeTruthy();
    expect(fallbackTheme.tokens.bg.editor).toBe(fallbackTheme.bg.editor);
    themeMount.unmount();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
    const lightMount = mountHook(() => useHostTheme());
    expect(lightMount.result.current.kind).toBe("light");
    expect(lightMount.result.current.bg.editor).toBe(canvasTokensLight.bg.editor);
    lightMount.unmount();

    const bag = new Map<string, unknown>();
    provideCanvasStateStore({
      get: (key) => bag.get(key),
      set: (key, value) => {
        bag.set(key, value);
      },
    });
    bag.set("count", 2);

    const stateMount = mountHook(() => useCanvasState("count", 0));
    expect(stateMount.result.current[0]).toBe(2);
    act(() => {
      stateMount.result.current[1]((n) => n + 1);
    });
    expect(stateMount.result.current[0]).toBe(3);
    expect(bag.get("count")).toBe(3);
    act(() => {
      stateMount.result.current[1](10);
    });
    expect(stateMount.result.current[0]).toBe(10);
    expect(bag.get("count")).toBe(10);
    stateMount.unmount();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let dispatched: CanvasAction | undefined;
    const actionMount = mountHook(() => {
      const dispatch = useCanvasAction();
      useEffect(() => {
        dispatch({ type: "openAgent", agentId: "abc" });
        dispatched = { type: "openAgent", agentId: "abc" };
      }, [dispatch]);
      return dispatch;
    });
    expect(dispatched).toEqual({ type: "openAgent", agentId: "abc" });
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/no-op/i);
    actionMount.unmount();

    expect(barrel.useHostTheme).toBeTypeOf("function");
    expect(barrel.useCanvasState).toBeTypeOf("function");
    expect(barrel.useCanvasAction).toBeTypeOf("function");
    expect(barrel.canvasTokens).toBe(canvasTokens);
    expect(barrel.canvasPaletteAltDark).toBeTruthy();
    expect(barrel.canvasPaletteAltLight).toBeTruthy();
    expect(barrel.useState).toBeTypeOf("function");
    expect(barrel.useEffect).toBeTypeOf("function");
    // Barrel lists remaining public-surface modules for later tasks
    expect(Object.keys(barrel).sort()).toEqual(
      expect.arrayContaining([
        "canvasPaletteDark",
        "canvasPaletteLight",
        "canvasTokens",
        "canvasTokensLight",
        "categoryPaletteDark",
        "categoryPaletteLight",
        "colorPalette",
        "usageColorSequence",
        "useCanvasAction",
        "useCanvasState",
        "useHostTheme",
      ]),
    );
  });

  it("a discarded React updater does not write the sidecar", () => {
    const writes: number[] = [];
    provideCanvasStateStore({
      get: () => undefined,
      set: (_key, value) => {
        writes.push(value as number);
      },
    });

    const stateMount = mountHook(() => useCanvasState("count", 0), {
      strict: true,
    });
    act(() => {
      stateMount.result.current[1]((n) => n + 1);
    });
    expect(stateMount.result.current[0]).toBe(1);
    expect(writes).toEqual([1]);
    stateMount.unmount();
  });
});
