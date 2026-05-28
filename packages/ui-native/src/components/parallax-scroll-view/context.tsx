import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

export type ParallaxScrollContextValue = {
  scrollY: SharedValue<number>;
  parallaxFactor: number;
  heroFadeRange: readonly [number, number];
  miniTitleFadeRange: readonly [number, number];
};

export const ParallaxScrollContext =
  createContext<ParallaxScrollContextValue | null>(null);

export function useParallaxScroll(): ParallaxScrollContextValue {
  const ctx = useContext(ParallaxScrollContext);
  if (!ctx) {
    throw new Error(
      "useParallaxScroll must be used inside <ParallaxScrollView>",
    );
  }
  return ctx;
}
