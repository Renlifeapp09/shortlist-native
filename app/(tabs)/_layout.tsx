import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2a6b55",
        tabBarInactiveTintColor: "#8b7d6b",
        tabBarStyle: {
          backgroundColor: "#faf9f7",
          borderTopColor: "#e8e4df",
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
    </Tabs>
  );
}
