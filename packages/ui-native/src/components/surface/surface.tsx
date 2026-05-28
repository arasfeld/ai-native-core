import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";

const surfaceStyles = tv({
  base: "overflow-hidden",
  variants: {
    variant: {
      default: "bg-card border border-border/60",
      flat: "bg-muted",
      elevated: "bg-card shadow-md shadow-black/10",
      transparent: "bg-transparent",
    },
    radius: {
      none: "rounded-none",
      sm: "rounded-md",
      md: "rounded-xl",
      lg: "rounded-2xl",
      xl: "rounded-3xl",
    },
  },
  defaultVariants: {
    variant: "default",
    radius: "lg",
  },
});

export type SurfaceVariantProps = VariantProps<typeof surfaceStyles>;

export type SurfaceProps = ViewProps & SurfaceVariantProps;

export const Surface = forwardRef<View, SurfaceProps>((props, ref) => {
  const { variant, radius, className, style, ...rest } = props;

  return (
    <View
      ref={ref}
      className={cn(surfaceStyles({ variant, radius }), className)}
      style={style}
      {...rest}
    />
  );
});

Surface.displayName = "Surface";
