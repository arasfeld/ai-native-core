import { forwardRef } from "react";
import {
  Pressable,
  type PressableProps,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { useControlledState } from "../../hooks/use-controlled-state";
import { cn } from "../../utils/cn";
import * as haptics from "../../utils/haptics";

const TRACK_WIDTH = 50;
const TRACK_HEIGHT = 30;
const THUMB_SIZE = 26;
const THUMB_INSET = 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

export type SwitchProps = Omit<
  PressableProps,
  "onPress" | "disabled" | "style"
> & {
  isSelected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (next: boolean) => void;
  isDisabled?: boolean;
  style?: ViewStyle;
  /** Tint applied when the switch is on. Defaults to `bg-primary`. */
  activeClassName?: string;
  /** Tint applied when the switch is off. Defaults to `bg-muted`. */
  inactiveClassName?: string;
};

/**
 * Animated on/off toggle. Mirrors heroui-native's `isSelected` / `onSelectedChange` API
 * but with a simpler internal implementation.
 */
export const Switch = forwardRef<View, SwitchProps>((props, ref) => {
  const {
    isSelected,
    defaultSelected = false,
    onSelectedChange,
    isDisabled = false,
    className,
    activeClassName: _activeClassName,
    inactiveClassName: _inactiveClassName,
    style,
    accessibilityLabel,
    ...rest
  } = props;

  const [selected, setSelected] = useControlledState(
    isSelected,
    defaultSelected,
    onSelectedChange,
  );

  const progress = useDerivedValue(() =>
    withTiming(selected ? 1 : 0, { duration: 180 }),
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <Pressable
      ref={ref}
      accessibilityRole="switch"
      accessibilityState={{ disabled: isDisabled, checked: selected }}
      accessibilityLabel={accessibilityLabel}
      disabled={isDisabled}
      onPress={() => {
        haptics.selection();
        setSelected(!selected);
      }}
      className={cn(
        "items-start justify-center rounded-full",
        selected ? "bg-primary" : "bg-muted",
        isDisabled && "opacity-50",
        className,
      )}
      style={[
        {
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          padding: THUMB_INSET,
        },
        style,
      ]}
      {...rest}
    >
      <Animated.View
        className="bg-card"
        style={[
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
          thumbStyle,
        ]}
      />
    </Pressable>
  );
});

Switch.displayName = "Switch";
