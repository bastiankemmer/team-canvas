/**
 * Diff primitives. Plain-text lines (no syntax highlighting); path/language
 * accepted for API compatibility. Compose with Card chrome in canvases.
 */
import { createElement, type CSSProperties, type JSX } from "react";
import { useHostTheme } from "./hooks.js";

export type DiffStatsProps = {
  additions?: number;
  deletions?: number;
  style?: CSSProperties;
};

export function DiffStats({
  additions = 0,
  deletions = 0,
  style,
}: DiffStatsProps): JSX.Element | null {
  const theme = useHostTheme();
  if (additions === 0 && deletions === 0) return null;
  return createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        gap: 8,
        fontVariantNumeric: "tabular-nums",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        ...style,
      },
    },
    additions > 0
      ? createElement(
          "span",
          { style: { color: theme.chart.palette.green } },
          `+${additions}`,
        )
      : null,
    deletions > 0
      ? createElement(
          "span",
          { style: { color: theme.chart.palette.darkAmber } },
          `-${deletions}`,
        )
      : null,
  );
}

export type DiffLineType = "added" | "removed" | "unchanged";

export type DiffLineData = {
  type: DiffLineType;
  content: string;
  lineNumber?: number;
};

export type DiffViewProps = {
  lines: DiffLineData[];
  path?: string;
  language?: string;
  showLineNumbers?: boolean;
  coloredLineNumbers?: boolean;
  showAccentStrip?: boolean;
  style?: CSSProperties;
};

export function DiffView({
  lines,
  path: _path,
  language: _language,
  showLineNumbers = true,
  coloredLineNumbers = true,
  showAccentStrip = true,
  style,
}: DiffViewProps): JSX.Element {
  // ponytail: plain text, no syntax highlighting; path/language reserved for later
  void _path;
  void _language;
  const theme = useHostTheme();

  return createElement(
    "div",
    {
      role: "table",
      "aria-label": "diff",
      style: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: "20px",
        overflow: "auto",
        background: theme.bg.editor,
        color: theme.text.primary,
        ...style,
      },
    },
    ...lines.map((line, i) => {
      const bg =
        line.type === "added"
          ? theme.diff.insertedLine
          : line.type === "removed"
            ? theme.diff.removedLine
            : "transparent";
      const strip =
        line.type === "added"
          ? theme.diff.stripAdded
          : line.type === "removed"
            ? theme.diff.stripRemoved
            : "transparent";
      const numColor =
        coloredLineNumbers && line.type === "added"
          ? theme.chart.palette.green
          : coloredLineNumbers && line.type === "removed"
            ? theme.chart.palette.darkAmber
            : theme.text.quaternary;
      const prefix =
        line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

      return createElement(
        "div",
        {
          key: i,
          role: "row",
          style: {
            display: "flex",
            background: bg,
            whiteSpace: "pre",
          },
        },
        showAccentStrip
          ? createElement("span", {
              style: {
                width: 3,
                flexShrink: 0,
                background: strip,
              },
            })
          : null,
        showLineNumbers
          ? createElement(
              "span",
              {
                role: "cell",
                style: {
                  width: 40,
                  textAlign: "right",
                  paddingRight: 8,
                  color: numColor,
                  userSelect: "none",
                  flexShrink: 0,
                },
              },
              line.lineNumber ?? "",
            )
          : null,
        createElement(
          "span",
          {
            role: "cell",
            style: {
              paddingLeft: 8,
              paddingRight: 12,
              flex: 1,
              minWidth: 0,
            },
          },
          prefix + line.content,
        ),
      );
    }),
  );
}
