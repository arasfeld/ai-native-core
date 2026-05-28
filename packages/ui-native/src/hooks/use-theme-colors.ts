import { useCSSVariable } from "uniwind";

const CSS_VAR_NAMES = [
  "--color-background",
  "--color-foreground",
  "--color-card",
  "--color-card-foreground",
  "--color-popover",
  "--color-popover-foreground",
  "--color-primary",
  "--color-primary-foreground",
  "--color-primary-soft",
  "--color-secondary",
  "--color-secondary-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-accent",
  "--color-accent-foreground",
  "--color-accent-soft",
  "--color-destructive",
  "--color-destructive-foreground",
  "--color-border",
  "--color-input",
  "--color-ring",
  "--color-positive",
  "--color-positive-soft",
  "--color-negative",
  "--color-negative-soft",
  "--color-warning",
  "--color-warning-soft",
] as const;

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  primarySoft: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  accentSoft: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
};

/**
 * Returns the active theme's semantic color tokens as a plain object, so RN
 * components that take a string `color` prop (lucide icons, ActivityIndicator,
 * react-navigation tints, etc.) can stay in sync with light/dark mode.
 *
 * Backed by Uniwind's `useCSSVariable`, which re-reads when the active theme
 * changes via `Uniwind.setTheme(...)`. The CSS variables themselves are
 * declared in `apps/mobile/global.css` (`@theme` + `@theme dark`).
 *
 * For Tailwind-styled surfaces (View, Text), prefer `className="text-..."` —
 * those flip via Uniwind's variant resolution at compile time and don't need
 * this hook.
 */
export function useThemeColors(): ThemeColors {
  const values = useCSSVariable([...CSS_VAR_NAMES]) as string[];
  return {
    background: values[0],
    foreground: values[1],
    card: values[2],
    cardForeground: values[3],
    popover: values[4],
    popoverForeground: values[5],
    primary: values[6],
    primaryForeground: values[7],
    primarySoft: values[8],
    secondary: values[9],
    secondaryForeground: values[10],
    muted: values[11],
    mutedForeground: values[12],
    accent: values[13],
    accentForeground: values[14],
    accentSoft: values[15],
    destructive: values[16],
    destructiveForeground: values[17],
    border: values[18],
    input: values[19],
    ring: values[20],
    positive: values[21],
    positiveSoft: values[22],
    negative: values[23],
    negativeSoft: values[24],
    warning: values[25],
    warningSoft: values[26],
  };
}
