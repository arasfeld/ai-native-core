import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

/**
 * Registers the device's Expo push token with the server whenever the user is
 * signed in. Best-effort: silently no-ops on simulators, when permission is
 * denied, or when no EAS projectId is configured.
 */
export function usePushRegistration(): void {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || !Device.isDevice) return;

    let cancelled = false;
    (async () => {
      try {
        const existing =
          (await Notifications.getPermissionsAsync()) as unknown as {
            status: string;
          };
        let status = existing.status;
        if (status !== "granted") {
          const req =
            (await Notifications.requestPermissionsAsync()) as unknown as {
              status: string;
            };
          status = req.status;
        }
        if (cancelled || status !== "granted") return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          // biome-ignore lint/suspicious/noExplicitAny: Constants typings drop the easConfig field
          (Constants as any).easConfig?.projectId;
        if (!projectId) return;

        const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
          .data;
        if (cancelled) return;

        await api.post("/auth/push-tokens", {
          token,
          platform: Platform.OS === "ios" ? "ios" : "android",
        });
      } catch {
        // Best-effort — never throw from a registration side-effect.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
