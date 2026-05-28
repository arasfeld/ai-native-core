import { forwardRef } from "react";
import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";

const textStyles = tv({
  base: "",
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      "primary-foreground": "text-primary-foreground",
      accent: "text-accent",
      destructive: "text-destructive",
      "card-foreground": "text-card-foreground",
      inverse: "text-background",
    },
  },
  defaultVariants: {
    size: "base",
    tone: "default",
  },
});

const INTER_FAMILY = {
  regular: "Inter",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
} as const;

export type TextWeight = keyof typeof INTER_FAMILY;

export type TextVariantProps = VariantProps<typeof textStyles>;

export type TextProps = RNTextProps &
  TextVariantProps & {
    weight?: TextWeight;
  };

export const Text = forwardRef<RNText, TextProps>((props, ref) => {
  const { size, tone, weight = "regular", className, style, ...rest } = props;

  const fontFamilyStyle: TextStyle = { fontFamily: INTER_FAMILY[weight] };

  return (
    <RNText
      ref={ref}
      className={cn(textStyles({ size, tone }), className)}
      style={style ? [fontFamilyStyle, style] : fontFamilyStyle}
      {...rest}
    />
  );
});

Text.displayName = "Text";
