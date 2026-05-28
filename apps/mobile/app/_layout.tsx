import "../global.css";
import { UIProvider } from "@repo/ui-native";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAudioModeAsync } from "expo-audio";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { usePushRegistration } from "@/hooks/use-push-registration";
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

function Router() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  usePushRegistration();

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {
      // Expo Go on SDK 53+ removed remote-push native support; setting a
      // handler can throw. Push is dev-client / standalone only.
    }
    let sub: { remove: () => void } | undefined;
    try {
      sub = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const link = response.notification.request.content.data?.deepLink as
            | string
            | undefined;
          if (link) router.push(link as never);
        },
      );
    } catch {
      // Same Expo Go caveat as above.
    }
    return () => sub?.remove();
  }, [router]);

  if (isPending) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {session ? (
        <Stack.Screen name="(drawer)" />
      ) : (
        <Stack.Screen name="(auth)" />
      )}
    </Stack>
  );
}

function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <UIProvider>
            <Router />
          </UIProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
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
