import { forwardRef } from "react";
import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";

const headingStyles = tv({
  base: "",
  variants: {
    level: {
      1: "text-5xl leading-tight",
      2: "text-4xl leading-tight",
      3: "text-3xl leading-snug",
      4: "text-2xl leading-snug",
      5: "text-xl leading-snug",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      accent: "text-accent",
      inverse: "text-background",
    },
  },
  defaultVariants: {
    level: 3,
    tone: "default",
  },
});

const FRAUNCES_FAMILY = {
  medium: "Fraunces",
  semibold: "Fraunces-SemiBold",
  bold: "Fraunces-Bold",
} as const;

export type HeadingWeight = keyof typeof FRAUNCES_FAMILY;

export type HeadingVariantProps = VariantProps<typeof headingStyles>;

export type HeadingProps = RNTextProps &
  HeadingVariantProps & {
    weight?: HeadingWeight;
  };

export const Heading = forwardRef<RNText, HeadingProps>((props, ref) => {
  const { level, tone, weight = "semibold", className, style, ...rest } = props;

  const fontFamilyStyle: TextStyle = { fontFamily: FRAUNCES_FAMILY[weight] };

  return (
    <RNText
      ref={ref}
      className={cn(headingStyles({ level, tone }), className)}
      style={style ? [fontFamilyStyle, style] : fontFamilyStyle}
      {...rest}
    />
  );
});

Heading.displayName = "Heading";
