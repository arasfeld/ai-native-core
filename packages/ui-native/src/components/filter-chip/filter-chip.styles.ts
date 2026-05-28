import { tv, type VariantProps } from "tailwind-variants";

export const filterChipRoot = tv({
  base: "flex-row items-center gap-1.5 rounded-full border px-2 py-1",
  variants: {
    isSelected: {
      true: "border-border bg-card",
      false: "border-border/40 bg-muted/30",
    },
    isDisabled: {
      true: "opacity-50",
    },
  },
  defaultVariants: {
    isSelected: false,
    isDisabled: false,
  },
});

export type FilterChipRootVariantProps = VariantProps<typeof filterChipRoot>;
