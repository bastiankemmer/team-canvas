/** team-canvas SDK UI primitives. */
import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import { useHostTheme } from "./hooks.js";

export function mergeStyle(
  base: CSSProperties,
  override?: CSSProperties,
): CSSProperties {
  return override ? { ...base, ...override } : { ...base };
}

const flexAlign = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
} as const;

const flexJustify = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
} as const;

export type StackProps = {
  children?: ReactNode;
  gap?: number;
  style?: CSSProperties;
};

export function Stack({ children, gap = 0, style }: StackProps): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {children}
    </div>
  );
}

export type RowProps = {
  children?: ReactNode;
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "space-between";
  wrap?: boolean;
  style?: CSSProperties;
};

export function Row({
  children,
  gap = 0,
  align = "start",
  justify = "start",
  wrap = false,
  style,
}: RowProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap,
        alignItems: flexAlign[align],
        justifyContent: flexJustify[justify],
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type GridProps = {
  children?: ReactNode;
  columns: number | string;
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  style?: CSSProperties;
};

export function Grid({
  children,
  columns,
  gap = 0,
  align,
  style,
}: GridProps): JSX.Element {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          typeof columns === "number"
            ? `repeat(${columns}, minmax(0, 1fr))`
            : columns,
        gap,
        alignItems: align ? flexAlign[align] : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type DividerProps = { style?: CSSProperties };

export function Divider({ style }: DividerProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <hr
      style={{
        border: 0,
        borderTop: `1px solid ${theme.stroke.tertiary}`,
        margin: 0,
        width: "100%",
        ...style,
      }}
    />
  );
}

export function Spacer(): JSX.Element {
  return <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0 }} />;
}

export type TableColumnAlign = "left" | "center" | "right";
export type TableRowTone =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral";

export type TableProps = {
  headers: ReactNode[];
  rows: ReactNode[][];
  columnAlign?: Array<TableColumnAlign | undefined>;
  rowTone?: Array<TableRowTone | undefined>;
  framed?: boolean;
  striped?: boolean;
  stickyHeader?: boolean;
  style?: CSSProperties;
  emptyMessage?: ReactNode;
};

const ROW_TONE: Record<TableRowTone, string> = {
  success: "#3DDC97",
  danger: "#F07178",
  warning: "#E6C07B",
  info: "#61AFEF",
  neutral: "#ABB2BF",
};

export function Table({
  headers,
  rows,
  columnAlign,
  rowTone,
  framed = true,
  striped,
  stickyHeader,
  style,
  emptyMessage,
}: TableProps): JSX.Element {
  const theme = useHostTheme();
  const cols = headers.length;
  const body =
    rows.length === 0 ? (
      <tr>
        <td
          colSpan={Math.max(cols, 1)}
          style={{
            padding: "8px 10px",
            color: theme.text.tertiary,
            textAlign: "center",
          }}
        >
          {emptyMessage ?? null}
        </td>
      </tr>
    ) : (
      rows.map((row, rowIndex) => {
        const cells = Array.from({ length: cols }, (_, i) => row[i] ?? null);
        const tone = rowTone?.[rowIndex];
        return (
          <tr
            key={rowIndex}
            style={{
              background:
                striped && rowIndex % 2 === 1
                  ? theme.fill.quaternary
                  : "transparent",
            }}
          >
            {cells.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                style={{
                  textAlign: columnAlign?.[cellIndex] ?? "left",
                  padding: "8px 10px",
                  verticalAlign: "top",
                  borderBottom:
                    rowIndex === rows.length - 1
                      ? "none"
                      : `1px solid ${theme.stroke.tertiary}`,
                  color: theme.text.primary,
                }}
              >
                {cellIndex === 0 && tone ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: ROW_TONE[tone],
                        flexShrink: 0,
                      }}
                    />
                    {cell}
                  </span>
                ) : (
                  cell
                )}
              </td>
            ))}
          </tr>
        );
      })
    );

  const table = (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
        lineHeight: "18px",
      }}
    >
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th
              key={index}
              style={{
                textAlign: columnAlign?.[index] ?? "left",
                fontWeight: 590,
                padding: "8px 10px",
                color: theme.text.secondary,
                borderBottom: `1px solid ${theme.stroke.secondary}`,
                whiteSpace: "nowrap",
                position: stickyHeader ? "sticky" : undefined,
                top: stickyHeader ? 0 : undefined,
                background: stickyHeader ? theme.bg.elevated : undefined,
                zIndex: stickyHeader ? 1 : undefined,
              }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{body}</tbody>
    </table>
  );

  if (!framed) {
    return <div style={style}>{table}</div>;
  }
  return (
    <div
      style={{
        overflowX: "auto",
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 8,
        ...style,
      }}
    >
      {table}
    </div>
  );
}

export type TextWeight = "normal" | "medium" | "semibold" | "bold";
export type TextProps = {
  children?: ReactNode;
  tone?: "primary" | "secondary" | "tertiary" | "quaternary";
  size?: "body" | "small";
  as?: "p" | "span";
  weight?: TextWeight;
  italic?: boolean;
  truncate?: boolean | "start" | "end";
  style?: CSSProperties;
};

const TextNesting = createContext(false);
const WEIGHT: Record<TextWeight, number> = {
  normal: 400,
  medium: 500,
  semibold: 590,
  bold: 700,
};

function truncateStyle(
  truncate: TextProps["truncate"],
): CSSProperties {
  if (truncate === true || truncate === "end") {
    return {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    };
  }
  if (truncate === "start") {
    return {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      direction: "rtl",
      textAlign: "left",
    };
  }
  return {};
}

export function Text({
  children,
  tone = "primary",
  size = "body",
  as,
  weight = "normal",
  italic,
  truncate,
  style,
}: TextProps): JSX.Element {
  const theme = useHostTheme();
  const nested = useContext(TextNesting);
  const Tag = as ?? (nested ? "span" : "p");
  const small = size === "small";

  return (
    <TextNesting.Provider value={true}>
      <Tag
        style={{
          margin: 0,
          color: theme.text[tone],
          fontSize: small ? 12 : 14,
          lineHeight: small ? "16px" : "20px",
          fontWeight: WEIGHT[weight],
          fontStyle: italic ? "italic" : undefined,
          ...truncateStyle(truncate),
          ...style,
        }}
      >
        {children}
      </Tag>
    </TextNesting.Provider>
  );
}

export type H1Props = { children?: ReactNode; style?: CSSProperties };
export type H2Props = { children?: ReactNode; style?: CSSProperties };
export type H3Props = { children?: ReactNode; style?: CSSProperties };

function heading(
  Tag: "h1" | "h2" | "h3",
  fontSize: number,
  lineHeight: number,
) {
  return function Heading({
    children,
    style,
  }: {
    children?: ReactNode;
    style?: CSSProperties;
  }): JSX.Element {
    const theme = useHostTheme();
    return (
      <Tag
        style={{
          margin: 0,
          fontSize,
          lineHeight: `${lineHeight}px`,
          fontWeight: 590,
          color: theme.text.primary,
          ...style,
        }}
      >
        {children}
      </Tag>
    );
  };
}

export const H1 = heading("h1", 24, 30);
export const H2 = heading("h2", 18, 24);
export const H3 = heading("h3", 16, 22);

export type CodeProps = { children?: ReactNode; style?: CSSProperties };

export function Code({ children, style }: CodeProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <code
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.92em",
        background: theme.fill.tertiary,
        borderRadius: 4,
        padding: "0 4px",
        color: theme.text.primary,
        ...style,
      }}
    >
      {children}
    </code>
  );
}

export type LinkProps = {
  children?: ReactNode;
  href: string;
  style?: CSSProperties;
};

export function Link({ children, href, style }: LinkProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: theme.text.link,
        textDecoration: "underline",
        ...style,
      }}
    >
      {children}
    </a>
  );
}

export type CanvasLinkProps = {
  to: string;
  children?: ReactNode;
  style?: CSSProperties;
};

// ponytail: local safe-id rule so the SDK does not import the store. Ceiling: symlink escape is only checked in the store adapter.
function isSafeCanvasId(id: string): boolean {
  if (!id || id.includes("..") || id.includes("\\") || isAbsoluteCanvasId(id)) {
    return false;
  }
  return id.split("/").every((segment) => segment !== "" && segment !== ".");
}

function isAbsoluteCanvasId(id: string): boolean {
  return id.startsWith("/") || /^[A-Za-z]:\//.test(id);
}

function canvasHref(id: string): string {
  const path = isSafeCanvasId(id)
    ? id.split("/").map((segment) => encodeURIComponent(segment)).join("/")
    : encodeURIComponent(id);
  return "/canvas/" + path;
}

export function CanvasLink({
  to,
  children,
  style,
}: CanvasLinkProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <a
      href={canvasHref(to)}
      style={{
        color: theme.text.link,
        textDecoration: "underline",
        ...style,
      }}
    >
      {children}
    </a>
  );
}

export type CardSize = "base" | "lg";
export type CardVariant = "default" | "borderless";

export function CanvasChevron({
  expanded,
}: {
  expanded: boolean;
}): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      aria-hidden
      style={{
        display: "block",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
        flexShrink: 0,
      }}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CardCtx = {
  open: boolean;
  collapsible: boolean;
  size: CardSize;
  stickyHeader: boolean;
  toggle: () => void;
};

const CardContext = createContext<CardCtx>({
  open: true,
  collapsible: false,
  size: "base",
  stickyHeader: false,
  toggle: () => {},
});

export type CardProps = {
  children?: ReactNode;
  variant?: CardVariant;
  size?: CardSize;
  stickyHeader?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
};

export function Card({
  children,
  variant = "default",
  size = "base",
  stickyHeader = false,
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
}: CardProps): JSX.Element {
  const theme = useHostTheme();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolled;
  const toggle = () => {
    const next = !open;
    if (!controlled) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const borderless = variant === "borderless";

  return (
    <CardContext.Provider
      value={{ open, collapsible, size, stickyHeader, toggle }}
    >
      <section
        style={{
          background: borderless ? "transparent" : theme.bg.elevated,
          border: borderless ? "none" : `1px solid ${theme.stroke.secondary}`,
          borderRadius: borderless ? 0 : 8,
          overflow: "hidden",
          minWidth: 0,
          ...style,
        }}
      >
        {children}
      </section>
    </CardContext.Provider>
  );
}

export type CardHeaderProps = {
  children?: ReactNode;
  trailing?: ReactNode;
  style?: CSSProperties;
};

function cardHeaderChrome(
  theme: ReturnType<typeof useHostTheme>,
  size: CardSize,
  stickyHeader: boolean,
  style?: CSSProperties,
): CSSProperties {
  const minHeight = size === "lg" ? 32 : 28;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight,
    padding: size === "lg" ? "8px 12px" : "6px 10px",
    fontSize: 12,
    lineHeight: "16px",
    color: theme.text.primary,
    borderBottom: `1px solid ${theme.stroke.tertiary}`,
    position: stickyHeader ? "sticky" : undefined,
    top: stickyHeader ? 0 : undefined,
    background: stickyHeader ? theme.bg.elevated : undefined,
    zIndex: stickyHeader ? 1 : undefined,
    ...style,
  };
}

export function CardHeader({
  children,
  trailing,
  style,
}: CardHeaderProps): JSX.Element {
  const theme = useHostTheme();
  const { collapsible, open, size, stickyHeader, toggle } =
    useContext(CardContext);
  const chrome = cardHeaderChrome(theme, size, stickyHeader, style);

  const label = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      {collapsible ? <CanvasChevron expanded={open} /> : null}
      <span style={{ minWidth: 0 }}>{children}</span>
    </span>
  );

  if (!collapsible) {
    return (
      <header style={chrome}>
        {label}
        {trailing}
      </header>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        ...chrome,
        width: "100%",
        boxSizing: "border-box",
        font: "inherit",
        cursor: "pointer",
        background: chrome.background ?? "transparent",
        border: "none",
        borderBottom: chrome.borderBottom,
        textAlign: "left",
      }}
    >
      {label}
      {trailing}
    </button>
  );
}

export type CardBodyProps = {
  children?: ReactNode;
  style?: CSSProperties;
};

export function CardBody({
  children,
  style,
}: CardBodyProps): JSX.Element | null {
  const { collapsible, open } = useContext(CardContext);
  if (collapsible && !open) return null;
  return <div style={{ padding: 12, ...style }}>{children}</div>;
}

export type ButtonProps = {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  style?: CSSProperties;
  onClick?: () => void;
};

export function Button({
  children,
  variant = "secondary",
  disabled,
  type = "button",
  style,
  onClick,
}: ButtonProps): JSX.Element {
  const theme = useHostTheme();
  const palette =
    variant === "primary"
      ? {
          background: theme.accent.control,
          color: theme.text.onAccent,
          border: "1px solid transparent",
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.text.primary,
            border: "1px solid transparent",
          }
        : {
            background: theme.fill.tertiary,
            color: theme.text.primary,
            border: `1px solid ${theme.stroke.secondary}`,
          };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 24,
        padding: "0 8px",
        borderRadius: 6,
        font: "inherit",
        fontSize: 12,
        lineHeight: "16px",
        cursor: disabled ? "default" : "pointer",
        width: "fit-content",
        ...palette,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export type PillTone =
  | "neutral"
  | "added"
  | "deleted"
  | "renamed"
  | "success"
  | "warning"
  | "info";
export type PillSize = "sm" | "md";
export type PillProps = {
  children?: ReactNode;
  active?: boolean;
  tone?: PillTone;
  size?: PillSize;
  leadingContent?: ReactNode;
  keyboardHint?: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

function pillChrome(
  theme: ReturnType<typeof useHostTheme>,
  size: PillSize,
  active: boolean | undefined,
  interactive: boolean,
  style?: CSSProperties,
): CSSProperties {
  const small = size === "sm";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    border: small ? "none" : `1px solid ${theme.stroke.secondary}`,
    background: active ? theme.fill.primary : "transparent",
    color: theme.text.primary,
    font: "inherit",
    fontSize: small ? 11 : 12,
    lineHeight: small ? "14px" : "16px",
    padding: small ? "1px 6px" : "2px 8px",
    cursor: interactive ? "pointer" : "default",
    ...style,
  };
}

export function Pill({
  children,
  active,
  size = "md",
  leadingContent,
  keyboardHint,
  disabled,
  title,
  style,
  onClick,
}: PillProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      style={pillChrome(theme, size, active, Boolean(onClick) && !disabled, style)}
    >
      {leadingContent}
      {children}
      {keyboardHint ? (
        <span style={{ color: theme.text.tertiary, marginLeft: 4 }}>
          {keyboardHint}
        </span>
      ) : null}
    </button>
  );
}

export type StatTone = "success" | "danger" | "warning" | "info";
export type StatProps = {
  value: ReactNode;
  label: string;
  tone?: StatTone;
  style?: CSSProperties;
};

export function Stat({ value, label, tone, style }: StatProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div
        style={{
          fontSize: 20,
          lineHeight: "26px",
          fontWeight: 590,
          color: tone ? ROW_TONE[tone] : theme.text.primary,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: "16px",
          color: theme.text.secondary,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export type CalloutTone = "info" | "success" | "warning" | "danger" | "neutral";
export type CalloutProps = {
  children?: ReactNode;
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode;
  style?: CSSProperties;
};

const CALLOUT_GLYPH: Record<Exclude<CalloutTone, "neutral">, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "!",
};

export function Callout({
  children,
  tone = "info",
  title,
  icon,
  style,
}: CalloutProps): JSX.Element {
  const theme = useHostTheme();
  const color =
    tone === "neutral" ? theme.text.secondary : ROW_TONE[tone] ?? theme.text.secondary;
  const leading =
    icon ??
    (tone === "neutral" ? null : (
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `1px solid ${color}`,
          color,
          fontSize: 10,
          lineHeight: "14px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {CALLOUT_GLYPH[tone]}
      </span>
    ));

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        border: `1px solid ${theme.stroke.tertiary}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "10px 12px",
        background: theme.fill.quaternary,
        ...style,
      }}
    >
      {leading}
      <div style={{ minWidth: 0, flex: 1 }}>
        {title ? (
          <div
            style={{
              fontSize: 13,
              lineHeight: "18px",
              fontWeight: 590,
              marginBottom: 4,
              color: theme.text.primary,
            }}
          >
            {title}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 13,
            lineHeight: "18px",
            color: theme.text.secondary,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
