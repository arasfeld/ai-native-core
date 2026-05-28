import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export type ScrimEdge = "top" | "bottom" | "left" | "right";

export type ScrimProps = Omit<ViewProps, "children"> & {
  /** Which edge the opaque end of the fade sits on. Default: "bottom". */
  from?: ScrimEdge;
  /** Max opacity reached at the opaque edge. 0-1. Default: 0.55. */
  strength?: number;
  /** Color of the opaque end. Default: "#000". */
  color?: string;
};

const COORDS: Record<
  ScrimEdge,
  { start: { x: number; y: number }; end: { x: number; y: number } }
> = {
  top: { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
  bottom: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  left: { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
  right: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

/**
 * Solid-to-transparent fade along one edge — typically over an image so
 * overlaid text stays legible. The transparent end is at the opposite edge.
 */
export const Scrim = forwardRef<View, ScrimProps>((props, ref) => {
  const {
    from = "bottom",
    strength = 0.55,
    color = "#000",
    style,
    pointerEvents = "none",
    ...rest
  } = props;

  const { start, end } = COORDS[from];
  const opaque = rgbaWithOpacity(color, strength);

  return (
    <View
      ref={ref}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={pointerEvents}
      {...rest}
    >
      <LinearGradient
        colors={["transparent", opaque]}
        start={start}
        end={end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});
Scrim.displayName = "Scrim";

/**
 * Tries hex shortcut for "#rrggbb" / "#rgb" so a "#000" + 0.55 → "#00000023"…
 * Falls back to wrapping the View itself in opacity for unknown formats.
 */
function rgbaWithOpacity(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    if (expanded.length === 6) {
      const ah = Math.round(a * 255)
        .toString(16)
        .padStart(2, "0");
      return `#${expanded}${ah}`;
    }
  }
  // Best-effort for rgb(...): convert to rgba(...). Anything else, return
  // as-is and let the caller use a darker color if needed.
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${a})`);
  }
  return color;
}
