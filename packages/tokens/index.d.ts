export type ColorScale = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
};

export type Colors = {
  light: ColorScale;
  dark: ColorScale;
};

export type Radius = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
};

export declare const colors: Colors;
export declare const radius: Radius;
