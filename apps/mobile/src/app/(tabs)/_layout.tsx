import { Tabs } from "expo-router";
import { Dumbbell, LayoutGrid, LibraryBig, Salad, Sun } from "lucide-react-native";
import { useEffect } from "react";
import { AppState, Text, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/theme";
import { autoSyncHealth } from "@/lib/health";
import { fonts } from "@/lib/theme";
import { startNetworkSync, syncAndNotify } from "@/lib/training-sync";

function tabLabel(title: string) {
  return function Label({ color }: { color: ColorValue }) {
    return (
      <Text
        style={{
          // La etiqueta más chica de la app: 11 px es el piso, y en Inter
          // porque Cinzel a este tamaño pierde los remates y se vuelve ruido.
          fontFamily: fonts.sansSemiBold,
          fontSize: 11,
          letterSpacing: 0.4,
          color,
        }}
      >
        {title.toUpperCase()}
      </Text>
    );
  };
}

/**
 * 5 tabs: Resumen, Hoy, Rutinas, Nutrición, Biblioteca. Tab bar obsidiana,
 * borde sutil.
 *
 * La regla que las separa: **Hoy contesta "¿qué hago ahora?" y Resumen
 * contesta "¿voy bien?"**. Un dato que no cambia lo que haces en las próximas
 * horas no vive en Hoy; algo que se resuelve hoy y mañana ya no importa no
 * vive en Resumen. Sin esa frontera las dos pantallas se vuelven la misma.
 *
 * Check-in e Historial dejaron de ser tabs: el check-in se abre desde su
 * tarjeta en Resumen (y desde el recordatorio), y el historial es el detalle
 * al que se llega desde cada tarjeta de Resumen, no un destino en sí.
 *
 * La app abre en Hoy —`index`, el destino inicial del grupo— aunque Resumen
 * aparezca primero en la barra: al abrir la app lo que se quiere saber es qué
 * toca ahora, no cómo va el trimestre.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // Trigger 1 de la cola del modo gimnasio (apps/mobile/src/lib/training-sync.ts):
  // al montar la app ya con sesión, se intenta vaciar lo que haya quedado
  // pendiente de la última vez, y arranca el listener que reintenta solo al
  // recuperar señal (trigger 2). El trigger 3 — después de cada captura — vive
  // en la pantalla de Rutinas.
  useEffect(() => {
    const stopNetworkSync = startNetworkSync();
    void syncAndNotify();
    return stopNetworkSync;
  }, []);

  // Fase N5 — HealthKit directo: sync al montar con sesión y al volver a
  // primer plano. `autoSyncHealth()` ya trae su propio guardián (solo iOS,
  // solo si Salud está conectada, mínimo 6 h entre corridas), así que aquí
  // no hay que filtrar nada — nunca lanza al UI.
  useEffect(() => {
    void autoSyncHealth();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void autoSyncHealth();
    });
    return () => subscription.remove();
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
        name="resumen"
        options={{
          tabBarLabel: tabLabel("Resumen"),
          tabBarIcon: ({ color }) => <LayoutGrid size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: tabLabel("Hoy"),
          tabBarIcon: ({ color }) => <Sun size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="rutinas"
        options={{
          tabBarLabel: tabLabel("Rutinas"),
          tabBarIcon: ({ color }) => <Dumbbell size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          tabBarLabel: tabLabel("Nutrición"),
          tabBarIcon: ({ color }) => <Salad size={20} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="biblioteca"
        options={{
          tabBarLabel: tabLabel("Biblioteca"),
          tabBarIcon: ({ color }) => <LibraryBig size={20} color={color} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
