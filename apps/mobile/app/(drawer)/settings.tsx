import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();

  return (
    <View className="flex-1 bg-background px-6" style={{ paddingTop: insets.top + 16 }}>
      {session ? (
        <>
          <Text className="text-[13px] text-muted-foreground">Signed in as</Text>
          <Text className="mb-6 mt-1 text-[16px] font-semibold text-foreground">
            {session.user.email}
          </Text>
          <Pressable
            className="items-center rounded-lg bg-primary px-5 py-3.5"
            onPress={() => authClient.signOut()}
          >
            <Text className="text-[15px] font-semibold text-primary-foreground">Sign out</Text>
          </Pressable>
        </>
      ) : (
        <Text className="text-[15px] text-muted-foreground">Not signed in</Text>
      )}
    </View>
  );
}
