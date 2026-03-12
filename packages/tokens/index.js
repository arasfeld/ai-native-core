/**
 * Design tokens — single source of truth for the AI Native Core design system.
 *
 * Colors are converted from OKLCH (globals.css) to hex for React Native
 * compatibility. Web continues to use CSS variables; mobile uses these values
 * directly in NativeWind's tailwind.config.js and at runtime.
 *
 * OKLCH → hex conversion formula (achromatic, C=0):
 *   Y = L³, then sRGB = 1.055·Y^(1/2.4)−0.055 (for Y > 0.0031308)
 */

/** @type {import('./index').Colors} */
const colors = {
  light: {
    background:           "#ffffff", // oklch(1 0 0)
    foreground:           "#0a0a0a", // oklch(0.145 0 0)
    card:                 "#ffffff",
    cardForeground:       "#0a0a0a",
    popover:              "#ffffff",
    popoverForeground:    "#0a0a0a",
    primary:              "#171717", // oklch(0.205 0 0)
    primaryForeground:    "#fafafa", // oklch(0.985 0 0)
    secondary:            "#f5f5f5", // oklch(0.97 0 0)
    secondaryForeground:  "#171717",
    muted:                "#f5f5f5",
    mutedForeground:      "#737373", // oklch(0.556 0 0)
    accent:               "#f5f5f5",
    accentForeground:     "#171717",
    destructive:          "#dc2626", // oklch(0.577 0.245 27.325) ≈ red-600
    destructiveForeground:"#dc2626",
    border:               "#e5e5e5", // oklch(0.922 0 0)
    input:                "#e5e5e5",
    ring:                 "#a1a1a1", // oklch(0.708 0 0)
  },
  dark: {
    background:           "#0a0a0a", // oklch(0.145 0 0)
    foreground:           "#fafafa", // oklch(0.985 0 0)
    card:                 "#0a0a0a",
    cardForeground:       "#fafafa",
    popover:              "#0a0a0a",
    popoverForeground:    "#fafafa",
    primary:              "#fafafa",
    primaryForeground:    "#171717",
    secondary:            "#262626", // oklch(0.269 0 0)
    secondaryForeground:  "#fafafa",
    muted:                "#262626",
    mutedForeground:      "#a1a1a1", // oklch(0.708 0 0)
    accent:               "#262626",
    accentForeground:     "#fafafa",
    destructive:          "#7f1d1d", // oklch(0.396 0.141 25.723) ≈ red-900
    destructiveForeground:"#f87171", // oklch(0.637 0.237 25.331) ≈ red-400
    border:               "#262626",
    input:                "#262626",
    ring:                 "#737373", // oklch(0.556 0 0)
  },
};

/**
 * Border radius values in pixels.
 * --radius: 0.625rem = 10px (at 16px base)
 */
/** @type {import('./index').Radius} */
const radius = {
  sm: 6,   // calc(var(--radius) - 4px)
  md: 8,   // calc(var(--radius) - 2px)
  lg: 10,  // var(--radius)
  xl: 14,  // calc(var(--radius) + 4px)
};

module.exports = { colors, radius };
