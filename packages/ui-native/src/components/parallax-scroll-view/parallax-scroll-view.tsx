import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../../utils/cn";
import { Text } from "../text";
import {
  ParallaxScrollContext,
  type ParallaxScrollContextValue,
  useParallaxScroll,
} from "./context";

const DEFAULT_NAV_HEIGHT = 44;
// 1.0 = the hero is visually pinned to the viewport (translateY cancels the
// scroll). Combined with per-section ParallaxCollapse, this gives a clean
// "things shrink in place" feel rather than flying the hero off and leaving an
// empty accent band. Drop to ~0.7 for a gentle drift if a consumer wants it.
const DEFAULT_PARALLAX_FACTOR = 1.0;
const DEFAULT_HERO_FADE_RANGE: readonly [number, number] = [120, 165];
const DEFAULT_MINI_TITLE_FADE_RANGE: readonly [number, number] = [90, 155];
// Generous enough to cover even a hard iOS top-bounce on tall devices without
// exposing the page background between the nav and the dragged-down hero.
const TOP_BOUNCE_BUFFER = 600;

export type ParallaxScrollViewProps = {
  /** Background color extending behind nav + hero + sticky header. */
  accentColor: string;
  /** Left-aligned nav content (e.g., back button). Always pinned. */
  navBarLeft?: ReactNode;
  /** Right-aligned nav content (e.g., share menu). Always pinned. */
  navBarRight?: ReactNode;
  /** Collapsing hero content (title, meta, etc.). Scrolls off with parallax. */
  header: ReactNode;
  /** Optional sticky header that pins under the nav bar (e.g., a tab strip). */
  stickyHeader?: ReactNode;
  /**
   * Optional condensed title that fades into the nav as the hero collapses.
   * Convenience for the common case — for custom mini-content, render
   * directly inside `navBar` and use `useParallaxScroll()`.
   */
  condensedTitle?: string;
  /** Tailwind classes applied to the white content sheet wrapper. */
  contentClassName?: string;
  /** Tailwind classes applied to the inner ScrollView contentContainer. */
  contentContainerClassName?: string;
  /**
   * Fraction of scroll the hero is visually pinned against. `1.0` cancels the
   * scroll entirely so the hero stays fixed in the viewport (sections inside
   * still collapse via ParallaxCollapse). `0` lets the hero scroll naturally.
   * Default `1.0`.
   */
  parallaxFactor?: number;
  /** Scroll range over which the hero content fades 1→0. Default [120, 165]. */
  heroFadeRange?: readonly [number, number];
  /** Scroll range over which the mini title fades 0→1. Default [90, 155]. */
  miniTitleFadeRange?: readonly [number, number];
  /** Height of the nav bar row (excluding safe area). Default 44. */
  navHeight?: number;
  children: ReactNode;
} & Pick<
  ScrollViewProps,
  | "keyboardShouldPersistTaps"
  | "refreshControl"
  | "showsVerticalScrollIndicator"
>;

/**
 * A scrollable surface with a pinned nav bar, a collapsing parallax hero, and
 * an optional sticky header (e.g., a tab strip) that docks under the nav once
 * the hero has scrolled away.
 *
 * The nav bar lives OUTSIDE the ScrollView as a sibling above it.
 * `stickyHeaderIndices` in React Native does not reliably stack multiple sticky
 * headers — a later sticky header tends to displace earlier ones rather than
 * pile below them, which slammed the tab strip up under the device bezel with
 * no safe-area padding. Treating the nav as a sibling lets the (shorter)
 * ScrollView pin the tab strip at its own top edge, which is already below the
 * nav. Reanimated drives only the visual hero fade + mini-title crossfade.
 */
export function ParallaxScrollView({
  accentColor,
  navBarLeft,
  navBarRight,
  header,
  stickyHeader,
  condensedTitle,
  contentClassName,
  contentContainerClassName,
  parallaxFactor = DEFAULT_PARALLAX_FACTOR,
  heroFadeRange = DEFAULT_HERO_FADE_RANGE,
  miniTitleFadeRange = DEFAULT_MINI_TITLE_FADE_RANGE,
  navHeight = DEFAULT_NAV_HEIGHT,
  children,
  keyboardShouldPersistTaps,
  refreshControl,
  showsVerticalScrollIndicator,
}: ParallaxScrollViewProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const contextValue = useMemo<ParallaxScrollContextValue>(
    () => ({
      scrollY,
      parallaxFactor,
      heroFadeRange,
      miniTitleFadeRange,
    }),
    [scrollY, parallaxFactor, heroFadeRange, miniTitleFadeRange],
  );

  return (
    <ParallaxScrollContext.Provider value={contextValue}>
      {/*
       * Root bg = background. An absolute-positioned accent band covers the
       * nav + a generous bounce buffer at the top so the iOS top-bounce
       * (pulling the hero down) still reveals accent through the transparent
       * ScrollView frame. The rest of the root stays page-background, so a
       * bottom-bounce on short tabs (chat, etc.) reveals background instead
       * of leaking accent — the painted NavBarSlot still covers the band
       * during normal flow, so the visible chrome is unchanged.
       */}
      <View className="flex-1 bg-background">
        <View
          pointerEvents="none"
          className="absolute top-0 right-0 left-0"
          style={{
            height: insets.top + navHeight + TOP_BOUNCE_BUFFER,
            backgroundColor: accentColor,
          }}
        />
        <NavBarSlot
          accentColor={accentColor}
          safeTop={insets.top}
          navHeight={navHeight}
          condensedTitle={condensedTitle}
          left={navBarLeft}
          right={navBarRight}
        />

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          stickyHeaderIndices={stickyHeader ? [1] : undefined}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator ?? false}
          contentContainerClassName={contentContainerClassName}
          // flexGrow: 1 + flex-1 on the content sheet below makes the white
          // sheet expand to fill the viewport whenever content is short, so a
          // bottom-bounce on short tabs reveals the page background (from the
          // root) rather than the accent band, which only extends across the
          // top region.
          contentContainerStyle={{ flexGrow: 1 }}
          className="flex-1"
        >
          <HeroSlot accentColor={accentColor}>{header}</HeroSlot>

          {stickyHeader ? (
            <View style={{ backgroundColor: accentColor }}>{stickyHeader}</View>
          ) : null}

          <View
            className={cn(
              "-mt-4 flex-1 rounded-t-3xl bg-background",
              contentClassName,
            )}
          >
            {children}
          </View>
        </Animated.ScrollView>
      </View>
    </ParallaxScrollContext.Provider>
  );
}

function NavBarSlot({
  accentColor,
  safeTop,
  navHeight,
  condensedTitle,
  left,
  right,
}: {
  accentColor: string;
  safeTop: number;
  navHeight: number;
  condensedTitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={{ backgroundColor: accentColor, paddingTop: safeTop }}>
      <View
        style={{ height: navHeight }}
        className="flex-row items-center px-3"
      >
        <View className="flex-row items-center">{left}</View>
        <View className="flex-1 items-center justify-center px-2">
          {condensedTitle ? <MiniTitle title={condensedTitle} /> : null}
        </View>
        <View className="flex-row items-center">{right}</View>
      </View>
    </View>
  );
}

function MiniTitle({ title }: { title: string }) {
  const { scrollY, miniTitleFadeRange } = useParallaxScroll();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [miniTitleFadeRange[0], miniTitleFadeRange[1]],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={[style, MINI_TITLE_WRAP]}>
      <Text
        size="sm"
        weight="semibold"
        tone="primary-foreground"
        numberOfLines={1}
        className="text-center"
      >
        {title}
      </Text>
    </Animated.View>
  );
}

// Flexed middle slot already owns sizing; we only need the title not to
// intercept touches meant for the row beneath.
const MINI_TITLE_WRAP: StyleProp<ViewStyle> = {
  width: "100%",
  pointerEvents: "none",
};

function HeroSlot({
  accentColor,
  children,
}: {
  accentColor: string;
  children: ReactNode;
}) {
  const { scrollY, parallaxFactor, heroFadeRange } = useParallaxScroll();
  const style = useAnimatedStyle(() => {
    // Clamp at 0 so the iOS top-bounce (scrollY < 0) doesn't drive the hero
    // *upward* — without this, pulling down with factor=1 translates the hero
    // off the top by the full bounce distance, leaving an enormous accent
    // band where the hero used to sit. On bounce the hero just rides the
    // scroll content naturally.
    const clamped = scrollY.value > 0 ? scrollY.value : 0;
    return {
      // Positive translate cancels the natural upward scroll motion. With
      // factor=1 the hero is fully pinned to the viewport (visual position
      // stays put while the user scrolls), letting ParallaxCollapse children
      // handle the visible "shrink" without leaving an empty accent band
      // above the sticky tab strip.
      transform: [{ translateY: clamped * parallaxFactor }],
      opacity: interpolate(
        scrollY.value,
        [heroFadeRange[0], heroFadeRange[1]],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <View style={{ backgroundColor: accentColor, overflow: "hidden" }}>
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}
