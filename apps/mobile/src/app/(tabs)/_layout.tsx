import { Tabs } from "expo-router";
import { CalendarCheck, Dumbbell, LibraryBig, LineChart, Sun } from "lucide-react-native";
import { useEffect } from "react";
import { Text, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/theme";
import { fonts } from "@/lib/theme";
import { startNetworkSync, syncAndNotify } from "@/lib/training-sync";

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

/** 5 tabs: Hoy, Gym, Check-in, Historial, Biblioteca. Tab bar obsidiana, borde sutil. */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // Trigger 1 de la cola del modo gimnasio (apps/mobile/src/lib/training-sync.ts):
  // al montar la app ya con sesión, se intenta vaciar lo que haya quedado
  // pendiente de la última vez, y arranca el listener que reintenta solo al
  // recuperar señal (trigger 2). El trigger 3 — después de cada captura — vive
  // en la pantalla de Gym.
  useEffect(() => {
    const stopNetworkSync = startNetworkSync();
    void syncAndNotify();
    return stopNetworkSync;
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Igual que el Stack raíz: sin esto cada tab pinta el fondo claro
        // del sistema encima de la obsidiana. El paddingTop respeta el notch
        // para las cuatro pantallas de una sola vez.
        sceneStyle: { backgroundColor: colors.obsidiana, paddingTop: insets.top },
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
          tabBarIcon: ({ color }) => <Sun size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="gym"
        options={{
          tabBarLabel: tabLabel("Gym"),
          tabBarIcon: ({ color }) => <Dumbbell size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          tabBarLabel: tabLabel("Check-in"),
          tabBarIcon: ({ color }) => <CalendarCheck size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          tabBarLabel: tabLabel("Historial"),
          tabBarIcon: ({ color }) => <LineChart size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="biblioteca"
        options={{
          // "Videos" y no "Biblioteca": con 5 tabs el label largo se parte en
          // dos líneas.
          tabBarLabel: tabLabel("Videos"),
          tabBarIcon: ({ color }) => <LibraryBig size={20} color={color} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
