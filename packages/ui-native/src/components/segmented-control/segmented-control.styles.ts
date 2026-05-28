import { tv } from "tailwind-variants";

export const segmentedControlRoot = tv({
  base: "relative flex-row items-stretch overflow-hidden rounded-full bg-muted p-[2px]",
  variants: {
    isDisabled: {
      true: "opacity-50",
    },
  },
});

export const segmentedControlSegment = tv({
  base: "flex-1 flex-row items-center justify-center gap-1.5 px-3 py-1.5",
});

export const segmentedControlLabel = tv({
  base: "text-sm",
  variants: {
    isSelected: {
      true: "text-foreground",
      false: "text-muted-foreground",
    },
  },
});
