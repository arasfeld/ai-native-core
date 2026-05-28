import { forwardRef } from "react";
import type { Text as RNText } from "react-native";
import { Text, type TextProps } from "../text";

export type FieldErrorProps = TextProps;

/**
 * Renders a destructive-toned error message. Returns `null` if no `children`
 * are provided so callers can render it unconditionally.
 */
export const FieldError = forwardRef<RNText, FieldErrorProps>((props, ref) => {
  const { children, size = "xs", weight = "medium", ...rest } = props;

  if (!children) return null;

  return (
    <Text ref={ref} size={size} weight={weight} tone="destructive" {...rest}>
      {children}
    </Text>
  );
});

FieldError.displayName = "FieldError";
