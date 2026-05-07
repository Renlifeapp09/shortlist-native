import { Tabs } from "expo-router";

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
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "400",
          letterSpacing: 1,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="log" options={{ title: "Log" }} />
      <Tabs.Screen name="closet" options={{ title: "Closet" }} />
      <Tabs.Screen name="decide" options={{ title: "Decide" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
    </Tabs>
  );
}
