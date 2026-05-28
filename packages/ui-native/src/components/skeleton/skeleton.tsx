import { forwardRef, useEffect } from "react";
import type { View, ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { cn } from "../../utils/cn";

export type SkeletonProps = ViewProps;

/**
 * Pulsing placeholder. Sizing comes from className/style — Skeleton just
 * paints a muted background with an opacity pulse.
 */
export const Skeleton = forwardRef<View, SkeletonProps>((props, ref) => {
  const { className, style, ...rest } = props;
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      ref={ref}
      className={cn("rounded-md bg-muted", className)}
      style={[animatedStyle, style]}
      {...rest}
    />
  );
});

Skeleton.displayName = "Skeleton";
