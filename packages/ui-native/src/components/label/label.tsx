import { forwardRef } from "react";
import type { Text as RNText } from "react-native";
import { useFormField } from "../../contexts/form-field-context";
import { cn } from "../../utils/cn";
import { Text, type TextProps } from "../text";

export type LabelProps = TextProps;

export const Label = forwardRef<RNText, LabelProps>((props, ref) => {
  const { className, weight = "medium", size = "sm", tone, ...rest } = props;

  const { isInvalid, isDisabled } = useFormField();

  const resolvedTone = tone ?? (isInvalid ? "destructive" : "default");

  return (
    <Text
      ref={ref}
      size={size}
      weight={weight}
      tone={resolvedTone}
      className={cn(isDisabled && "opacity-50", className)}
      {...rest}
    />
  );
});

Label.displayName = "Label";
