import { type CnOptions, cnMerge } from "tailwind-variants";

/**
 * Adapted from heroui-native — tailwind-variants `cnMerge` with our config.
 * Adds an `opacity-disabled` opacity group so disabled-state utilities merge correctly.
 */
export function cn(...args: CnOptions) {
  return cnMerge(args)({
    twMerge: true,
    twMergeConfig: {
      classGroups: {
        opacity: [{ opacity: ["disabled"] }],
      },
    },
  });
}
