/** team-canvas SDK Swatch. */
import type { CSSProperties, JSX } from "react";
import type { Color } from "./canvas-tokens.js";
import { useHostTheme } from "./hooks.js";

export type SwatchProps = {
  color: Color;
  style?: CSSProperties;
};

export function Swatch({ color, style }: SwatchProps): JSX.Element {
  const theme = useHostTheme();
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 24,
        height: 24,
        borderRadius: 6,
        background: theme.category[color],
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
