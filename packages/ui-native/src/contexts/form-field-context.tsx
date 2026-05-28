import { createContext, useContext } from "react";

export type FormFieldState = {
  isDisabled: boolean;
  isInvalid: boolean;
  isRequired: boolean;
  isFocused: boolean;
};

const DEFAULT_STATE: FormFieldState = {
  isDisabled: false,
  isInvalid: false,
  isRequired: false,
  isFocused: false,
};

const FormFieldContext = createContext<FormFieldState | null>(null);

export const FormFieldProvider = FormFieldContext.Provider;

/** Returns the current form-field state, or a neutral default if unscoped. */
export function useFormField(): FormFieldState {
  return useContext(FormFieldContext) ?? DEFAULT_STATE;
}
