import { Button, Text } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <View
      className="flex-1 gap-6 bg-background px-6"
      style={{ paddingTop: insets.top + 16 }}
    >
      {session ? (
        <>
          <View>
            <Text tone="muted" size="sm">
              Signed in as
            </Text>
            <Text weight="semibold">{session.user.email}</Text>
          </View>
          <Button variant="outline" onPress={() => authClient.signOut()}>
            Sign out
          </Button>
        </>
      ) : (
        <>
          <Text tone="muted">You are not signed in.</Text>
          <Button onPress={() => router.replace("/login")}>Sign in</Button>
        </>
      )}
    </View>
  );
}
