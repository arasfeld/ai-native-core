import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

type GradientPoint = { x: number; y: number };

export type GradientFillProps = Omit<ViewProps, "children"> & {
  colors: readonly [string, string, ...string[]];
  locations?: readonly number[];
  start?: GradientPoint;
  end?: GradientPoint;
  /**
   * When set, wraps the gradient in a View with this opacity. Use when your
   * colors are HSL/named strings that can't carry an alpha channel — let the
   * gradient fade to "transparent" and dim the whole thing via `opacity`.
   */
  opacity?: number;
};

const DEFAULT_START: GradientPoint = { x: 0, y: 0 };
const DEFAULT_END: GradientPoint = { x: 1, y: 1 };

/**
 * Absolutely-positioned gradient wash. Drops behind any positioned parent
 * (Card, Pressable, View) and stretches to fill it. Use instead of an
 * <Svg> + <Rect> absolute-fill, which doesn't reliably size against an
 * absolute-positioned parent in react-native-svg.
 */
export const GradientFill = forwardRef<View, GradientFillProps>(
  (props, ref) => {
    const {
      colors,
      locations,
      start = DEFAULT_START,
      end = DEFAULT_END,
      opacity,
      style,
      pointerEvents = "none",
      ...rest
    } = props;

    return (
      <View
        ref={ref}
        style={[
          StyleSheet.absoluteFill,
          opacity !== undefined ? { opacity } : null,
          style,
        ]}
        pointerEvents={pointerEvents}
        {...rest}
      >
        <LinearGradient
          colors={colors}
          locations={
            locations as readonly [number, number, ...number[]] | undefined
          }
          start={start}
          end={end}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  },
);
GradientFill.displayName = "GradientFill";
