/** team-canvas SDK UsageBar. */
import type { CSSProperties, JSX, ReactNode } from "react";
import { type Color, usageColorSequence } from "./canvas-tokens.js";
import { useHostTheme } from "./hooks.js";

export interface UsageBarSegment {
  readonly id: string;
  readonly value: number;
  readonly color?: Color;
}

export type UsageBarProps = {
  readonly segments: readonly UsageBarSegment[];
  readonly total: number;
  readonly topLeftLabel?: ReactNode;
  readonly topRightLabel?: ReactNode;
  readonly style?: CSSProperties;
};

function weight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function UsageBar({
  segments,
  total,
  topLeftLabel,
  topRightLabel,
  style,
}: UsageBarProps): JSX.Element {
  const theme = useHostTheme();
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const parts = segments.map((seg, index) => {
    const w = weight(seg.value);
    const colorName =
      seg.color ?? usageColorSequence[index % usageColorSequence.length]!;
    return {
      id: seg.id,
      width: safeTotal > 0 ? (w / safeTotal) * 100 : 0,
      color: theme.category[colorName],
    };
  });
  const used = segments.reduce((sum, s) => sum + weight(s.value), 0);
  const remainderPct =
    safeTotal > 0 ? (Math.max(0, safeTotal - used) / safeTotal) * 100 : 0;
  const showLabels = topLeftLabel != null || topRightLabel != null;

  return (
    <div style={{ minWidth: 0, ...style }}>
      {showLabels ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 4,
            fontSize: 12,
            lineHeight: "16px",
            color: theme.text.secondary,
          }}
        >
          <span>{topLeftLabel}</span>
          <span>{topRightLabel}</span>
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          gap: 2,
          height: 8,
          width: "100%",
          borderRadius: 4,
          overflow: "hidden",
          background: theme.fill.quaternary,
        }}
      >
        {parts.map((p) =>
          p.width > 0 ? (
            <div
              key={p.id}
              style={{
                width: `${p.width}%`,
                background: p.color,
                borderRadius: 3,
                minWidth: 2,
              }}
            />
          ) : null,
        )}
        {remainderPct > 0 ? (
          <div
            style={{
              width: `${remainderPct}%`,
              background: theme.fill.secondary,
              borderRadius: 3,
              minWidth: 0,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
