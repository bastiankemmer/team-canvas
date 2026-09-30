/** team-canvas SDK CollapsibleSection. */
import { useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { useHostTheme } from "./hooks.js";
import { CanvasChevron } from "./ui-primitives.js";

export type CollapsibleSectionProps = {
  title: string;
  leading?: ReactNode;
  count?: number;
  trailing?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  style?: CSSProperties;
};

export function CollapsibleSection({
  title,
  leading,
  count,
  trailing,
  children,
  defaultOpen = false,
  style,
}: CollapsibleSectionProps): JSX.Element {
  const theme = useHostTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={style}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 0",
          border: "none",
          background: "transparent",
          color: theme.text.primary,
          font: "inherit",
          fontSize: 13,
          lineHeight: "18px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <CanvasChevron expanded={open} />
        {leading}
        <span style={{ minWidth: 0, flex: "1 1 auto" }}>{title}</span>
        {count != null ? (
          <span style={{ color: theme.text.tertiary, fontSize: 12 }}>
            {count}
          </span>
        ) : null}
        {trailing != null ? (
          <span style={{ color: theme.text.tertiary }}>{trailing}</span>
        ) : null}
      </button>
      {open ? (
        <div style={{ paddingLeft: 20, minWidth: 0 }}>{children}</div>
      ) : null}
    </div>
  );
}
