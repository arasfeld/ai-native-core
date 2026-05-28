import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
  BottomSheetView,
  type BottomSheetProps as GorhomBottomSheetProps,
} from "@gorhom/bottom-sheet";
import {
  type ComponentProps,
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Modal as RNModal,
  type Text as RNText,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import { Button, type ButtonProps } from "../button";
import { Heading, type HeadingProps } from "../heading";
import { Text, type TextProps } from "../text";
import {
  type BottomSheetSize,
  bottomSheetBody,
  bottomSheetHeader,
} from "./bottom-sheet.styles";

type BottomSheetContextValue = {
  onOpenChange: (open: boolean) => void;
  size: BottomSheetSize;
  /**
   * Hard cap on how tall `size="auto"` sheets can render. `BottomSheet.Content`
   * uses this as `maxHeight` so a tall form/list doesn't push content off the
   * screen and become unreachable.
   */
  maxContentHeight: number;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

function useBottomSheetContext(): BottomSheetContextValue {
  const ctx = useContext(BottomSheetContext);
  if (!ctx) {
    throw new Error(
      "BottomSheet subcomponents must be rendered inside <BottomSheet open onOpenChange>",
    );
  }
  return ctx;
}

export type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tapping the backdrop or swiping down dismisses. Default true. */
  isDismissable?: boolean;
  /** Render a darkened backdrop behind the sheet. Default true. */
  hasBackdrop?: boolean;
  /**
   * Overall sheet sizing. Defaults to `large` (75%/95% snap points + bounded
   * content view) — the same pattern heroui-native uses for any sheet with a
   * `BottomSheet.ScrollView` inside, which is the only reliable way to get
   * the inner ScrollView to actually scroll. Opt into `auto` only for short,
   * non-scrolling content (e.g. a confirmation popup with 2 buttons).
   */
  size?: BottomSheetSize;
  /** Pass-through for advanced cases — escape hatch to gorhom props. */
  bottomSheetProps?: Partial<
    Omit<
      GorhomBottomSheetProps,
      | "ref"
      | "index"
      | "snapPoints"
      | "enableDynamicSizing"
      | "backdropComponent"
      | "onClose"
      | "enablePanDownToClose"
      | "children"
    >
  >;
  children?: ReactNode;
};

// Each fixed size declares its initial snap-point AND a higher one. The
// higher snap is required for inner `BottomSheetScrollView` content to
// scroll: with only one snap-point, dragging up on content tries to expand
// the sheet, finds nowhere to go, and snaps back — taking the scroll
// position with it (heroui-native's documented "scrollable with snap
// points" pattern uses ['40%','80%'] for the same reason). We pick a small
// upward step so the default visual height matches the requested size.
const SIZE_SNAP_POINTS: Record<Exclude<BottomSheetSize, "auto">, string[]> = {
  half: ["50%", "90%"],
  large: ["75%", "95%"],
  full: ["95%"],
};

// Render the gorhom non-modal BottomSheet inside React Native's built-in
// Modal so it overlays the whole screen without needing
// BottomSheetModalProvider. The provider-based BottomSheetModal was silently
// no-op'ing present() in this app's tree; this path is the same one
// heroui-native uses (FullWindowOverlay + non-modal BottomSheet).
function BottomSheetRoot(props: BottomSheetProps) {
  const {
    open,
    onOpenChange,
    isDismissable = true,
    hasBackdrop = true,
    size = "large",
    bottomSheetProps,
    children,
  } = props;
  const colors = useThemeColors();
  const ref = useRef<GorhomBottomSheet>(null);
  const { height: windowHeight } = useWindowDimensions();
  // Leave ~8% of screen for the top safe area + visual separation from the
  // status bar. The sheet itself never grows beyond this, so we don't lose
  // tap targets behind the notch. Tunable in one place if needed.
  const maxContentHeight = Math.floor(windowHeight * 0.92);

  // The RN Modal is kept visible until the sheet finishes its closing
  // animation so the slide-down isn't cut off.
  const [modalVisible, setModalVisible] = useState(open);

  useEffect(() => {
    if (open) {
      Keyboard.dismiss();
      setModalVisible(true);
    } else if (modalVisible) {
      // Trigger the sheet's close animation; `handleSheetClose` will then
      // unmount the modal once the animation completes.
      ref.current?.close();
    }
  }, [open, modalVisible]);

  const handleSheetClose = useCallback(() => {
    setModalVisible(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) =>
      hasBackdrop ? (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          pressBehavior={isDismissable ? "close" : "none"}
        />
      ) : null,
    [hasBackdrop, isDismissable],
  );

  const ctxValue = useMemo<BottomSheetContextValue>(
    () => ({ onOpenChange, size, maxContentHeight }),
    [onOpenChange, size, maxContentHeight],
  );

  const snapPoints =
    size === "auto"
      ? undefined
      : SIZE_SNAP_POINTS[size as Exclude<BottomSheetSize, "auto">];
  const enableDynamicSizing = size === "auto";
  // Disable gorhom's over-drag by default for all sheet sizes. With
  // over-drag enabled, an upward pan on a nested `BottomSheet.ScrollView`
  // tries to stretch the sheet above its top snap, swallowing the scroll
  // gesture and snapping the content back. The wheel-picker select (no
  // inner scrollable) opts back in via `bottomSheetProps` if it wants the
  // bounce.
  const defaultEnableOverDrag = false;

  return (
    <RNModal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GorhomBottomSheet
          ref={ref}
          index={0}
          onClose={handleSheetClose}
          backdropComponent={renderBackdrop}
          enableDynamicSizing={enableDynamicSizing}
          // Cap the auto-size dynamic detent so a tall content view (form
          // with many fields, long list, etc.) doesn't extend the sheet
          // past the screen — gorhom otherwise renders the sheet at full
          // content height and the bottom is unreachable. Combined with
          // the `maxHeight` constraint on `BottomSheet.Content`, this
          // bounds the inner layout so a nested `BottomSheet.ScrollView`
          // actually scrolls.
          maxDynamicContentSize={
            enableDynamicSizing ? maxContentHeight : undefined
          }
          enableOverDrag={defaultEnableOverDrag}
          snapPoints={snapPoints}
          enablePanDownToClose={isDismissable}
          backgroundStyle={{ backgroundColor: colors.background }}
          handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
          // Slide the sheet up with the keyboard when a text input inside it
          // focuses — otherwise caption editors and other in-sheet inputs get
          // covered. Gorhom only auto-handles keyboard for its own
          // BottomSheetTextInput; setting "interactive" here makes the sheet
          // follow the keyboard for any nested input. Callers can override
          // via bottomSheetProps.
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          {...bottomSheetProps}
        >
          <BottomSheetContext.Provider value={ctxValue}>
            {children}
          </BottomSheetContext.Provider>
        </GorhomBottomSheet>
      </GestureHandlerRootView>
    </RNModal>
  );
}

BottomSheetRoot.displayName = "BottomSheet";

export type BottomSheetContentProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// Apply layout + safe-area padding to gorhom's BottomSheetView via direct
// ViewStyle (NOT className). Reasons we don't route this through Uniwind:
//   1. Wrapping a third-party component with `withUniwind` was empirically
//      unreliable for layout-critical classes — heroui-native (which the user
//      reports "just works") passes `h-full` to a bare BottomSheetView via
//      its own compile-time path; we don't have the same.
//   2. `pb-safe-offset-*` depends on Uniwind's safe-area resolution; using
//      `useSafeAreaInsets` directly is deterministic and matches what every
//      other RN library does. SafeAreaProvider is mounted at the app root.
//
// Layout rule:
//   - Fixed-snap sizes (default `large`, plus `half`/`full`): `height: '100%'`
//     so the View fills the snap-point height. Nested `BottomSheet.ScrollView`
//     (`flex: 1`) then has a bounded parent and actually scrolls.
//   - `size="auto"` (opt-in for short non-scroll content): `maxHeight` so a
//     too-tall content view (form + ScrollView) doesn't push past the screen.
function BottomSheetContent(props: BottomSheetContentProps) {
  const { className, style, children } = props;
  const { size, maxContentHeight } = useBottomSheetContext();
  const insets = useSafeAreaInsets();
  // ~20px (tw spacing-5) above the home indicator / bottom safe inset so the
  // last interactive row (Save buttons, last list item) isn't cramped against
  // the gesture bar.
  const safePaddingBottom = insets.bottom + 20;
  const layoutStyle: ViewStyle =
    size === "auto" ? { maxHeight: maxContentHeight } : { height: "100%" };
  const classNameStyle = useResolveClassNames(className ?? "");
  return (
    <BottomSheetView
      style={[
        layoutStyle,
        { paddingBottom: safePaddingBottom },
        className ? classNameStyle : null,
        style,
      ]}
    >
      {children}
    </BottomSheetView>
  );
}
BottomSheetContent.displayName = "BottomSheet.Content";

export type BottomSheetHeaderProps = ViewProps & { children?: ReactNode };

const BottomSheetHeader = forwardRef<View, BottomSheetHeaderProps>(
  (props, ref) => {
    const { className, children, ...rest } = props;
    return (
      <View ref={ref} className={cn(bottomSheetHeader(), className)} {...rest}>
        {children}
      </View>
    );
  },
);
BottomSheetHeader.displayName = "BottomSheet.Header";

export type BottomSheetTitleProps = HeadingProps;

const BottomSheetTitle = forwardRef<RNText, BottomSheetTitleProps>(
  (props, ref) => {
    const { level = 4, weight = "semibold", ...rest } = props;
    return <Heading ref={ref} level={level} weight={weight} {...rest} />;
  },
);
BottomSheetTitle.displayName = "BottomSheet.Title";

export type BottomSheetDescriptionProps = TextProps;

const BottomSheetDescription = forwardRef<RNText, BottomSheetDescriptionProps>(
  (props, ref) => {
    const { size = "sm", tone = "muted", ...rest } = props;
    return <Text ref={ref} size={size} tone={tone} {...rest} />;
  },
);
BottomSheetDescription.displayName = "BottomSheet.Description";

export type BottomSheetBodyProps = ViewProps & { children?: ReactNode };

const BottomSheetBody = forwardRef<View, BottomSheetBodyProps>((props, ref) => {
  const { className, children, ...rest } = props;
  return (
    <View ref={ref} className={cn(bottomSheetBody(), className)} {...rest}>
      {children}
    </View>
  );
});
BottomSheetBody.displayName = "BottomSheet.Body";

// Gesture-aware scroll container for content inside a BottomSheet. Plain
// react-native `<ScrollView>` fights gorhom's pan-down-to-close gesture; this
// wrapper uses gorhom's `BottomSheetScrollView` directly. We hand-roll the
// wrapper instead of `withUniwind` because the HOC chokes on gorhom's
// `memo(forwardRef(...))` output and resolves to `undefined` at runtime —
// reproduced as "Element type is invalid: got undefined" when the sheet opens.
//
// Accepts both className (resolved via `useResolveClassNames`) and
// style/contentContainerStyle. Defaults to `fill: true` (`flex: 1`) so the
// scrollview has a bounded height inside a fixed-snap-point sheet.
export type BottomSheetScrollViewProps = Omit<
  ComponentProps<typeof BottomSheetScrollView>,
  "style" | "contentContainerStyle"
> & {
  className?: string;
  contentContainerClassName?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  fill?: boolean;
};

const SCROLLVIEW_FILL = { flex: 1 } as const;

const BottomSheetScrollViewComponent = forwardRef<
  BottomSheetScrollViewMethods,
  BottomSheetScrollViewProps
>((props, ref) => {
  const {
    style,
    contentContainerStyle,
    className,
    contentContainerClassName,
    fill = true,
    ...rest
  } = props;
  const classNameStyle = useResolveClassNames(className ?? "");
  const contentClassNameStyle = useResolveClassNames(
    contentContainerClassName ?? "",
  );
  const mergedStyle: StyleProp<ViewStyle> = [
    fill ? SCROLLVIEW_FILL : null,
    className ? classNameStyle : null,
    style,
  ];
  const mergedContentStyle: StyleProp<ViewStyle> = [
    contentContainerClassName ? contentClassNameStyle : null,
    contentContainerStyle,
  ];
  return (
    <BottomSheetScrollView
      ref={ref}
      style={mergedStyle}
      contentContainerStyle={mergedContentStyle}
      {...rest}
    />
  );
});
BottomSheetScrollViewComponent.displayName = "BottomSheet.ScrollView";

export type BottomSheetCloseButtonProps = Omit<ButtonProps, "onPress"> & {
  accessibilityLabel?: string;
};

const BottomSheetCloseButton = forwardRef<View, BottomSheetCloseButtonProps>(
  (props, ref) => {
    const {
      variant = "ghost",
      size = "sm",
      isIconOnly = true,
      accessibilityLabel = "Close",
      children,
      ...rest
    } = props;
    const { onOpenChange } = useBottomSheetContext();

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        isIconOnly={isIconOnly}
        onPress={() => onOpenChange(false)}
        accessibilityLabel={accessibilityLabel}
        {...rest}
      >
        {children}
      </Button>
    );
  },
);
BottomSheetCloseButton.displayName = "BottomSheet.CloseButton";

export const BottomSheet = Object.assign(BottomSheetRoot, {
  Content: BottomSheetContent,
  ScrollView: BottomSheetScrollViewComponent,
  Header: BottomSheetHeader,
  Title: BottomSheetTitle,
  Description: BottomSheetDescription,
  Body: BottomSheetBody,
  CloseButton: BottomSheetCloseButton,
});
