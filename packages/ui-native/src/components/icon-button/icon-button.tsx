import { type ComponentType, forwardRef } from "react";
import type { View } from "react-native";
import { type ThemeColors, useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import {
  PressableFeedback,
  type PressableFeedbackProps,
} from "../pressable-feedback";
import { Spinner, type SpinnerTone } from "../spinner";
import {
  type IconButtonSize,
  type IconButtonVariant,
  iconButtonRoot,
} from "./icon-button.styles";

type LucideIconProps = {
  color?: string;
  size?: number;
};

const ICON_TONE_KEY: Record<IconButtonVariant, keyof ThemeColors> = {
  primary: "primaryForeground",
  secondary: "secondaryForeground",
  outline: "foreground",
  ghost: "foreground",
  destructive: "destructiveForeground",
};

const DEFAULT_ICON_SIZE: Record<IconButtonSize, number> = {
  sm: 18,
  md: 20,
  lg: 24,
};

export type IconButtonProps = Omit<PressableFeedbackProps, "children"> & {
  icon: ComponentType<LucideIconProps>;
  iconSize?: number;
  /** Override the icon color. If unset, derived from variant via useThemeColors(). */
  iconColor?: string;
  /** Override the loading-state spinner tone. If unset, derived from variant. */
  spinnerTone?: SpinnerTone;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** REQUIRED — icon-only controls have no visible label. */
  accessibilityLabel: string;
};

const DEFAULT_SPINNER_TONE: Record<IconButtonVariant, SpinnerTone> = {
  primary: "primary-foreground",
  secondary: "foreground",
  outline: "foreground",
  ghost: "foreground",
  destructive: "primary-foreground",
};

export const IconButton = forwardRef<View, IconButtonProps>((props, ref) => {
  const {
    icon: Icon,
    iconSize,
    iconColor,
    spinnerTone,
    variant = "ghost",
    size = "md",
    isDisabled = false,
    isLoading = false,
    className,
    accessibilityLabel,
    ...rest
  } = props;

  const colors = useThemeColors();
  const disabled = isDisabled || isLoading;
  const resolvedColor = iconColor ?? colors[ICON_TONE_KEY[variant]];
  const resolvedSize = iconSize ?? DEFAULT_ICON_SIZE[size];
  const resolvedSpinnerTone = spinnerTone ?? DEFAULT_SPINNER_TONE[variant];

  return (
    <PressableFeedback
      ref={ref}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: isLoading }}
      className={cn(
        iconButtonRoot({ variant, size, isDisabled: disabled }),
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <Spinner
          tone={resolvedSpinnerTone}
          size={size === "sm" ? "sm" : "md"}
        />
      ) : (
        <Icon color={resolvedColor} size={resolvedSize} />
      )}
    </PressableFeedback>
  );
});

IconButton.displayName = "IconButton";
