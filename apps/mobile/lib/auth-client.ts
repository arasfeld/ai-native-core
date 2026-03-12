import { expoClient } from "@better-auth/expo/client";
import { env } from "@repo/env/native";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const scheme = (Constants.expoConfig?.scheme as string) ?? "ai-native";

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_SERVER_URL,
  plugins: [
    expoClient({
      scheme,
      storagePrefix: scheme,
      storage: SecureStore,
    }),
  ],
});
