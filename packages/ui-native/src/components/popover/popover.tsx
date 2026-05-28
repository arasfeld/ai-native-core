import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Pressable,
  Modal as RNModal,
  type Text as RNText,
  type StyleProp,
  StyleSheet,
  type View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import { Button, type ButtonProps } from "../button";
import { Heading, type HeadingProps } from "../heading";
import { Text, type TextProps } from "../text";

type Rect = { x: number; y: number; width: number; height: number };
type Placement = "bottom" | "top";
type Alignment = "center" | "start" | "end";

type PopoverContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
  anchor: Rect | null;
  measureAnchor: (node: View | null) => void;
  progress: SharedValue<number>;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) {
    throw new Error(
      "Popover subcomponents must be rendered inside <Popover open onOpenChange>",
    );
  }
  return ctx;
}

export type PopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
};

function PopoverRoot(props: PopoverProps) {
  const { open, onOpenChange, children } = props;
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const anchorNodeRef = useRef<View | null>(null);
  const progress = useSharedValue(0);

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Re-measure the anchor every time the popover opens so we pick up scroll /
  // layout shifts since the last open. measureInWindow gives screen-relative
  // coordinates which is what an RNModal portal needs.
  useEffect(() => {
    if (!open) {
      progress.value = withTiming(0, {
        duration: 120,
        easing: Easing.in(Easing.quad),
      });
      return;
    }
    const node = anchorNodeRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      progress.value = withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
    });
  }, [open, progress]);

  const measureAnchor = useCallback((node: View | null) => {
    anchorNodeRef.current = node;
  }, []);

  const ctx = useMemo<PopoverContextValue>(
    () => ({ open, setOpen, anchor, measureAnchor, progress }),
    [open, setOpen, anchor, measureAnchor, progress],
  );

  return (
    <PopoverContext.Provider value={ctx}>{children}</PopoverContext.Provider>
  );
}
PopoverRoot.displayName = "Popover";

export type PopoverTriggerProps = {
  /** A single React element. The popover attaches `ref` + an `onPress` wrapper. */
  children: ReactElement<{
    ref?: React.Ref<View>;
    onPress?: (...args: unknown[]) => void;
  }>;
  /** If true, child's existing onPress fires before Popover toggles. */
  asChild?: boolean;
};

const PopoverTrigger = forwardRef<View, PopoverTriggerProps>((props, ref) => {
  const { children } = props;
  const { open, setOpen, measureAnchor } = usePopoverContext();
  const child = Children.only(children);

  if (!isValidElement(child)) {
    throw new Error("Popover.Trigger requires a single React element child.");
  }

  // Combine our internal anchor ref with the caller's ref (if any) and the
  // forwarded ref. Without this, callers passing their own ref to e.g. a
  // <Pressable> would lose either ours or theirs. In React 19, `ref` is a
  // regular prop, so read it from child.props rather than child.ref.
  const childProps = child.props as {
    ref?: React.Ref<View>;
    onPress?: (e: unknown) => void;
  };
  const combinedRef = (node: View | null) => {
    measureAnchor(node);
    if (typeof ref === "function") ref(node);
    else if (ref && "current" in ref)
      (ref as React.MutableRefObject<View | null>).current = node;
    const childRef = childProps.ref;
    if (typeof childRef === "function") childRef(node);
    else if (childRef && "current" in childRef)
      (childRef as React.MutableRefObject<View | null>).current = node;
  };

  const originalOnPress = childProps.onPress;
  const handlePress = (e: unknown) => {
    if (typeof originalOnPress === "function") originalOnPress(e);
    setOpen(!open);
  };

  return cloneElement(child, {
    ref: combinedRef,
    onPress: handlePress,
  } as Partial<typeof child.props>);
});
PopoverTrigger.displayName = "Popover.Trigger";

export type PopoverContentProps = ViewProps & {
  /** Default `bottom`. Auto-flips to `top` if not enough room. */
  placement?: Placement;
  /** Horizontal alignment relative to the trigger. Default `center`. */
  align?: Alignment;
  /** Px offset between trigger edge and panel edge. Default 8. */
  offset?: number;
  /** Fixed width (px). Default: greedy — at least the trigger width. */
  width?: number;
  /** Max width (px). Default: screen width minus 32. */
  maxWidth?: number;
  /** Max height (px). Default: 60% of screen height. */
  maxHeight?: number;
  /** Render a tappable transparent backdrop to dismiss. Default true. */
  hasBackdrop?: boolean;
  /** Tapping the backdrop dismisses. Default true. */
  isDismissable?: boolean;
  /** className applied to the panel itself (the visible card). */
  className?: string;
  children?: ReactNode;
};

const SCREEN_PADDING = 16;

function computePosition(
  anchor: Rect,
  panel: { width: number; height: number },
  screen: { width: number; height: number },
  placement: Placement,
  align: Alignment,
  offset: number,
): { top: number; left: number; placement: Placement } {
  const wantsBottom = placement === "bottom";
  const spaceBelow = screen.height - (anchor.y + anchor.height) - offset;
  const spaceAbove = anchor.y - offset;
  const actual: Placement =
    wantsBottom && spaceBelow < panel.height && spaceAbove > spaceBelow
      ? "top"
      : !wantsBottom && spaceAbove < panel.height && spaceBelow > spaceAbove
        ? "bottom"
        : placement;

  const top =
    actual === "bottom"
      ? anchor.y + anchor.height + offset
      : anchor.y - panel.height - offset;

  let left: number;
  if (align === "start") {
    left = anchor.x;
  } else if (align === "end") {
    left = anchor.x + anchor.width - panel.width;
  } else {
    left = anchor.x + anchor.width / 2 - panel.width / 2;
  }
  // Clamp to screen with padding
  left = Math.max(
    SCREEN_PADDING,
    Math.min(left, screen.width - panel.width - SCREEN_PADDING),
  );
  return { top, left, placement: actual };
}

const PopoverContent = forwardRef<View, PopoverContentProps>((props, ref) => {
  const {
    placement: placementProp = "bottom",
    align = "center",
    offset = 8,
    width,
    maxWidth,
    maxHeight,
    hasBackdrop = true,
    isDismissable = true,
    className,
    style,
    children,
    ...rest
  } = props;
  const { open, setOpen, anchor, progress } = usePopoverContext();
  const colors = useThemeColors();
  const screen = Dimensions.get("window");
  const effectiveMaxWidth = maxWidth ?? screen.width - 2 * SCREEN_PADDING;
  const effectiveMaxHeight = maxHeight ?? screen.height * 0.6;
  const [panelSize, setPanelSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [modalVisible, setModalVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setModalVisible(true);
    }
  }, [open]);

  // Wait for the panel's onLayout before computing position, otherwise we
  // either place at (0,0) or one frame off. Keep the modal mounted through
  // the close animation, then unmount.
  useEffect(() => {
    if (open) return;
    if (!modalVisible) return;
    const t = setTimeout(() => setModalVisible(false), 140);
    return () => clearTimeout(t);
  }, [open, modalVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        scale: 0.96 + progress.value * 0.04,
      },
    ],
  }));

  if (!modalVisible) return null;
  if (!anchor) return null;

  const targetWidth = width ?? Math.max(anchor.width, 200);
  const clampedWidth = Math.min(targetWidth, effectiveMaxWidth);

  const position = panelSize
    ? computePosition(
        anchor,
        { width: panelSize.width, height: panelSize.height },
        { width: screen.width, height: screen.height },
        placementProp,
        align,
        offset,
      )
    : null;

  const panelStyle: StyleProp<ViewStyle> = [
    {
      position: "absolute",
      width: clampedWidth,
      maxHeight: effectiveMaxHeight,
      backgroundColor: colors.popover,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    position
      ? { top: position.top, left: position.left, opacity: 1 }
      : { opacity: 0 },
    style,
  ];

  return (
    <RNModal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => setOpen(false)}
    >
      {hasBackdrop ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isDismissable ? () => setOpen(false) : undefined}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <Animated.View
        ref={ref}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (!panelSize || panelSize.width !== w || panelSize.height !== h) {
            setPanelSize({ width: w, height: h });
          }
        }}
        style={[panelStyle, animatedStyle]}
        className={className}
        {...rest}
      >
        {children}
      </Animated.View>
    </RNModal>
  );
});
PopoverContent.displayName = "Popover.Content";

export type PopoverTitleProps = HeadingProps;
const PopoverTitle = forwardRef<RNText, PopoverTitleProps>((props, ref) => {
  const { level = 5, weight = "semibold", className, ...rest } = props;
  return (
    <Heading
      ref={ref}
      level={level}
      weight={weight}
      className={cn("px-4 pt-3", className)}
      {...rest}
    />
  );
});
PopoverTitle.displayName = "Popover.Title";

export type PopoverDescriptionProps = TextProps;
const PopoverDescription = forwardRef<RNText, PopoverDescriptionProps>(
  (props, ref) => {
    const { size = "sm", tone = "muted", className, ...rest } = props;
    return (
      <Text
        ref={ref}
        size={size}
        tone={tone}
        className={cn("px-4 pb-3", className)}
        {...rest}
      />
    );
  },
);
PopoverDescription.displayName = "Popover.Description";

export type PopoverCloseProps = Omit<ButtonProps, "onPress"> & {
  accessibilityLabel?: string;
};
const PopoverClose = forwardRef<View, PopoverCloseProps>((props, ref) => {
  const {
    variant = "ghost",
    size = "sm",
    isIconOnly = true,
    accessibilityLabel = "Close",
    children,
    ...rest
  } = props;
  const { setOpen } = usePopoverContext();
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      isIconOnly={isIconOnly}
      onPress={() => setOpen(false)}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    >
      {children}
    </Button>
  );
});
PopoverClose.displayName = "Popover.Close";

export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Title: PopoverTitle,
  Description: PopoverDescription,
  Close: PopoverClose,
});
