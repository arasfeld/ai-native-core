import "../global.css";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";

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

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const posthogHost =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

const queryClient = new QueryClient();

function PostHogIdentify() {
  const { data: session } = authClient.useSession();
  const posthog = usePostHog();
  const user = session?.user;
  const userId = user?.id;
  const email = user?.email;
  const name = user?.name;

  useEffect(() => {
    if (!posthog) return;
    if (userId) {
      posthog.identify(userId, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      });
    } else {
      posthog.reset();
    }
  }, [posthog, userId, email, name]);

  return null;
}

function AppShell() {
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

function RootLayout() {
  if (!posthogKey) return <AppShell />;
  return (
    <PostHogProvider
      apiKey={posthogKey}
      options={{ host: posthogHost, captureAppLifecycleEvents: true }}
    >
      <PostHogIdentify />
      <AppShell />
    </PostHogProvider>
  );
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
