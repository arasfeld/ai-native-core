import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Thin wrappers around `expo-haptics`. On platforms where haptics are
 * unavailable (web), each function silently no-ops so callers don't need
 * to branch. All wrappers are fire-and-forget — failures are swallowed.
 */

function isSupported(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/** Light impact — default button tap, FAB. */
export function tap(): void {
  if (!isSupported()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Selection change — switch toggle, segmented control, chip selection. */
export function selection(): void {
  if (!isSupported()) return;
  Haptics.selectionAsync().catch(() => {});
}

/** Medium impact — emphasized tap (vote, like, primary CTA). */
export function emphasis(): void {
  if (!isSupported()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success notification — completed save / upload. */
export function success(): void {
  if (!isSupported()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

/** Warning notification — destructive button tap before confirm. */
export function warning(): void {
  if (!isSupported()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
}

/** Error notification — failed action / validation. */
export function error(): void {
  if (!isSupported()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
