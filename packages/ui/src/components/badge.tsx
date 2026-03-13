import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-1.5 py-0.5 font-medium text-xs transition-all [&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
