import type { ReactNode } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useParallaxScroll } from "./context";

export type ParallaxCollapseProps = {
  /**
   * Scroll range [start, end] over which children collapse from full height
   * + full opacity (at start) to zero height + zero opacity (at end).
   */
  scrollRange: readonly [number, number];
  children: ReactNode;
};

/**
 * Wraps a hero section so it sequentially collapses (height + opacity) as the
 * parallax surface scrolls through `scrollRange`. Use multiple wrappers with
 * staggered ranges to make a hero shrink piece-by-piece — e.g. an AI pill at
 * 0→50, a description at 30→80, a meta row at 60→110 — so the hero never
 * leaves a tall empty accent band as it scrolls away.
 *
 * Each wrapper measures its child's natural height on layout and animates the
 * wrapper's height between that and zero. Put any spacing margins INSIDE the
 * wrapper (e.g. a child with `mt-3`) so the margin collapses too.
 */
export function ParallaxCollapse({
  scrollRange,
  children,
}: ParallaxCollapseProps) {
  const { scrollY } = useParallaxScroll();
  const naturalHeight = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    // Only grow. Once we collapse the wrapper, the inner view re-lays out at
    // the smaller height and reports it back — without this guard, we'd clobber
    // the captured natural height to 0 and the section could never re-expand.
    const h = e.nativeEvent.layout.height;
    if (h > naturalHeight.value) {
      naturalHeight.value = h;
    }
  };

  const style = useAnimatedStyle(() => {
    if (naturalHeight.value === 0) {
      // Not measured yet — let children determine height naturally so the
      // first paint isn't a height:0 flash.
      return { opacity: 1 };
    }
    const t = interpolate(
      scrollY.value,
      [scrollRange[0], scrollRange[1]],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      height: naturalHeight.value * t,
      opacity: t,
    };
  });

  return (
    <Animated.View style={[style, { overflow: "hidden" }]}>
      <View onLayout={handleLayout}>{children}</View>
    </Animated.View>
  );
}
