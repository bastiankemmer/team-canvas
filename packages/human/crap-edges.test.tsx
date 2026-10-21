/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BarChart, LineChart, PieChart, computeDAGLayout } from "./index.js";
import {
  applyPrimaryColor,
  applyWorkbenchSurfaces,
  buildHostTokens,
  canvasPaletteDark,
  canvasPaletteLight,
  chartPalette,
  parseCanvasHostThemeBrand,
} from "./canvas-tokens.js";
import { provideHostTheme, resolveTheme, useHostTheme } from "./hooks.js";
import {
  canvasRadius,
  canvasRadiusForBrand,
} from "./theme.js";
import { Toggle } from "./form-primitives.js";
import { UsageBar } from "./usage-bar.js";
import { Card, CardHeader, Text, mergeStyle } from "./ui-primitives.js";
import { DiffStats } from "./diff-view.js";
import { TodoList } from "./todo-list.js";
import { CollapsibleSection } from "./collapsible-section.js";


afterEach(() => {
  provideHostTheme(undefined);
  document.body.replaceChildren();
});

describe("sdk CRAP edge paths", () => {
  it("mutation: prefers-color-scheme falls back to light when matchMedia is absent", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });
    provideHostTheme(undefined);
    const theme = resolveTheme(undefined);
    expect(theme.kind).toBe("light");
    expect(theme.bg.editor).not.toBe(canvasPaletteDark.editor);
  });

  it("crap:resolveTheme: empty kind falls back; brand/primary/editor overrides apply", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
    const light = resolveTheme({ kind: "" });
    expect(light.kind).toBe("light");

    const themed = resolveTheme({
      kind: "dark",
      brand: "default",
      primary: "#112233",
      editorBackground: "#010101",
      editorForeground: "#fafafa",
    });
    expect(themed.kind).toBe("dark");
    expect(themed.bg.editor).toBe("#010101");
    expect(themed.text.primary).toBe("#fafafa");
  });

  it("crap:buildHostTokens: default brand, hc-light, primary override, invalid primary", () => {
    const defLight = buildHostTokens("light", { brand: "default" });
    expect(defLight.brand).toBe("default");
    expect(defLight.palette.accent).toBe(canvasPaletteLight.accent);

    const withPrimary = buildHostTokens("dark", {
      brand: "default",
      primary: "#ff0000",
    });
    expect(withPrimary.brand).toBe("default");
    expect(withPrimary.palette.accent).toBe("#ff0000");

    const hc = buildHostTokens("hc-light", {});
    expect(hc.palette.editor).toBe(canvasPaletteLight.editor);

    const invalid = applyPrimaryColor(canvasPaletteDark, "nope");
    expect(invalid).toBe(canvasPaletteDark);

    const lightAccent = applyPrimaryColor(canvasPaletteDark, "EEEEEE");
    expect(lightAccent.buttonForeground).toBe(canvasPaletteLight.foreground);

    const surfacesNone = applyWorkbenchSurfaces(canvasPaletteDark, {});
    expect(surfacesNone).toBe(canvasPaletteDark);

    const fgOnly = applyWorkbenchSurfaces(canvasPaletteDark, {
      editorForeground: "#abcdef",
    });
    expect(fgOnly.foreground).toBe("#abcdef");
    expect(fgOnly.editor).toBe(canvasPaletteDark.editor);
  });

  it("crap:computeDAGLayout: horizontal layout, orphan edges, and empty graph", () => {
    const empty = computeDAGLayout({ nodes: [], edges: [] });
    expect(empty.nodes).toEqual([]);
    expect(empty.edges).toEqual([]);
    expect(empty.width).toBeGreaterThan(0);

    const noEdges = computeDAGLayout({
      nodes: [{ id: "solo-a" }, { id: "solo-b" }],
      edges: [],
    });
    expect(noEdges.edges).toEqual([]);
    expect(noEdges.nodes.map((n) => n.id).sort()).toEqual(["solo-a", "solo-b"]);

    const horiz = computeDAGLayout({
      direction: "horizontal",
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { from: "a", to: "b" },
        { from: "missing", to: "a" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
        { from: "a", to: "ghost" },
      ],
    });
    expect(horiz.direction).toBe("horizontal");
    expect(horiz.nodes).toHaveLength(3);
    expect(horiz.edges).toHaveLength(3);
    expect(
      horiz.edges.every(
        (e) =>
          ["a", "b", "c"].includes(e.from) && ["a", "b", "c"].includes(e.to),
      ),
    ).toBe(true);
    expect(horiz.edges.some((e) => e.from === "missing" || e.to === "ghost")).toBe(
      false,
    );
    expect(horiz.edges.some((e) => e.isBackEdge)).toBe(true);
    expect(horiz.width).toBeGreaterThan(horiz.nodes[0]!.x);
  });

  it("crap:Toggle: md size and disabled reject click without calling onChange", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let clicks = 0;
    let root: ReturnType<typeof createRoot>;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(Toggle, {
          checked: true,
          size: "md",
          disabled: true,
          onChange: () => {
            clicks += 1;
          },
        }),
      );
    });
    const btn = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-checked")).toBe("true");
    act(() => {
      btn.click();
    });
    expect(clicks).toBe(0);
    act(() => root.unmount());
  });

  it("crap:UsageBar: empty segments and zero total still render", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(UsageBar, {
          total: 0,
          segments: [],
          topLeftLabel: "0%",
        }),
      );
    });
    expect(container.textContent).toContain("0%");
    act(() => root.unmount());
  });

  it("crap:BarChart: empty categories and reference lines render without throw", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    let err: unknown;
    act(() => {
      root = createRoot(container);
      try {
        root.render(
          createElement(
            "div",
            null,
            createElement(BarChart, {
              categories: [],
              series: [],
            }),
            createElement(BarChart, {
              categories: ["A", "B"],
              series: [
                { name: "S", data: [0, 2], tone: "neutral" },
                { name: "T", data: [1, 3], tone: "info" },
              ],
              horizontal: true,
              showValues: true,
              beginAtZero: false,
              yMin: 0,
              yMax: 10,
              valuePrefix: "$",
              referenceLines: [{ value: 5, label: "mid", tone: "danger" }],
            }),
            createElement(BarChart, {
              categories: ["X", "Y"],
              series: [
                { name: "A", data: [2, 4] },
                { name: "B", data: [1, 3], tone: "success" },
              ],
              showValues: true,
              referenceLines: [{ value: 3, tone: "info" }, { value: 1 }],
            }),
            createElement(BarChart, {
              categories: ["A"],
              series: [{ name: "N", data: [4], tone: "warning" }],
              normalized: true,
              stacked: true,
            }),
            createElement(LineChart, {
              categories: ["A", "B"],
              series: [{ name: "L", data: [1, 1], tone: "success" }],
              beginAtZero: false,
              showValues: true,
            }),
            createElement(PieChart, {
              data: [{ label: "only", value: 1, tone: "warning" }],
            }),
          ),
        );
      } catch (e) {
        err = e;
      }
    });
    expect(err).toBeUndefined();
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("crap:CardHeader: collapsible toggle and sticky lg header render", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    let openChanges = 0;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          Card,
          {
            collapsible: true,
            defaultOpen: true,
            size: "lg",
            stickyHeader: true,
            onOpenChange: () => {
              openChanges += 1;
            },
          },
          createElement(
            CardHeader,
            { trailing: createElement(Text, null, "trail") },
            "titled",
          ),
        ),
      );
    });
    expect(container.textContent).toContain("titled");
    expect(container.textContent).toContain("trail");
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    act(() => {
      btn!.click();
    });
    expect(openChanges).toBe(1);
    act(() => root.unmount());
  });

  it("crap:CardHeader: non-collapsible base header renders as header", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          Card,
          { size: "base" },
          createElement(CardHeader, null, "static"),
        ),
      );
    });
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("static");
    act(() => root.unmount());
  });

  it("crap:Text: tone size truncate and nested span variants render", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          "div",
          null,
          createElement(Text, { tone: "secondary", size: "small" }, "sec"),
          createElement(
            Text,
            { tone: "tertiary", as: "span", truncate: "start", italic: true },
            "trunc",
          ),
          createElement(
            Text,
            { weight: "bold", truncate: true },
            createElement(Text, { tone: "quaternary" }, "nested"),
          ),
        ),
      );
    });
    expect(container.textContent).toContain("sec");
    expect(container.textContent).toContain("trunc");
    expect(container.textContent).toContain("nested");
    expect(container.querySelector("span")).not.toBeNull();
    act(() => root.unmount());
  });

  it("mutation: parseCanvasHostThemeBrand always default; canvasRadiusForBrand", () => {
    expect(parseCanvasHostThemeBrand("default")).toBe("default");
    expect(parseCanvasHostThemeBrand("other")).toBe("default");
    expect(parseCanvasHostThemeBrand(undefined)).toBe("default");
    expect(parseCanvasHostThemeBrand(null)).toBe("default");

    expect(canvasRadiusForBrand("default")).toBe(canvasRadius);
    expect(canvasRadiusForBrand("default").md).toBe(6);
  });

  it("mutation: provideHostTheme emits and useHostTheme reflects brand/radius", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    const latest = { brand: "", radiusMd: 0 };
    function Probe() {
      const theme = useHostTheme();
      latest.brand = theme.brand;
      latest.radiusMd = theme.radius.md;
      return null;
    }
    provideHostTheme({ kind: "light", brand: "default" });
    act(() => {
      root = createRoot(container);
      root.render(createElement(Probe));
    });
    expect(latest.brand).toBe("default");
    expect(latest.radiusMd).toBe(6);

    act(() => {
      provideHostTheme({ kind: "dark", brand: "default" });
    });
    expect(latest.brand).toBe("default");
    expect(latest.radiusMd).toBe(6);
    act(() => root.unmount());
  });

  it("mutation: mergeStyle copies base and lets override win", () => {
    const base = { padding: 8, color: "red" };
    const merged = mergeStyle(base, { color: "blue", margin: 4 });
    expect(merged).toEqual({ padding: 8, color: "blue", margin: 4 });
    expect(merged).not.toBe(base);
    const copy = mergeStyle(base);
    expect(copy).toEqual(base);
    expect(copy).not.toBe(base);
    expect(mergeStyle(base, undefined)).toEqual(base);
  });

  it("mutation: DiffStats null when additions+deletions both 0; TodoList null when empty", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          "div",
          { id: "wrap" },
          createElement(DiffStats, { additions: 0, deletions: 0 }),
          createElement(TodoList, { todos: [] }),
          createElement(DiffStats, { additions: 2, deletions: 0 }),
        ),
      );
    });
    expect(container.querySelector("#wrap")!.childElementCount).toBe(1);
    expect(container.textContent).toContain("+2");
    expect(container.textContent).not.toContain("-");
    act(() => root.unmount());
  });

  it("mutation: CollapsibleSection toggle opens and closes children", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          CollapsibleSection,
          { title: "Tools", defaultOpen: false },
          createElement("span", { "data-testid": "body" }, "nested-body"),
        ),
      );
    });
    expect(container.textContent).toContain("Tools");
    expect(container.textContent).not.toContain("nested-body");
    const btn = container.querySelector("button")!;
    act(() => {
      btn.click();
    });
    expect(container.textContent).toContain("nested-body");
    act(() => {
      btn.click();
    });
    expect(container.textContent).not.toContain("nested-body");
    act(() => root.unmount());
  });

  it("mutation: UsageBar weight clamps non-positive; chart toneColor maps danger", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          "div",
          null,
          createElement(UsageBar, {
            total: 100,
            segments: [
              { id: "ok", value: 40, color: "blue" },
              { id: "neg", value: -10, color: "red" },
              { id: "nan", value: Number.NaN, color: "green" },
              { id: "zero", value: 0, color: "purple" },
            ],
          }),
          createElement(BarChart, {
            categories: ["A"],
            series: [{ name: "E", data: [4], tone: "danger" }],
          }),
        ),
      );
    });
    const usageRoot = container.firstElementChild!
      .firstElementChild as HTMLElement;
    const track = usageRoot.lastElementChild as HTMLElement;
    const widths = [...track.children].map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths).toEqual(["40%", "60%"]);

    const dangerFill = chartPalette.darkAmber;
    const svg = container.querySelector('svg[aria-label="bar chart"]');
    expect(svg).toBeTruthy();
    const withDanger = [...(svg?.querySelectorAll("[fill]") ?? [])].some(
      (el) => el.getAttribute("fill") === dangerFill,
    );
    expect(withDanger).toBe(true);
    act(() => root.unmount());
  });

  it("mutation: computeDAGLayout node positions and back-edge flags", () => {
    const layout = computeDAGLayout({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
      direction: "vertical",
      nodeWidth: 100,
      nodeHeight: 40,
      rankGap: 60,
      nodeGap: 48,
      padding: 20,
    });
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    expect(a.rank).toBe(0);
    expect(b.rank).toBe(1);
    expect(a.x).toBe(20);
    expect(a.y).toBe(20);
    expect(b.y).toBe(20 + 40 + 60);
    expect(b.x).toBe(20);
    const forward = layout.edges.find((e) => e.from === "a" && e.to === "b")!;
    const back = layout.edges.find((e) => e.from === "b" && e.to === "a")!;
    expect(forward.isBackEdge).toBe(false);
    expect(back.isBackEdge).toBe(true);
    expect(forward.sourceY).toBe(a.y + 40);
    expect(forward.targetY).toBe(b.y);
  });
});
