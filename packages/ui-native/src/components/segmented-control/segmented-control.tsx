import { type ComponentType, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import * as haptics from "../../utils/haptics";
import { Text } from "../text";
import {
  segmentedControlLabel,
  segmentedControlRoot,
  segmentedControlSegment,
} from "./segmented-control.styles";

const TRACK_INSET = 2; // matches `p-[2px]` on the root
const ANIMATION_DURATION = 200;
const ICON_SIZE = 14;

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: string;
  /**
   * Optional leading icon (lucide-react-native component). When set, renders
   * left of the label and tints with `foreground` / `mutedForeground` to match
   * the label tone.
   */
  icon?: ComponentType<{ color: string; size: number }>;
};

export type SegmentedControlProps<T extends string = string> = {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedControlOption<T>[];
  /** Forwarded `style`. Width usually wants to be full-width; height auto. */
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  className?: string;
};

/**
 * Pill-shaped segmented control built from themed Pressables, with a
 * Reanimated thumb that slides between segments on selection change.
 *
 * Replaces `@react-native-segmented-control/segmented-control` (UISegmentedControl)
 * which only exposed 4 theme knobs — `tintColor`, `backgroundColor`, font
 * styles — not enough to match our button / filter-chip aesthetic. This impl
 * uses our theme tokens everywhere and preserves the sliding-thumb animation.
 */
export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  style,
  disabled,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>) {
  const colors = useThemeColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const segmentWidth =
    options.length > 0 ? (trackWidth - TRACK_INSET * 2) / options.length : 0;

  const translateX = useDerivedValue(() =>
    withTiming(selectedIndex * segmentWidth, {
      duration: ANIMATION_DURATION,
    }),
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handlePress(next: T) {
    if (disabled || next === value) return;
    haptics.selection();
    onChange(next);
  }

  function handleLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={handleLayout}
      className={cn(
        segmentedControlRoot({ isDisabled: disabled ?? false }),
        className,
      )}
      style={style}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: TRACK_INSET,
              bottom: TRACK_INSET,
              left: TRACK_INSET,
              width: segmentWidth,
              borderRadius: 9999,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 1,
            },
            thumbStyle,
          ]}
          className="bg-card"
        />
      ) : null}
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const Icon = opt.icon;
        return (
          <Pressable
            key={opt.value}
            onPress={() => handlePress(opt.value)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected, disabled: !!disabled }}
            accessibilityLabel={opt.label}
            className={segmentedControlSegment()}
          >
            {Icon ? (
              <Icon
                color={isSelected ? colors.foreground : colors.mutedForeground}
                size={ICON_SIZE}
              />
            ) : null}
            <Text
              numberOfLines={1}
              weight={isSelected ? "semibold" : "regular"}
              className={segmentedControlLabel({ isSelected })}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

SegmentedControl.displayName = "SegmentedControl";
