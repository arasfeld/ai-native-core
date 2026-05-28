import type { ReactElement, ReactNode } from "react";
import { forwardRef } from "react";
import {
  type RefreshControlProps,
  ScrollView,
  type ScrollViewProps,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../../utils/cn";

/**
 * Default padding for the inner scroll container. Matches the screen-level
 * pattern used across the mobile app:
 *   - `px-5` — 20px horizontal gutters
 *   - `pt-safe-offset-4` — safe-area top + 16px
 *   - `pb-12` — 48px bottom slack
 *   - `gap-6` — 24px between top-level children
 *
 * Callers that need a different rhythm pass `contentContainerClassName`.
 */
const DEFAULT_CONTENT_CONTAINER_CLASS_NAME =
  "px-5 pt-safe-offset-4 pb-12 gap-6";

type ScreenScrollProps = {
  scroll: true;
  /** Overrides the scroll container's contentContainerClassName. */
  contentContainerClassName?: string;
  /** Forwarded to the inner ScrollView. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Forwarded to the inner ScrollView. */
  scrollViewProps?: Omit<
    ScrollViewProps,
    "className" | "contentContainerClassName" | "refreshControl" | "children"
  >;
};

type ScreenStaticProps = {
  scroll?: false;
  contentContainerClassName?: never;
  refreshControl?: never;
  scrollViewProps?: never;
};

export type ScreenProps = ViewProps & {
  children: ReactNode;
} & (ScreenScrollProps | ScreenStaticProps);

/**
 * Screen — top-level container for a route. Renders a `flex-1 bg-background`
 * View, optionally wrapping its children in a ScrollView with safe-area-
 * aware padding. Replaces the repeated
 *   <View className="flex-1 bg-background">
 *     <ScrollView contentContainerClassName="px-5 pt-safe-offset-4 pb-12 gap-6">
 * boilerplate.
 */
export const Screen = forwardRef<View, ScreenProps>((props, ref) => {
  const {
    children,
    className,
    scroll,
    contentContainerClassName,
    refreshControl,
    scrollViewProps,
    ...viewProps
  } = props;

  const containerClassName = cn("flex-1 bg-background", className);

  if (!scroll) {
    return (
      <View ref={ref} className={containerClassName} {...viewProps}>
        {children}
      </View>
    );
  }

  return (
    <View ref={ref} className={containerClassName} {...viewProps}>
      <ScrollView
        className="flex-1"
        contentContainerClassName={cn(
          DEFAULT_CONTENT_CONTAINER_CLASS_NAME,
          contentContainerClassName,
        )}
        refreshControl={refreshControl}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </View>
  );
});

Screen.displayName = "Screen";
