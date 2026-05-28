import { tv } from "tailwind-variants";

export const bottomSheetHeader = tv({
  base: "flex-row items-center justify-between gap-3 px-5 pt-3",
});

export const bottomSheetBody = tv({
  base: "gap-3 px-5 pt-3",
});

/** Sheet sizing. `auto` measures content (dynamic sizing); the others snap to a percentage of screen height. */
export type BottomSheetSize = "auto" | "half" | "large" | "full";
