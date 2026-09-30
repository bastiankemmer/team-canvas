/** team-canvas SDK barrel. */

/** React authoring utilities. */
export type { CSSProperties, RefObject } from "react";
export { useEffect, useMemo, useRef, useState } from "react";

/** Shared category color palette. */
export type {
  CanvasHostThemeBrand,
  CategoryPalette,
  ChartPalette,
  Color,
} from "./canvas-tokens.js";
export {
  categoryPaletteDark,
  categoryPaletteLight,
  colorPalette,
  usageColorSequence,
} from "./canvas-tokens.js";

/** Host state hooks. */
export type {
  CanvasAction,
  CanvasHostTheme,
  SetCanvasState,
} from "./hooks.js";
export {
  useCanvasAction,
  useCanvasState,
  useHostTheme,
} from "./hooks.js";

/** Semantic design tokens. */
export type { CanvasPalette, CanvasTokens } from "./theme.js";
export {
  canvasPaletteDark,
  canvasPaletteAltDark,
  canvasPaletteAltLight,
  canvasPaletteLight,
  canvasTokens,
  canvasTokensLight,
} from "./theme.js";

/** Form controls. */
export type {
  CheckboxProps,
  IconButtonProps,
  SelectOption,
  SelectProps,
  TextAreaProps,
  TextInputProps,
  ToggleProps,
} from "./form-primitives.js";
export {
  Checkbox,
  IconButton,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from "./form-primitives.js";

/** Collapsible disclosure. */
export type { CollapsibleSectionProps } from "./collapsible-section.js";
export { CollapsibleSection } from "./collapsible-section.js";

/** Category swatch. */
export type { SwatchProps } from "./swatch.js";
export { Swatch } from "./swatch.js";

/** Todo list. */
export type {
  TodoItem,
  TodoListCardProps,
  TodoListProps,
  TodoStatus,
} from "./todo-list.js";
export { TodoList, TodoListCard } from "./todo-list.js";

/** Usage bar. */
export type { UsageBarProps, UsageBarSegment } from "./usage-bar.js";
export { UsageBar } from "./usage-bar.js";

/** UI primitives. */
export type {
  ButtonProps,
  CalloutProps,
  CalloutTone,
  CardBodyProps,
  CardHeaderProps,
  CardProps,
  CardSize,
  CardVariant,
  CodeProps,
  DividerProps,
  GridProps,
  H1Props,
  H2Props,
  H3Props,
  LinkProps,
  PillProps,
  PillSize,
  PillTone,
  RowProps,
  StackProps,
  StatProps,
  StatTone,
  TableColumnAlign,
  TableProps,
  TableRowTone,
  TextProps,
  TextWeight,
} from "./ui-primitives.js";
export {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  mergeStyle,
  Pill,
  Row,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
} from "./ui-primitives.js";

/** Charts (owned by @task-4 — re-exported so the barrel stays complete). */
export type {
  BarChartProps,
  ChartDataPoint,
  ChartReferenceLine,
  ChartSeries,
  ChartTone,
  LineChartProps,
  PieChartProps,
} from "./chart-primitives.js";
export { BarChart, LineChart, PieChart } from "./chart-primitives.js";

/** Diff (owned by @task-4). */
export type {
  DiffLineData,
  DiffLineType,
  DiffStatsProps,
  DiffViewProps,
} from "./diff-view.js";
export { DiffStats, DiffView } from "./diff-view.js";

/** DAG layout (owned by @task-4). */
export type {
  DAGLayoutEdge,
  DAGLayoutNode,
  DAGLayoutOptions,
  DAGLayoutRank,
  DAGLayoutResult,
} from "./dag-layout.js";
export { computeDAGLayout } from "./dag-layout.js";
