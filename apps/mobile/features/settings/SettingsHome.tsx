import { Button, Screen, Surface, Text } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { authClient } from "@/lib/auth-client";

type Row = { label: string; description: string; path: string };

const ROWS: Row[] = [
  { label: "Appearance", description: "Theme", path: "/settings/appearance" },
  {
    label: "API keys",
    description: "Personal access tokens",
    path: "/settings/api-keys",
  },
  {
    label: "Account",
    description: "Two-factor, delete account",
    path: "/settings/account",
  },
];

export function SettingsHome() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <Screen scroll contentContainerClassName="px-4 pt-4 pb-12 gap-4">
      <Surface variant="default" radius="md" className="overflow-hidden">
        {ROWS.map((row, i) => (
          <Pressable
            key={row.path}
            onPress={() => router.push(row.path as never)}
            className={
              "flex-row items-center justify-between px-4 py-4" +
              (i < ROWS.length - 1 ? "border-border/60 border-b" : "")
            }
          >
            <View className="gap-0.5">
              <Text weight="semibold">{row.label}</Text>
              <Text size="xs" tone="muted">
                {row.description}
              </Text>
            </View>
            <Text size="xl" tone="muted">
              ›
            </Text>
          </Pressable>
        ))}
      </Surface>

      {session ? (
        <View className="gap-2">
          <Text tone="muted" size="sm">
            Signed in as {session.user.email}
          </Text>
          <Button variant="outline" onPress={() => authClient.signOut()}>
            Sign out
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
