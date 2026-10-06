/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  BarChart,
  DiffStats,
  DiffView,
  LineChart,
  PieChart,
  computeDAGLayout,
} from "./index.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("SDK charts, diff, DAG", () => {
  it("@task-4: chart and diff components render without error and computeDAGLayout returns usable layout", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    let renderError: unknown;

    const fixture = createElement(
      "div",
      null,
      createElement(BarChart, {
        categories: ["Mon", "Tue", "Wed"],
        series: [
          { name: "Requests", data: [120, 90, 150] },
          { name: "Errors", data: [3, 5, 2], tone: "danger" },
        ],
        stacked: true,
      }),
      createElement(LineChart, {
        categories: ["Jan", "Feb", "Mar"],
        series: [{ name: "Revenue", data: [100, 140, 120] }],
        fill: true,
      }),
      createElement(PieChart, {
        data: [
          { label: "IDE", value: 120 },
          { label: "CLI", value: 30, tone: "info" },
          { label: "Cloud", value: 50 },
        ],
        donut: true,
      }),
      createElement(DiffStats, { additions: 5, deletions: 2 }),
      createElement(DiffView, {
        path: "src/utils.ts",
        lines: [
          {
            type: "unchanged",
            content: "export function add(a: number, b: number): number {",
            lineNumber: 1,
          },
          { type: "removed", content: "  return a + b;", lineNumber: 2 },
          {
            type: "added",
            content: "  return a + b;",
            lineNumber: 2,
          },
          { type: "unchanged", content: "}", lineNumber: 3 },
        ],
      }),
    );

    act(() => {
      root = createRoot(container);
      try {
        root.render(fixture);
      } catch (err) {
        renderError = err;
      }
    });

    expect(renderError).toBeUndefined();
    expect(container.querySelector('svg[aria-label="bar chart"]')).toBeTruthy();
    expect(container.querySelector('svg[aria-label="line chart"]')).toBeTruthy();
    expect(container.querySelector('svg[aria-label="pie chart"]')).toBeTruthy();
    expect(container.textContent).toContain("+5");
    expect(container.textContent).toContain("-2");
    expect(container.querySelector('[aria-label="diff"]')).toBeTruthy();

    const layout = computeDAGLayout({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "d" },
        { from: "c", to: "a" },
      ],
    });

    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(4);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.ranks.length).toBeGreaterThan(0);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.rank).toBeGreaterThanOrEqual(0);
    }
    for (const e of layout.edges) {
      expect(Number.isFinite(e.sourceX)).toBe(true);
      expect(Number.isFinite(e.targetY)).toBe(true);
    }
    const back = layout.edges.filter((e) => e.isBackEdge);
    expect(back.some((e) => e.from === "c" && e.to === "a")).toBe(true);
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    expect(b.rank).toBeGreaterThan(a.rank);

    act(() => {
      root.unmount();
    });
  });

  it("negative values stay inside the plot and an all-negative series keeps min below max", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;

    act(() => {
      root = createRoot(container);
      root.render(
        createElement(
          "div",
          null,
          createElement(LineChart, {
            categories: ["low", "high"],
            series: [{ name: "mixed", data: [-4, 8] }],
          }),
          createElement(LineChart, {
            categories: ["deep", "shallow"],
            series: [{ name: "neg", data: [-8, -2] }],
          }),
        ),
      );
    });

    const charts = container.querySelectorAll('svg[aria-label="line chart"]');
    expect(charts).toHaveLength(2);

    const ys = (svg: Element) =>
      [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));

    const inside = (svg: Element, cy: number) => {
      const height = Number(svg.getAttribute("viewBox")?.split(" ")[3]);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(height);
    };

    const mixed = ys(charts[0]!);
    expect(mixed).toHaveLength(2);
    inside(charts[0]!, mixed[0]!);
    inside(charts[0]!, mixed[1]!);
    expect(mixed[0]).toBeGreaterThan(mixed[1]!);

    const neg = ys(charts[1]!);
    expect(neg).toHaveLength(2);
    inside(charts[1]!, neg[0]!);
    inside(charts[1]!, neg[1]!);
    expect(neg[0]).toBeGreaterThan(neg[1]!);

    act(() => {
      root.unmount();
    });
  });

  it("a one-value pie draws a circle", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;

    act(() => {
      root = createRoot(container);
      root.render(
        createElement(PieChart, {
          data: [{ label: "only", value: 4 }],
          size: 200,
        }),
      );
    });

    const svg = container.querySelector('svg[aria-label="pie chart"]');
    expect(svg).not.toBeNull();
    const circle = svg!.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle!.getAttribute("cx")).toBe("100");
    expect(circle!.getAttribute("cy")).toBe("100");
    expect(circle!.getAttribute("r")).toBe("92");
    expect(svg!.querySelector("path")).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
