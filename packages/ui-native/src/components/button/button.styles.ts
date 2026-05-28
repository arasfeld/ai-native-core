import { tv, type VariantProps } from "tailwind-variants";

export const buttonRoot = tv({
  base: "flex-row items-center justify-center rounded-full",
  variants: {
    variant: {
      primary: "bg-primary",
      secondary: "bg-secondary",
      outline: "bg-transparent border border-input",
      ghost: "bg-transparent",
      destructive: "bg-destructive",
    },
    size: {
      sm: "h-9 px-3 gap-1.5",
      md: "h-11 px-4 gap-2",
      lg: "h-12 px-5 gap-2",
    },
    isIconOnly: {
      true: "px-0 aspect-square",
    },
    isDisabled: {
      true: "opacity-50",
    },
  },
  compoundVariants: [
    { variant: "ghost", isIconOnly: true, className: "active:bg-muted" },
  ],
  defaultVariants: {
    variant: "primary",
    size: "md",
    isIconOnly: false,
    isDisabled: false,
  },
});

export const buttonLabel = tv({
  base: "",
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
    },
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-base",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export type ButtonRootVariantProps = VariantProps<typeof buttonRoot>;
export type ButtonLabelVariantProps = VariantProps<typeof buttonLabel>;

export type ButtonVariant = NonNullable<ButtonRootVariantProps["variant"]>;
export type ButtonSize = NonNullable<ButtonRootVariantProps["size"]>;
