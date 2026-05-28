import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";

const dividerStyles = tv({
  base: "bg-border",
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px h-full",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export type DividerVariantProps = VariantProps<typeof dividerStyles>;

export type DividerProps = ViewProps & DividerVariantProps;

export const Divider = forwardRef<View, DividerProps>((props, ref) => {
  const { orientation, className, ...rest } = props;

  return (
    <View
      ref={ref}
      accessibilityRole="none"
      className={cn(dividerStyles({ orientation }), className)}
      {...rest}
    />
  );
});

Divider.displayName = "Divider";
