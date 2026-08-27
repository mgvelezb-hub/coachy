import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { colors, fonts } from "@/lib/theme";

type TabIconProps = { symbol: string; color: ColorValue };

function TabIcon({ symbol, color }: TabIconProps) {
  return <Text style={{ fontSize: 18, color }}>{symbol}</Text>;
}

function tabLabel(title: string) {
  return function Label({ color }: { color: ColorValue }) {
    return (
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: 10,
          letterSpacing: 1.5,
          color,
        }}
      >
        {title.toUpperCase()}
      </Text>
    );
  };
}

/** 3 tabs: Hoy, Check-in, Historial. Tab bar obsidiana, borde sutil. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Igual que el Stack raíz: sin esto cada tab pinta el fondo claro
        // del sistema encima de la obsidiana.
        sceneStyle: { backgroundColor: colors.obsidiana },
        tabBarActiveTintColor: colors.guindaLight,
        tabBarInactiveTintColor: colors.paloRosa,
        tabBarStyle: {
          backgroundColor: colors.obsidiana,
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: tabLabel("Hoy"),
          tabBarIcon: ({ color }) => <TabIcon symbol="☀" color={color} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          tabBarLabel: tabLabel("Check-in"),
          tabBarIcon: ({ color }) => <TabIcon symbol="✎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          tabBarLabel: tabLabel("Historial"),
          tabBarIcon: ({ color }) => <TabIcon symbol="◈" color={color} />,
        }}
      />
    </Tabs>
  );
}
