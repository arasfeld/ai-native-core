import {
  createContext,
  forwardRef,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import type { Text as RNText, View } from "react-native";
import { cn } from "../../utils/cn";
import {
  PressableFeedback,
  type PressableFeedbackAnimation,
  type PressableFeedbackProps,
} from "../pressable-feedback";
import { Spinner } from "../spinner";
import { Text, type TextProps } from "../text";
import {
  type ButtonSize,
  type ButtonVariant,
  buttonLabel,
  buttonRoot,
} from "./button.styles";

type ButtonContextValue = {
  variant: ButtonVariant;
  size: ButtonSize;
  isDisabled: boolean;
};

const ButtonContext = createContext<ButtonContextValue | null>(null);

function useButtonContext(): ButtonContextValue {
  const ctx = useContext(ButtonContext);
  if (!ctx) {
    throw new Error("Button.Label must be rendered inside <Button>");
  }
  return ctx;
}

const SPINNER_TONE: Record<
  ButtonVariant,
  React.ComponentProps<typeof Spinner>["tone"]
> = {
  primary: "primary-foreground",
  secondary: "foreground",
  outline: "foreground",
  ghost: "foreground",
  destructive: "primary-foreground",
};

export type ButtonProps = Omit<PressableFeedbackProps, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  children?: ReactNode;
  animation?: PressableFeedbackAnimation;
};

const ButtonRoot = forwardRef<View, ButtonProps>((props, ref) => {
  const {
    variant = "primary",
    size = "md",
    isIconOnly = false,
    isDisabled = false,
    isLoading = false,
    startContent,
    endContent,
    children,
    className,
    animation,
    accessibilityRole = "button",
    ...rest
  } = props;

  const disabled = isDisabled || isLoading;

  const contextValue = useMemo<ButtonContextValue>(
    () => ({ variant, size, isDisabled: disabled }),
    [variant, size, disabled],
  );

  const content =
    typeof children === "string" ? (
      <ButtonLabel>{children}</ButtonLabel>
    ) : (
      children
    );

  return (
    <ButtonContext.Provider value={contextValue}>
      <PressableFeedback
        ref={ref}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled, busy: isLoading }}
        animation={animation}
        haptic={variant === "destructive" ? "emphasis" : "tap"}
        className={cn(
          buttonRoot({ variant, size, isIconOnly, isDisabled: disabled }),
          className,
        )}
        {...rest}
      >
        {isLoading ? (
          <Spinner
            tone={SPINNER_TONE[variant]}
            size={size === "sm" ? "sm" : "md"}
          />
        ) : (
          <>
            {startContent}
            {content}
            {endContent}
          </>
        )}
      </PressableFeedback>
    </ButtonContext.Provider>
  );
});

ButtonRoot.displayName = "Button";

export type ButtonLabelProps = Omit<TextProps, "size" | "tone"> & {
  children: ReactNode;
};

const ButtonLabel = forwardRef<RNText, ButtonLabelProps>((props, ref) => {
  const { children, className, style, weight = "semibold", ...rest } = props;
  const { variant, size } = useButtonContext();

  return (
    <Text
      ref={ref}
      weight={weight}
      className={cn(buttonLabel({ variant, size }), className)}
      style={style}
      {...rest}
    >
      {children}
    </Text>
  );
});

ButtonLabel.displayName = "Button.Label";

export const Button = Object.assign(ButtonRoot, {
  Label: ButtonLabel,
});
