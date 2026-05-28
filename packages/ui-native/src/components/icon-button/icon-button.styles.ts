import { tv, type VariantProps } from "tailwind-variants";

export const iconButtonRoot = tv({
  base: "items-center justify-center rounded-full",
  variants: {
    variant: {
      primary: "bg-primary",
      secondary: "bg-secondary",
      outline: "bg-transparent border border-input",
      ghost: "bg-transparent active:bg-muted",
      destructive: "bg-destructive",
    },
    size: {
      sm: "h-8 w-8",
      md: "h-10 w-10",
      lg: "h-12 w-12",
    },
    isDisabled: {
      true: "opacity-50",
    },
  },
  defaultVariants: {
    variant: "ghost",
    size: "md",
    isDisabled: false,
  },
});

export type IconButtonRootVariantProps = VariantProps<typeof iconButtonRoot>;

export type IconButtonVariant = NonNullable<
  IconButtonRootVariantProps["variant"]
>;
export type IconButtonSize = NonNullable<IconButtonRootVariantProps["size"]>;
