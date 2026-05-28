import { Screen, SegmentedControl, Text } from "@repo/ui-native";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Uniwind } from "uniwind";

type Theme = "system" | "light" | "dark";
const STORAGE_KEY = "app.theme";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function AppearanceScreen() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
        Uniwind.setTheme(stored);
      }
    });
  }, []);

  const onChange = (value: string) => {
    const next = value as Theme;
    setTheme(next);
    Uniwind.setTheme(next);
    SecureStore.setItemAsync(STORAGE_KEY, next);
  };

  return (
    <Screen scroll contentContainerClassName="px-4 pt-6 pb-12 gap-4">
      <View className="gap-2">
        <Text weight="semibold">Theme</Text>
        <Text size="xs" tone="muted">
          Choose how the app looks.
        </Text>
      </View>
      <SegmentedControl options={OPTIONS} value={theme} onChange={onChange} />
    </Screen>
  );
}
