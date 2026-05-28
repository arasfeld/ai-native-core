import {
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  KeyboardAvoidingView,
  type ModalProps,
  Platform,
  Pressable,
  Modal as RNModal,
  type Text as RNText,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../../utils/cn";
import { Button, type ButtonProps } from "../button";
import { Heading, type HeadingProps } from "../heading";
import { Text, type TextProps } from "../text";
import {
  type DialogPlacement,
  type DialogSize,
  dialogContent,
  dialogFooter,
  dialogHeader,
  dialogOverlay,
} from "./dialog.styles";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDismissable: boolean;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const noop = () => {};

function useDialogContext(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      "Dialog subcomponents must be rendered inside <Dialog open onOpenChange>",
    );
  }
  return ctx;
}

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When true (default), tapping the backdrop or pressing Android back
   * dismisses the dialog. Set `false` for blocking confirmations.
   */
  isDismissable?: boolean;
  /**
   * Pass-through to underlying Modal for advanced cases (e.g. hardware
   * back button handling). Avoid if possible.
   */
  modalProps?: Omit<ModalProps, "visible" | "transparent" | "animationType">;
  children?: ReactNode;
};

function DialogRoot(props: DialogProps) {
  const {
    open,
    onOpenChange,
    isDismissable = true,
    modalProps,
    children,
  } = props;

  const ctxValue = useMemo<DialogContextValue>(
    () => ({ open, onOpenChange, isDismissable }),
    [open, onOpenChange, isDismissable],
  );

  const handleRequestClose = useCallback(() => {
    if (isDismissable) onOpenChange(false);
  }, [isDismissable, onOpenChange]);

  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
      {...modalProps}
    >
      <DialogContext.Provider value={ctxValue}>
        {children}
      </DialogContext.Provider>
    </RNModal>
  );
}

DialogRoot.displayName = "Dialog";

export type DialogContentProps = ViewProps & {
  placement?: DialogPlacement;
  size?: DialogSize;
  /** Wraps content in KeyboardAvoidingView. Defaults to true. */
  avoidKeyboard?: boolean;
};

const DialogContent = forwardRef<View, DialogContentProps>((props, ref) => {
  const {
    placement = "center",
    size = "md",
    avoidKeyboard = true,
    className,
    children,
    ...rest
  } = props;
  const { onOpenChange, isDismissable } = useDialogContext();

  const handleBackdropPress = useCallback(() => {
    if (isDismissable) onOpenChange(false);
  }, [isDismissable, onOpenChange]);

  const card = (
    <View
      ref={ref}
      className={cn(dialogContent({ size }), className)}
      {...rest}
    >
      {children}
    </View>
  );

  return (
    <Pressable
      onPress={handleBackdropPress}
      accessibilityRole="none"
      className={cn(dialogOverlay({ placement }))}
    >
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="w-full items-center"
        >
          {/* Absorbs touches that would otherwise hit the backdrop Pressable. */}
          <Pressable onPress={noop} className="w-full">
            {card}
          </Pressable>
        </KeyboardAvoidingView>
      ) : (
        <Pressable onPress={noop} className="w-full">
          {card}
        </Pressable>
      )}
    </Pressable>
  );
});

DialogContent.displayName = "Dialog.Content";

export type DialogHeaderProps = ViewProps & { children?: ReactNode };

const DialogHeader = forwardRef<View, DialogHeaderProps>((props, ref) => {
  const { className, children, ...rest } = props;
  return (
    <View ref={ref} className={cn(dialogHeader(), className)} {...rest}>
      {children}
    </View>
  );
});
DialogHeader.displayName = "Dialog.Header";

export type DialogTitleProps = HeadingProps;

const DialogTitle = forwardRef<RNText, DialogTitleProps>((props, ref) => {
  const { level = 5, weight = "semibold", ...rest } = props;
  return <Heading ref={ref} level={level} weight={weight} {...rest} />;
});
DialogTitle.displayName = "Dialog.Title";

export type DialogDescriptionProps = TextProps;

const DialogDescription = forwardRef<RNText, DialogDescriptionProps>(
  (props, ref) => {
    const { size = "sm", tone = "muted", ...rest } = props;
    return <Text ref={ref} size={size} tone={tone} {...rest} />;
  },
);
DialogDescription.displayName = "Dialog.Description";

export type DialogBodyProps = ViewProps & { children?: ReactNode };

const DialogBody = forwardRef<View, DialogBodyProps>((props, ref) => {
  const { className, children, ...rest } = props;
  return (
    <View ref={ref} className={cn("gap-3", className)} {...rest}>
      {children}
    </View>
  );
});
DialogBody.displayName = "Dialog.Body";

export type DialogFooterProps = ViewProps & { children?: ReactNode };

const DialogFooter = forwardRef<View, DialogFooterProps>((props, ref) => {
  const { className, children, ...rest } = props;
  return (
    <View ref={ref} className={cn(dialogFooter(), className)} {...rest}>
      {children}
    </View>
  );
});
DialogFooter.displayName = "Dialog.Footer";

export type DialogCloseButtonProps = Omit<ButtonProps, "onPress"> & {
  accessibilityLabel?: string;
};

const DialogCloseButton = forwardRef<View, DialogCloseButtonProps>(
  (props, ref) => {
    const {
      variant = "ghost",
      size = "sm",
      isIconOnly = true,
      accessibilityLabel = "Close",
      children,
      ...rest
    } = props;
    const { onOpenChange } = useDialogContext();

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
DialogCloseButton.displayName = "Dialog.CloseButton";

export const Dialog = Object.assign(DialogRoot, {
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Body: DialogBody,
  Footer: DialogFooter,
  CloseButton: DialogCloseButton,
});
