import { forwardRef } from "react";
import { Pressable, type PressableProps, type View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useControlledState } from "../../hooks/use-controlled-state";
import { cn } from "../../utils/cn";

const SIZE = 22;

export type CheckboxProps = Omit<
  PressableProps,
  "onPress" | "disabled" | "style"
> & {
  isSelected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (next: boolean) => void;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
};

/**
 * Native checkbox with check/indeterminate states.
 * - Tap toggles `isSelected`.
 * - When `isIndeterminate` is true, the SVG renders a dash regardless of selection
 *   (matches HTML <input type=checkbox>'s indeterminate behavior).
 */
export const Checkbox = forwardRef<View, CheckboxProps>((props, ref) => {
  const {
    isSelected,
    defaultSelected = false,
    onSelectedChange,
    isIndeterminate = false,
    isDisabled = false,
    className,
    accessibilityLabel,
    ...rest
  } = props;

  const [selected, setSelected] = useControlledState(
    isSelected,
    defaultSelected,
    onSelectedChange,
  );

  const showFilled = selected || isIndeterminate;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        disabled: isDisabled,
        checked: isIndeterminate ? "mixed" : selected,
      }}
      disabled={isDisabled}
      onPress={() => setSelected(!selected)}
      className={cn(
        "items-center justify-center rounded-md border",
        showFilled ? "border-primary bg-primary" : "border-input bg-card",
        isDisabled && "opacity-50",
        className,
      )}
      style={{ width: SIZE, height: SIZE }}
      {...rest}
    >
      {showFilled ? (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
          {isIndeterminate ? (
            <Path
              d="M4 8H12"
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ) : (
            <Path
              d="M3 8.5L6.5 12L13 4"
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
      ) : null}
    </Pressable>
  );
});

Checkbox.displayName = "Checkbox";
