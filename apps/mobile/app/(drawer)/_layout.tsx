import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function DrawerLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer>
        <Drawer.Screen name="index" options={{ title: "Chat" }} />
        <Drawer.Screen name="settings" options={{ title: "Settings" }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}
