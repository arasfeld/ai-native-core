import { forwardRef, useCallback } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  type View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as haptics from "../../utils/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableFeedbackAnimation =
  | false
  | {
      scale?: number;
      duration?: number;
    };

export type PressableFeedbackProps = Omit<PressableProps, "style"> & {
  animation?: PressableFeedbackAnimation;
  style?: PressableProps["style"];
  disabled?: boolean;
  /**
   * Haptic to fire on press-in. Defaults to a light tap. Pass `false` to
   * disable for static surfaces / non-interactive touches.
   */
  haptic?: false | "tap" | "selection" | "emphasis";
};

/**
 * Pressable with a built-in scale animation on press.
 * Adapted (heavily simplified) from heroui-native PressableFeedback.
 *
 * - Default pressed scale: 0.97
 * - Pass `animation={false}` to disable the scale animation entirely.
 * - Pass `animation={{ scale: 0.9 }}` to customize.
 */
export const PressableFeedback = forwardRef<View, PressableFeedbackProps>(
  (props, ref) => {
    const {
      animation,
      onPressIn,
      onPressOut,
      style,
      disabled,
      haptic = "tap",
      children,
      ...rest
    } = props;

    const scale = useSharedValue(1);
    const animationEnabled = animation !== false;
    const pressedScale =
      typeof animation === "object" && animation?.scale !== undefined
        ? animation.scale
        : 0.97;
    const duration =
      typeof animation === "object" && animation?.duration !== undefined
        ? animation.duration
        : 120;

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(
      (event: GestureResponderEvent) => {
        if (animationEnabled && !disabled) {
          scale.value = withTiming(pressedScale, {
            duration,
            easing: Easing.out(Easing.quad),
          });
        }
        if (haptic && !disabled) {
          if (haptic === "selection") haptics.selection();
          else if (haptic === "emphasis") haptics.emphasis();
          else haptics.tap();
        }
        onPressIn?.(event);
      },
      [
        animationEnabled,
        disabled,
        scale,
        pressedScale,
        duration,
        haptic,
        onPressIn,
      ],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        if (animationEnabled) {
          scale.value = withTiming(1, {
            duration,
            easing: Easing.out(Easing.quad),
          });
        }
        onPressOut?.(event);
      },
      [animationEnabled, scale, duration, onPressOut],
    );

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={animationEnabled ? [animatedStyle, style] : style}
        {...rest}
      >
        {children as React.ReactNode}
      </AnimatedPressable>
    );
  },
);

PressableFeedback.displayName = "PressableFeedback";
