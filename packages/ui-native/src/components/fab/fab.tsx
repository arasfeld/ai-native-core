import { type ComponentType, forwardRef } from "react";
import type { View } from "react-native";
import { type ThemeColors, useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import {
  PressableFeedback,
  type PressableFeedbackProps,
} from "../pressable-feedback";
import { type FabVariant, fabRoot } from "./fab.styles";

type LucideIconProps = {
  color?: string;
  size?: number;
};

const ICON_TONE_KEY: Record<FabVariant, keyof ThemeColors> = {
  primary: "primaryForeground",
  secondary: "secondaryForeground",
  destructive: "destructiveForeground",
};

export type FabProps = Omit<PressableFeedbackProps, "children"> & {
  icon: ComponentType<LucideIconProps>;
  iconSize?: number;
  iconColor?: string;
  variant?: FabVariant;
  isDisabled?: boolean;
  accessibilityLabel: string;
};

export const Fab = forwardRef<View, FabProps>((props, ref) => {
  const {
    icon: Icon,
    iconSize = 26,
    iconColor,
    variant = "primary",
    isDisabled = false,
    className,
    accessibilityLabel,
    ...rest
  } = props;

  const colors = useThemeColors();
  const resolvedColor = iconColor ?? colors[ICON_TONE_KEY[variant]];

  return (
    <PressableFeedback
      ref={ref}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      animation={{ scale: 0.92 }}
      className={cn(fabRoot({ variant, isDisabled }), className)}
      {...rest}
    >
      <Icon color={resolvedColor} size={iconSize} />
    </PressableFeedback>
  );
});

Fab.displayName = "Fab";
