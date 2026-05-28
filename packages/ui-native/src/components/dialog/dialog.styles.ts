import { tv, type VariantProps } from "tailwind-variants";

export const dialogOverlay = tv({
  base: "flex-1 bg-black/50 px-5",
  variants: {
    placement: {
      center: "items-center justify-center",
      top: "items-center justify-start pt-20",
    },
  },
  defaultVariants: {
    placement: "center",
  },
});

export const dialogContent = tv({
  base: "w-full gap-4 rounded-2xl bg-card p-5",
  variants: {
    size: {
      sm: "max-w-xs",
      md: "max-w-sm",
      lg: "max-w-md",
      full: "",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const dialogHeader = tv({
  base: "gap-1",
});

export const dialogFooter = tv({
  base: "flex-row items-center justify-end gap-2",
});

export type DialogOverlayVariantProps = VariantProps<typeof dialogOverlay>;
export type DialogContentVariantProps = VariantProps<typeof dialogContent>;

export type DialogPlacement = NonNullable<
  DialogOverlayVariantProps["placement"]
>;
export type DialogSize = NonNullable<DialogContentVariantProps["size"]>;
