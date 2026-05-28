import { useCallback, useRef, useState } from "react";

/**
 * Controlled / uncontrolled state hook.
 *
 * - If `value` is provided, the component is controlled and only `onChange` fires.
 * - If `value` is undefined, internal state is used (`defaultValue` seeds it).
 */
export function useControlledState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T>(defaultValue);
  const current = isControlled ? (value as T) : internal;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) {
        setInternal(next);
      }
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, setValue];
}
