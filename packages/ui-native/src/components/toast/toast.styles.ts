import { tv, type VariantProps } from "tailwind-variants";

export const toastViewport = tv({
  base: "absolute right-0 bottom-0 left-0 z-50 gap-2 px-4 pb-safe-offset-5",
});

export const toastRoot = tv({
  base: "flex-row items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-md shadow-black/10",
  variants: {
    variant: {
      default: "",
      success: "border-emerald-500/40 bg-emerald-50",
      error: "border-destructive/40 bg-destructive/5",
      info: "border-primary/30 bg-primary-soft",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export const toastTitle = tv({
  base: "",
  variants: {
    variant: {
      default: "text-foreground",
      success: "text-emerald-800",
      error: "text-destructive",
      info: "text-primary",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export const toastDescription = tv({
  base: "",
  variants: {
    variant: {
      default: "text-muted-foreground",
      success: "text-emerald-700/80",
      error: "text-destructive/80",
      info: "text-primary/80",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type ToastVariantProps = VariantProps<typeof toastRoot>;
export type ToastVariant = NonNullable<ToastVariantProps["variant"]>;
