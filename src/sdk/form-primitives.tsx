/** team-canvas SDK form primitives. */
import { useEffect, useRef, type CSSProperties, type JSX, type ReactNode } from "react";
import { useHostTheme } from "./hooks.js";

const controlBase = (
  theme: ReturnType<typeof useHostTheme>,
): CSSProperties => ({
  boxSizing: "border-box",
  font: "inherit",
  fontSize: 13,
  lineHeight: "18px",
  color: theme.text.primary,
  background: theme.fill.tertiary,
  border: `1px solid ${theme.stroke.secondary}`,
  borderRadius: 6,
  outline: "none",
});

export type TextInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "email" | "password" | "number" | "url" | "search";
  style?: CSSProperties;
};

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  style,
}: TextInputProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        ...controlBase(theme),
        height: 28,
        padding: "0 8px",
        width: "100%",
        ...style,
      }}
    />
  );
}

export type TextAreaProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  style?: CSSProperties;
};

export function TextArea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  style,
}: TextAreaProps): JSX.Element {
  const theme = useHostTheme();
  const ref = useRef<HTMLTextAreaElement>(null);
  // ponytail: auto-resize via scrollHeight; ceiling is O(n) layout thrash on huge pastes — swap to CSS field-sizing when baseline allows
  useEffect(() => {
    const el = ref.current;
    if (!el || style?.height != null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, rows, style?.height]);

  return (
    <textarea
      ref={ref}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        ...controlBase(theme),
        padding: "6px 8px",
        width: "100%",
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
    />
  );
}

export type CheckboxProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  style?: CSSProperties;
};

export function Checkbox({
  checked = false,
  onChange,
  disabled,
  label,
  style,
}: CheckboxProps): JSX.Element {
  const theme = useHostTheme();
  const box = (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.checked)}
      style={{
        accentColor: theme.accent.primary,
        width: 14,
        height: 14,
        margin: 0,
        cursor: disabled ? "default" : "pointer",
      }}
    />
  );
  if (label == null) {
    return <span style={style}>{box}</span>;
  }
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: theme.text.primary,
        fontSize: 13,
        lineHeight: "18px",
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {box}
      <span>{label}</span>
    </label>
  );
}

export type ToggleProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
};

export function Toggle({
  checked = false,
  onChange,
  disabled,
  size = "sm",
  style,
}: ToggleProps): JSX.Element {
  const theme = useHostTheme();
  const trackH = size === "md" ? 20 : 16;
  const trackW = size === "md" ? 36 : 28;
  const knob = trackH - 4;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{
        width: trackW,
        height: trackH,
        borderRadius: 999,
        border: "none",
        padding: 2,
        background: checked ? theme.accent.primary : theme.fill.secondary,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: knob,
          height: knob,
          borderRadius: 999,
          background: theme.text.onAccent,
          display: "block",
        }}
      />
    </button>
  );
}

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
};

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
}: SelectProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        ...controlBase(theme),
        height: 28,
        padding: "0 8px",
        width: "100%",
        colorScheme:
          theme.kind === "light" || theme.kind === "hc-light" ? "light" : "dark",
        ...style,
      }}
    >
      {placeholder != null ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export type IconButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "circle";
  size?: "sm" | "md";
  style?: CSSProperties;
};

export function IconButton({
  children,
  onClick,
  disabled,
  title,
  variant = "default",
  size = "md",
  style,
}: IconButtonProps): JSX.Element {
  const theme = useHostTheme();
  const dim = size === "sm" ? 16 : 20;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: dim,
        height: dim,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: variant === "circle" ? 999 : 4,
        background:
          variant === "circle" ? theme.fill.tertiary : "transparent",
        color: theme.text.primary,
        cursor: disabled ? "default" : "pointer",
        font: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
