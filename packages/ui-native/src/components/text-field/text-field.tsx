import {
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native";

type TextInputFocusHandler = NonNullable<TextInputProps["onFocus"]>;
type TextInputBlurHandler = NonNullable<TextInputProps["onBlur"]>;
type TextInputFocusArg = Parameters<TextInputFocusHandler>[0];
type TextInputBlurArg = Parameters<TextInputBlurHandler>[0];

import { tv } from "tailwind-variants";
import {
  FormFieldProvider,
  type FormFieldState,
  useFormField,
} from "../../contexts/form-field-context";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import { FieldError, type FieldErrorProps } from "../field-error";
import { Label, type LabelProps } from "../label";
import { Text, type TextProps } from "../text";

// `min-h-12` (48dp) instead of vertical padding so the native TextInput has
// enough room for descenders (q, p, y, j, g). Mirrors heroui-native's Input
// pattern — explicit `py-*` clips descenders on focus.
const inputStyles = tv({
  base: "min-h-12 rounded-xl border border-input bg-card px-3 text-base text-card-foreground",
  variants: {
    isFocused: { true: "border-primary" },
    isInvalid: { true: "border-destructive" },
    isDisabled: { true: "opacity-50" },
  },
});

// Wrapper variant: same border/bg/radius/min-height/padding as the bare input,
// but with row layout so leading/trailing adornments (icons, clear buttons)
// can sit next to the TextInput inside the same border.
const inputWrapperStyles = tv({
  base: "min-h-12 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3",
  variants: {
    isFocused: { true: "border-primary" },
    isInvalid: { true: "border-destructive" },
    isDisabled: { true: "opacity-50" },
  },
});

export type TextFieldRootProps = ViewProps & {
  isDisabled?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  children?: ReactNode;
};

type TextFieldRootContextValue = FormFieldState & {
  setFocused: (next: boolean) => void;
};

const TextFieldContext = createContext<TextFieldRootContextValue | null>(null);

function useTextFieldContext(): TextFieldRootContextValue {
  const ctx = useContext(TextFieldContext);
  if (!ctx) {
    throw new Error("TextField subcomponents must be used inside <TextField>");
  }
  return ctx;
}

const TextFieldRoot = forwardRef<View, TextFieldRootProps>((props, ref) => {
  const {
    isDisabled = false,
    isInvalid = false,
    isRequired = false,
    className,
    children,
    ...rest
  } = props;

  const [isFocused, setFocused] = useState(false);

  const formState = useMemo<FormFieldState>(
    () => ({ isDisabled, isInvalid, isRequired, isFocused }),
    [isDisabled, isInvalid, isRequired, isFocused],
  );

  const ctxValue = useMemo<TextFieldRootContextValue>(
    () => ({ ...formState, setFocused }),
    [formState],
  );

  return (
    <FormFieldProvider value={formState}>
      <TextFieldContext.Provider value={ctxValue}>
        <View ref={ref} className={cn("gap-1.5", className)} {...rest}>
          {children}
        </View>
      </TextFieldContext.Provider>
    </FormFieldProvider>
  );
});

TextFieldRoot.displayName = "TextField";

export type TextFieldInputProps = TextInputProps & {
  /**
   * Content rendered inside the input border, before the TextInput.
   * Use for leading icons (e.g. Search, MapPin). When set, the border/bg/radius
   * moves from the TextInput to a wrapping row container so adornments sit
   * inside the same visual surface as the input.
   */
  startContent?: ReactNode;
  /**
   * Content rendered inside the input border, after the TextInput.
   * Use for trailing affordances (clear buttons, locate buttons, unit labels).
   */
  endContent?: ReactNode;
};

const TextFieldInput = forwardRef<TextInput, TextFieldInputProps>(
  (props, forwardedRef) => {
    const {
      className,
      onFocus,
      onBlur,
      editable,
      style,
      placeholderTextColor,
      cursorColor,
      selectionColor,
      startContent,
      endContent,
      ...rest
    } = props;

    const { isDisabled, isInvalid, isFocused, setFocused } =
      useTextFieldContext();
    const colors = useThemeColors();

    // Local handle to the TextInput so a tap on the adornment row (icons,
    // padding outside the actual input) can focus the input. Without this,
    // tapping `startContent` (e.g. Paperclip / Search icon) hits a bare View
    // and nothing happens — the pill looks broken because the user assumes
    // the whole capsule is the input. We merge with the forwarded ref so
    // callers that ref the input directly still work.
    const innerInputRef = useRef<TextInput | null>(null);
    const setInputRef = useCallback(
      (node: TextInput | null) => {
        innerInputRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const handleFocus = useCallback(
      (event: TextInputFocusArg) => {
        setFocused(true);
        onFocus?.(event);
      },
      [setFocused, onFocus],
    );

    const handleBlur = useCallback(
      (event: TextInputBlurArg) => {
        setFocused(false);
        onBlur?.(event);
      },
      [setFocused, onBlur],
    );

    const fontStyle: TextStyle = { fontFamily: "Inter" };

    const commonInputProps = {
      editable: editable === false ? false : !isDisabled,
      onFocus: handleFocus,
      onBlur: handleBlur,
      style: style ? [fontStyle, style] : fontStyle,
      placeholderTextColor: placeholderTextColor ?? colors.mutedForeground,
      // iOS: caret + selection highlight. Android: selection highlight only;
      // `cursorColor` controls the caret separately.
      selectionColor: selectionColor ?? colors.primary,
      cursorColor: cursorColor ?? colors.primary,
      ...rest,
    };

    // No adornments → bare TextInput owns the border/bg styling (original
    // behavior preserved; className still lands on the TextInput).
    if (!startContent && !endContent) {
      return (
        <TextInput
          ref={setInputRef}
          {...commonInputProps}
          className={cn(
            inputStyles({ isFocused, isInvalid, isDisabled }),
            className,
          )}
        />
      );
    }

    const canFocus = editable !== false && !isDisabled;

    // Adornments present → wrap in a Pressable row that takes the visual
    // styling. Tapping anywhere inside the pill (including icon adornments)
    // focuses the inner TextInput. Nested touchables in `endContent` (e.g.
    // a clear button) keep their own handlers; RN only fires the innermost
    // press target on a hit.
    return (
      <Pressable
        onPress={() => {
          if (canFocus) innerInputRef.current?.focus();
        }}
        accessibilityRole="none"
        className={cn(
          inputWrapperStyles({ isFocused, isInvalid, isDisabled }),
          className,
        )}
      >
        {startContent}
        <TextInput
          ref={setInputRef}
          {...commonInputProps}
          className="flex-1 text-base text-card-foreground"
        />
        {endContent}
      </Pressable>
    );
  },
);

TextFieldInput.displayName = "TextField.Input";

const TextFieldLabel = forwardRef<React.ElementRef<typeof Label>, LabelProps>(
  (props, ref) => {
    return <Label ref={ref} {...props} />;
  },
);
TextFieldLabel.displayName = "TextField.Label";

export type TextFieldDescriptionProps = TextProps;

const TextFieldDescription = forwardRef<
  React.ElementRef<typeof Text>,
  TextFieldDescriptionProps
>((props, ref) => {
  const { size = "xs", tone = "muted", ...rest } = props;
  return <Text ref={ref} size={size} tone={tone} {...rest} />;
});
TextFieldDescription.displayName = "TextField.Description";

const TextFieldErrorMessage = forwardRef<
  React.ElementRef<typeof FieldError>,
  FieldErrorProps
>((props, ref) => {
  const { isInvalid } = useFormField();
  if (!isInvalid) return null;
  return <FieldError ref={ref} {...props} />;
});
TextFieldErrorMessage.displayName = "TextField.ErrorMessage";

export const TextField = Object.assign(TextFieldRoot, {
  Label: TextFieldLabel,
  Input: TextFieldInput,
  Description: TextFieldDescription,
  ErrorMessage: TextFieldErrorMessage,
});
