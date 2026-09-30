/**
 * team-canvas SDK chart primitives — pure inline SVG, zero chart libraries.
 */
import {
  createElement,
  useMemo,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import { useHostTheme } from "./hooks.js";
import type { ChartPalette } from "./canvas-tokens.js";

export type ChartTone = "success" | "danger" | "warning" | "info" | "neutral";

export type ChartDataPoint = {
  label: string;
  value: number;
};

export type ChartSeries = {
  name: string;
  data: number[];
  tone?: ChartTone;
};

export type ChartReferenceLine = {
  value: number;
  label?: string;
  tone?: ChartTone;
};

type ValueAxisProps = {
  beginAtZero?: boolean;
  yMin?: number;
  yMax?: number;
  referenceLines?: ChartReferenceLine[];
};

export type BarChartProps = ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  normalized?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  style?: CSSProperties;
};

export type LineChartProps = ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  fill?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  showHoverGuide?: boolean;
  style?: CSSProperties;
};

export type PieChartProps = {
  data: Array<ChartDataPoint & { tone?: ChartTone }>;
  size?: number;
  donut?: boolean;
  style?: CSSProperties;
};

function toneColor(tone: ChartTone | undefined, palette: ChartPalette): string | undefined {
  if (!tone) return undefined;
  switch (tone) {
    case "success":
      return palette.green;
    case "danger":
      return palette.darkAmber;
    case "warning":
      return palette.goldenYellow;
    case "info":
      return palette.blue;
    case "neutral":
      return palette.muted;
  }
}

function seriesColor(
  series: ChartSeries,
  index: number,
  sequence: readonly string[],
  palette: ChartPalette,
  singleSeriesByCategory: boolean,
  categoryIndex: number,
): string {
  const fromTone = toneColor(series.tone, palette);
  if (fromTone) return fromTone;
  if (singleSeriesByCategory) {
    return sequence[categoryIndex % sequence.length]!;
  }
  return sequence[index % sequence.length]!;
}

function formatValue(
  n: number,
  prefix = "",
  suffix = "",
): string {
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${prefix}${rounded}${suffix}`;
}

function domainMin(
  all: number[],
  beginAtZero: boolean,
  yMin: number | undefined,
): number {
  if (yMin !== undefined) return yMin;
  if (!beginAtZero && all.length) return Math.min(...all);
  return beginAtZero ? 0 : Math.min(0, ...all);
}

function domainMax(all: number[], yMax: number | undefined): number {
  if (yMax !== undefined) return yMax;
  return all.length ? Math.max(...all) : 0;
}

function domainFrom(
  values: number[],
  beginAtZero: boolean,
  yMin: number | undefined,
  yMax: number | undefined,
  refs: ChartReferenceLine[] | undefined,
): { min: number; max: number } {
  const all = [...values, ...(refs ?? []).map((r) => r.value)];
  let min = domainMin(all, beginAtZero, yMin);
  let max = domainMax(all, yMax);
  if (min === max) max = min + 1;
  return { min, max };
}

function Legend({
  items,
}: {
  items: Array<{ name: string; color: string }>;
}): JSX.Element | null {
  if (items.length < 2) return null;
  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        fontSize: 12,
        marginTop: 8,
      },
    },
    ...items.map((it) =>
      createElement(
        "span",
        {
          key: it.name,
          style: { display: "inline-flex", alignItems: "center", gap: 6 },
        },
        createElement("span", {
          style: {
            width: 10,
            height: 10,
            borderRadius: 2,
            background: it.color,
            display: "inline-block",
          },
        }),
        it.name,
      ),
    ),
  );
}

function ChartShell({
  style,
  children,
  legend,
}: {
  style?: CSSProperties;
  // optional: createElement passes children as varargs; React 19 types require prop otherwise
  children?: ReactNode;
  legend?: ReactNode;
}): JSX.Element {
  const theme = useHostTheme();
  return createElement(
    "div",
    {
      style: {
        color: theme.text.secondary,
        fontFamily: theme.typography.fontFamily,
        ...style,
      },
    },
    children,
    legend,
  );
}

type BarPlotGeom = {
  plotW: number;
  plotH: number;
  padL: number;
  padT: number;
  padB: number;
  innerW: number;
  innerH: number;
  band: number;
  barW: number;
  groupGap: number;
  horizontal: boolean;
  doStack: boolean;
  single: boolean;
};

function barPlotGeom(
  height: number,
  horizontal: boolean,
  nCat: number,
  seriesCount: number,
  doStack: boolean,
  single: boolean,
): BarPlotGeom {
  const plotW = 480;
  const plotH = height;
  const padL = horizontal ? 72 : 40;
  const padR = 16;
  const padT = 12;
  const padB = horizontal ? 24 : 36;
  const innerW = plotW - padL - padR;
  const innerH = plotH - padT - padB;
  const groupGap = 8;
  const band = (horizontal ? innerH : innerW) / Math.max(nCat, 1);
  const groupW = Math.max(band - groupGap, 4);
  const barW = doStack || single ? groupW : groupW / seriesCount;
  return {
    plotW,
    plotH,
    padL,
    padT,
    padB,
    innerW,
    innerH,
    band,
    barW,
    groupGap,
    horizontal,
    doStack,
    single,
  };
}

function stackTotalsFor(
  categories: string[],
  series: ChartSeries[],
): number[] {
  return categories.map((_, i) =>
    series.reduce((s, ser) => s + (ser.data[i] ?? 0), 0),
  );
}

function rawValuesForBars(
  doStack: boolean,
  normalized: boolean,
  stackTotals: number[],
  series: ChartSeries[],
): number[] {
  if (doStack) return normalized ? [1] : [...stackTotals];
  const raw: number[] = [];
  for (const ser of series) raw.push(...ser.data);
  return raw;
}

function barDomain(
  doStack: boolean,
  normalized: boolean,
  stackTotals: number[],
  rawValues: number[],
  beginAtZero: boolean,
  yMin: number | undefined,
  yMax: number | undefined,
  referenceLines: ChartReferenceLine[] | undefined,
): { min: number; max: number } {
  if (doStack) {
    return { min: 0, max: normalized ? 1 : Math.max(...stackTotals, 1) };
  }
  return domainFrom(rawValues, beginAtZero, yMin, yMax, referenceLines);
}

function pushBarLabel(
  bars: ReactNode[],
  opts: {
    key: string;
    horizontal: boolean;
    x: number;
    y: number;
    len: number;
    barW: number;
    text: string;
    fill: string;
  },
): void {
  if (opts.horizontal) {
    bars.push(
      createElement(
        "text",
        {
          key: opts.key,
          x: opts.x + opts.len + 4,
          y: opts.y + opts.barW / 2,
          fill: opts.fill,
          fontSize: 11,
          dominantBaseline: "middle",
        },
        opts.text,
      ),
    );
    return;
  }
  bars.push(
    createElement(
      "text",
      {
        key: opts.key,
        x: opts.x + opts.barW / 2,
        y: opts.y - 4,
        fill: opts.fill,
        fontSize: 11,
        textAnchor: "middle",
      },
      opts.text,
    ),
  );
}

function pushHorizontalBar(
  bars: ReactNode[],
  opts: {
    key: string;
    color: string;
    padL: number;
    padT: number;
    ci: number;
    si: number;
    band: number;
    barW: number;
    groupGap: number;
    doStack: boolean;
    single: boolean;
    len: number;
    base: number;
  },
): { x: number; y: number } {
  const y =
    opts.padT +
    opts.ci * opts.band +
    (opts.doStack || opts.single
      ? opts.groupGap / 2
      : opts.si * opts.barW + opts.groupGap / 2);
  const x = opts.padL + (opts.doStack ? opts.base : 0);
  bars.push(
    createElement("rect", {
      key: opts.key,
      x,
      y,
      width: Math.max(opts.len, 0),
      height: opts.barW,
      fill: opts.color,
    }),
  );
  return { x, y };
}

function pushVerticalBar(
  bars: ReactNode[],
  opts: {
    key: string;
    color: string;
    padL: number;
    padT: number;
    ci: number;
    si: number;
    band: number;
    barW: number;
    groupGap: number;
    doStack: boolean;
    single: boolean;
    len: number;
    base: number;
    innerH: number;
  },
): { x: number; y: number } {
  const x =
    opts.padL +
    opts.ci * opts.band +
    (opts.doStack || opts.single
      ? opts.groupGap / 2
      : opts.si * opts.barW + opts.groupGap / 2);
  const y =
    opts.padT + opts.innerH - (opts.doStack ? opts.base + opts.len : opts.len);
  bars.push(
    createElement("rect", {
      key: opts.key,
      x,
      y,
      width: opts.barW,
      height: Math.max(opts.len, 0),
      fill: opts.color,
    }),
  );
  return { x, y };
}

function pushOneBar(
  bars: ReactNode[],
  opts: {
    key: string;
    color: string;
    horizontal: boolean;
    padL: number;
    padT: number;
    ci: number;
    si: number;
    band: number;
    barW: number;
    groupGap: number;
    doStack: boolean;
    single: boolean;
    len: number;
    base: number;
    innerH: number;
  },
): { x: number; y: number } {
  return opts.horizontal ? pushHorizontalBar(bars, opts) : pushVerticalBar(bars, opts);
}

function pushCategoryAxisLabel(
  bars: ReactNode[],
  opts: {
    key: string;
    cat: string;
    horizontal: boolean;
    padL: number;
    padT: number;
    plotH: number;
    ci: number;
    band: number;
    fill: string;
  },
): void {
  if (opts.horizontal) {
    bars.push(
      createElement(
        "text",
        {
          key: opts.key,
          x: opts.padL - 6,
          y: opts.padT + opts.ci * opts.band + opts.band / 2,
          fill: opts.fill,
          fontSize: 11,
          textAnchor: "end",
          dominantBaseline: "middle",
        },
        opts.cat,
      ),
    );
    return;
  }
  bars.push(
    createElement(
      "text",
      {
        key: opts.key,
        x: opts.padL + opts.ci * opts.band + opts.band / 2,
        y: opts.plotH - 8,
        fill: opts.fill,
        fontSize: 11,
        textAnchor: "middle",
      },
      opts.cat,
    ),
  );
}

function pushVerticalRefLine(
  bars: ReactNode[],
  ref: ChartReferenceLine,
  opts: {
    padL: number;
    padT: number;
    innerW: number;
    innerH: number;
    scale: (v: number) => number;
    color: string;
  },
): void {
  const y = opts.padT + opts.innerH - opts.scale(ref.value);
  bars.push(
    createElement("line", {
      key: `ref-${ref.value}-${ref.label ?? ""}`,
      x1: opts.padL,
      x2: opts.padL + opts.innerW,
      y1: y,
      y2: y,
      stroke: opts.color,
      strokeDasharray: "4 3",
      strokeWidth: 1,
    }),
  );
}

function pushHorizontalRefLine(
  bars: ReactNode[],
  ref: ChartReferenceLine,
  opts: {
    padL: number;
    padT: number;
    innerH: number;
    scale: (v: number) => number;
    color: string;
  },
): void {
  const x = opts.padL + opts.scale(ref.value);
  bars.push(
    createElement("line", {
      key: `ref-${ref.value}-${ref.label ?? ""}`,
      x1: x,
      x2: x,
      y1: opts.padT,
      y2: opts.padT + opts.innerH,
      stroke: opts.color,
      strokeDasharray: "4 3",
      strokeWidth: 1,
    }),
  );
}

function pushBarReferenceLines(
  bars: ReactNode[],
  opts: {
    referenceLines: ChartReferenceLine[] | undefined;
    horizontal: boolean;
    padL: number;
    padT: number;
    innerW: number;
    innerH: number;
    scale: (v: number) => number;
    palette: ChartPalette;
  },
): void {
  for (const ref of opts.referenceLines ?? []) {
    const color =
      toneColor(ref.tone, opts.palette) ?? opts.palette.neutralLine;
    if (opts.horizontal) {
      pushHorizontalRefLine(bars, ref, { ...opts, color });
    } else {
      pushVerticalRefLine(bars, ref, { ...opts, color });
    }
  }
}

export function BarChart({
  categories,
  series,
  height = 220,
  stacked = false,
  horizontal = false,
  normalized = false,
  valueSuffix = "",
  valuePrefix = "",
  showValues,
  beginAtZero = true,
  yMin,
  yMax,
  referenceLines,
  style,
}: BarChartProps): JSX.Element {
  const theme = useHostTheme();
  const doStack = stacked || normalized;
  const single = series.length === 1;
  const autoShow =
    showValues ?? (single && !doStack && categories.length <= 8);

  const geom = barPlotGeom(
    height,
    horizontal,
    categories.length,
    series.length,
    doStack,
    single,
  );
  const stackTotals = stackTotalsFor(categories, series);
  const rawValues = rawValuesForBars(doStack, normalized, stackTotals, series);
  const { min, max } = barDomain(
    doStack,
    normalized,
    stackTotals,
    rawValues,
    beginAtZero,
    yMin,
    yMax,
    referenceLines,
  );

  const scale = (v: number) => {
    const t = (v - min) / (max - min);
    return horizontal ? t * geom.innerW : t * geom.innerH;
  };

  const legendItems = series.map((ser, i) => ({
    name: ser.name,
    color: seriesColor(ser, i, theme.chart.sequence, theme.chart.palette, false, 0),
  }));

  const bars: ReactNode[] = [];
  categories.forEach((cat, ci) => {
    let stackOffset = 0;
    series.forEach((ser, si) => {
      let v = ser.data[ci] ?? 0;
      if (normalized) {
        v = v / (stackTotals[ci] || 1);
      }
      const color = seriesColor(
        ser,
        si,
        theme.chart.sequence,
        theme.chart.palette,
        single && !doStack,
        ci,
      );
      const len = scale(v);
      const base = scale(doStack ? stackOffset : 0);
      const { x, y } = pushOneBar(bars, {
        key: `${si}-${ci}`,
        color,
        horizontal,
        padL: geom.padL,
        padT: geom.padT,
        ci,
        si,
        band: geom.band,
        barW: geom.barW,
        groupGap: geom.groupGap,
        doStack,
        single,
        len,
        base,
        innerH: geom.innerH,
      });
      if (autoShow && !doStack) {
        pushBarLabel(bars, {
          key: `l-${si}-${ci}`,
          horizontal,
          x,
          y,
          len,
          barW: geom.barW,
          text: formatValue(ser.data[ci] ?? 0, valuePrefix, valueSuffix),
          fill: theme.text.secondary,
        });
      }
      if (doStack) stackOffset += v;
    });
    pushCategoryAxisLabel(bars, {
      key: `c-${ci}`,
      cat,
      horizontal,
      padL: geom.padL,
      padT: geom.padT,
      plotH: geom.plotH,
      ci,
      band: geom.band,
      fill: theme.text.tertiary,
    });
  });

  pushBarReferenceLines(bars, {
    referenceLines,
    horizontal,
    padL: geom.padL,
    padT: geom.padT,
    innerW: geom.innerW,
    innerH: geom.innerH,
    scale,
    palette: theme.chart.palette,
  });

  return createElement(
    ChartShell,
    {
      style,
      legend: createElement(Legend, { items: legendItems }),
    },
    createElement(
      "svg",
      {
        width: "100%",
        viewBox: `0 0 ${geom.plotW} ${geom.plotH}`,
        role: "img",
        "aria-label": "bar chart",
      },
      ...bars,
    ),
  );
}

export function LineChart({
  categories,
  series,
  height = 220,
  fill = false,
  valueSuffix = "",
  valuePrefix = "",
  showValues = false,
  showHoverGuide = true,
  beginAtZero = true,
  yMin,
  yMax,
  referenceLines,
  style,
}: LineChartProps): JSX.Element {
  const theme = useHostTheme();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = 480;
  const plotH = height;
  const padL = 40;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const innerW = plotW - padL - padR;
  const innerH = plotH - padT - padB;

  const rawValues = series.flatMap((s) => s.data);
  const { min, max } = domainFrom(rawValues, beginAtZero, yMin, yMax, referenceLines);
  const nCat = Math.max(categories.length, 1);
  const xAt = (i: number) =>
    padL + (nCat === 1 ? innerW / 2 : (i / (nCat - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const legendItems = series.map((ser, i) => ({
    name: ser.name,
    color: seriesColor(ser, i, theme.chart.sequence, theme.chart.palette, false, 0),
  }));

  const nodes: ReactNode[] = [];

  series.forEach((ser, si) => {
    const color = seriesColor(
      ser,
      si,
      theme.chart.sequence,
      theme.chart.palette,
      false,
      0,
    );
    const pts = categories.map((_, i) => {
      const v = ser.data[i] ?? 0;
      return `${xAt(i)},${yAt(v)}`;
    });
    if (fill && pts.length) {
      const area = [
        `${xAt(0)},${padT + innerH}`,
        ...pts,
        `${xAt(categories.length - 1)},${padT + innerH}`,
      ].join(" ");
      nodes.push(
        createElement("polygon", {
          key: `fill-${si}`,
          points: area,
          fill: color,
          opacity: 0.15,
        }),
      );
    }
    nodes.push(
      createElement("polyline", {
        key: `line-${si}`,
        points: pts.join(" "),
        fill: "none",
        stroke: color,
        strokeWidth: 2,
      }),
    );
    categories.forEach((_, i) => {
      const v = ser.data[i] ?? 0;
      nodes.push(
        createElement("circle", {
          key: `d-${si}-${i}`,
          cx: xAt(i),
          cy: yAt(v),
          r: 3.5,
          fill: color,
        }),
      );
      if (showValues && categories.length <= 20) {
        nodes.push(
          createElement(
            "text",
            {
              key: `lv-${si}-${i}`,
              x: xAt(i),
              y: yAt(v) - 8,
              fill: theme.text.secondary,
              fontSize: 10,
              textAnchor: "middle",
            },
            formatValue(v, valuePrefix, valueSuffix),
          ),
        );
      }
    });
  });

  categories.forEach((cat, i) => {
    nodes.push(
      createElement(
        "text",
        {
          key: `c-${i}`,
          x: xAt(i),
          y: plotH - 8,
          fill: theme.text.tertiary,
          fontSize: 11,
          textAnchor: "middle",
        },
        cat,
      ),
    );
  });

  for (const ref of referenceLines ?? []) {
    const color =
      toneColor(ref.tone, theme.chart.palette) ?? theme.chart.palette.neutralLine;
    const y = yAt(ref.value);
    nodes.push(
      createElement("line", {
        key: `ref-${ref.value}`,
        x1: padL,
        x2: padL + innerW,
        y1: y,
        y2: y,
        stroke: color,
        strokeDasharray: "4 3",
        strokeWidth: 1,
      }),
    );
  }

  if (showHoverGuide && hover !== null) {
    nodes.push(
      createElement("line", {
        key: "guide",
        x1: xAt(hover),
        x2: xAt(hover),
        y1: padT,
        y2: padT + innerH,
        stroke: theme.stroke.secondary,
        strokeWidth: 1,
      }),
    );
  }

  const hitWidth = innerW / nCat;
  categories.forEach((_, i) => {
    nodes.push(
      createElement("rect", {
        key: `hit-${i}`,
        x: padL + i * hitWidth - (nCat === 1 ? 0 : hitWidth / 2),
        y: padT,
        width: hitWidth,
        height: innerH,
        fill: "transparent",
        onMouseEnter: () => setHover(i),
        onMouseLeave: () => setHover(null),
      }),
    );
  });

  const tooltip =
    hover !== null
      ? createElement(
          "div",
          { style: { fontSize: 12, marginTop: 4 } },
          `${categories[hover]}: `,
          series
            .map(
              (s) =>
                `${s.name} ${formatValue(s.data[hover] ?? 0, valuePrefix, valueSuffix)}`,
            )
            .join(" · "),
        )
      : null;

  return createElement(
    ChartShell,
    {
      style,
      legend: createElement(
        "div",
        null,
        createElement(Legend, { items: legendItems }),
        tooltip,
      ),
    },
    createElement(
      "svg",
      {
        width: "100%",
        viewBox: `0 0 ${plotW} ${plotH}`,
        role: "img",
        "aria-label": "line chart",
      },
      ...nodes,
    ),
  );
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function PieChart({
  data,
  size = 200,
  donut = false,
  style,
}: PieChartProps): JSX.Element {
  const theme = useHostTheme();
  const [hover, setHover] = useState<number | null>(null);
  const total = useMemo(
    () => data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1,
    [data],
  );

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const innerR = donut ? r * 0.55 : 0;

  let angle = -Math.PI / 2;
  const slices: ReactNode[] = [];
  data.forEach((d, i) => {
    const sweep = (Math.max(0, d.value) / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const color =
      toneColor(d.tone, theme.chart.palette) ??
      theme.chart.sequence[i % theme.chart.sequence.length]!;
    const active = hover === null || hover === i;
    const mid = (start + end) / 2;
    const explode = hover === i ? 6 : 0;
    const [ox, oy] = polar(0, 0, explode, mid);
    slices.push(
      createElement("path", {
        key: i,
        d: arcPath(cx + ox, cy + oy, r, start, end),
        fill: color,
        opacity: active ? 1 : 0.35,
        onMouseEnter: () => setHover(i),
        onMouseLeave: () => setHover(null),
      }),
    );
  });

  if (donut) {
    slices.push(
      createElement("circle", {
        key: "hole",
        cx,
        cy,
        r: innerR,
        fill: theme.bg.editor,
      }),
      createElement(
        "text",
        {
          key: "total",
          x: cx,
          y: cy,
          textAnchor: "middle",
          dominantBaseline: "middle",
          fill: theme.text.primary,
          fontSize: 14,
          fontWeight: 590,
        },
        String(Math.round(total)),
      ),
    );
  }

  const legendItems = data.map((d, i) => ({
    name: d.label,
    color:
      toneColor(d.tone, theme.chart.palette) ??
      theme.chart.sequence[i % theme.chart.sequence.length]!,
  }));

  const tip =
    hover !== null && data[hover]
      ? createElement(
          "div",
          { style: { fontSize: 12, marginTop: 4 } },
          `${data[hover].label}: ${data[hover].value} (${(
            (Math.max(0, data[hover].value) / total) *
            100
          ).toFixed(0)}%)`,
        )
      : null;

  return createElement(
    ChartShell,
    {
      style,
      legend: createElement(
        "div",
        null,
        createElement(Legend, {
          items: legendItems.length >= 1 ? legendItems : [],
        }),
        tip,
      ),
    },
    createElement(
      "svg",
      {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        role: "img",
        "aria-label": "pie chart",
      },
      ...slices,
    ),
  );
}
