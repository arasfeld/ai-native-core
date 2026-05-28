import { Drawer } from "expo-router/drawer";

export default function DrawerLayout() {
  return (
    <Drawer>
      <Drawer.Screen name="index" options={{ title: "Chat" }} />
      <Drawer.Screen name="history" options={{ title: "History" }} />
      <Drawer.Screen name="profile" options={{ title: "Profile" }} />
      <Drawer.Screen
        name="settings"
        options={{ title: "Settings", headerShown: false }}
      />
    </Drawer>
  );
}
