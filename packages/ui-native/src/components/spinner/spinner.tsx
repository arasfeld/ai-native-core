import { forwardRef } from "react";
import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  type View,
} from "react-native";
import { useThemeColors } from "../../hooks/use-theme-colors";

export type SpinnerTone =
  | "primary"
  | "accent"
  | "muted-foreground"
  | "foreground"
  | "card-foreground"
  | "primary-foreground"
  | "destructive";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = Omit<
  ActivityIndicatorProps,
  "size" | "color" | "colorClassName"
> & {
  tone?: SpinnerTone;
  size?: SpinnerSize;
  /**
   * Escape hatch for callers that need a non-theme-aware color (e.g. a spinner
   * inside a pill that stays a fixed palette regardless of dark/light theme).
   * If unset, color is derived from `tone` via `useThemeColors()`.
   */
  color?: string;
};

const SIZE_MAP: Record<SpinnerSize, ActivityIndicatorProps["size"]> = {
  sm: "small",
  md: "small",
  lg: "large",
};

const TONE_TO_KEY = {
  primary: "primary",
  accent: "accent",
  "muted-foreground": "mutedForeground",
  foreground: "foreground",
  "card-foreground": "cardForeground",
  "primary-foreground": "primaryForeground",
  destructive: "destructive",
} as const;

export const Spinner = forwardRef<View, SpinnerProps>((props, ref) => {
  const { tone = "primary", size = "md", color, ...rest } = props;
  const colors = useThemeColors();
  const resolvedColor = color ?? colors[TONE_TO_KEY[tone]];

  return (
    <ActivityIndicator
      ref={ref}
      size={SIZE_MAP[size]}
      color={resolvedColor}
      {...rest}
    />
  );
});

Spinner.displayName = "Spinner";
