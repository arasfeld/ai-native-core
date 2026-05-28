import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import type { ReactNode } from "react";
import { ToastProvider } from "../components/toast";

export type UIProviderProps = {
  children: ReactNode;
  /** Default auto-dismiss duration for toasts. Default 4000ms. */
  toastDuration?: number;
};

/**
 * Root provider for `@repo/ui-native`. Mounts:
 *  - ToastProvider so any descendant can call `useToast()`.
 *  - ActionSheetProvider so descendants can call `useActionSheet()` from
 *    `@expo/react-native-action-sheet` (native iOS sheet, cross-platform).
 *
 * `<BottomSheet>` portals itself through a React Native `Modal` and does not
 * need a global gorhom provider. `<Popover>` does the same. Both still
 * require `GestureHandlerRootView` at the app root.
 */
export function UIProvider({ children, toastDuration }: UIProviderProps) {
  return (
    <ActionSheetProvider>
      <ToastProvider defaultDuration={toastDuration}>{children}</ToastProvider>
    </ActionSheetProvider>
  );
}

UIProvider.displayName = "UIProvider";
