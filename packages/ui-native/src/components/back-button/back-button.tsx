import { forwardRef } from "react";
import type { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import {
  PressableFeedback,
  type PressableFeedbackProps,
} from "../pressable-feedback";
import { Text } from "../text";

export type BackButtonTone = "muted" | "inverse";

export type BackButtonProps = Omit<
  PressableFeedbackProps,
  "children" | "animation"
> & {
  /** Label shown after the chevron. Defaults to "Back". */
  label?: string;
  /**
   * `muted` (default) for in-screen back chips.
   * `inverse` for white-on-hero overlays.
   */
  tone?: BackButtonTone;
};

function ArrowLeftIcon({ color }: { color: string }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="m12 19-7-7 7-7" />
      <Path d="M19 12H5" />
    </Svg>
  );
}

export const BackButton = forwardRef<View, BackButtonProps>((props, ref) => {
  const {
    label = "Back",
    tone = "muted",
    className,
    accessibilityLabel,
    ...rest
  } = props;
  const colors = useThemeColors();
  const iconColor =
    tone === "inverse" ? colors.primaryForeground : colors.mutedForeground;

  return (
    <PressableFeedback
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      animation={false}
      className={cn(
        "-ml-2 flex-row items-center gap-1 self-start rounded-full px-2 py-1 active:opacity-70",
        className,
      )}
      {...rest}
    >
      <ArrowLeftIcon color={iconColor} />
      {tone === "inverse" ? (
        <Text
          size="sm"
          tone="primary-foreground"
          numberOfLines={1}
          style={{ opacity: 0.9 }}
        >
          {label}
        </Text>
      ) : (
        <Text size="sm" tone="muted" numberOfLines={1}>
          {label}
        </Text>
      )}
    </PressableFeedback>
  );
});

BackButton.displayName = "BackButton";
