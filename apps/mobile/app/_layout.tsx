import "../global.css";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
      (__DEV__ ? "development" : "production"),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

const queryClient = new QueryClient();

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(drawer)" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
