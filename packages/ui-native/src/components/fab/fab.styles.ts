import { tv, type VariantProps } from "tailwind-variants";

export const fabRoot = tv({
  base: "h-14 w-14 items-center justify-center rounded-full shadow-md shadow-black/30",
  variants: {
    variant: {
      primary: "bg-primary",
      secondary: "bg-secondary",
      destructive: "bg-destructive",
    },
    isDisabled: {
      true: "opacity-50",
    },
  },
  defaultVariants: {
    variant: "primary",
    isDisabled: false,
  },
});

export type FabRootVariantProps = VariantProps<typeof fabRoot>;
export type FabVariant = NonNullable<FabRootVariantProps["variant"]>;
