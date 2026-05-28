import { forwardRef, type ReactNode } from "react";
import type { View } from "react-native";
import { cn } from "../../utils/cn";
import {
  PressableFeedback,
  type PressableFeedbackProps,
} from "../pressable-feedback";
import { filterChipRoot } from "./filter-chip.styles";

export type FilterChipProps = Omit<PressableFeedbackProps, "children"> & {
  isSelected: boolean;
  isDisabled?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  children?: ReactNode;
  /** REQUIRED — chips often render a small dot + label and need a clear a11y name. */
  accessibilityLabel: string;
};

/**
 * Toggle-style filter chip. Renders a small pressable pill that swaps its
 * border + background between selected and unselected states. Used by the
 * year-view category / holiday toggles. Label content (and any line-through
 * styling on the unselected state) is supplied via `children` so callers can
 * choose how to style their own text.
 */
export const FilterChip = forwardRef<View, FilterChipProps>((props, ref) => {
  const {
    isSelected,
    isDisabled = false,
    startContent,
    endContent,
    children,
    className,
    accessibilityLabel,
    ...rest
  } = props;

  return (
    <PressableFeedback
      ref={ref}
      disabled={isDisabled}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      className={cn(filterChipRoot({ isSelected, isDisabled }), className)}
      {...rest}
    >
      {startContent}
      {children}
      {endContent}
    </PressableFeedback>
  );
});

FilterChip.displayName = "FilterChip";
