import { Tabs } from "expo-router";
import { LayoutGrid, LibraryBig, Salad, Sun } from "lucide-react-native";

import { FiguraEntrenando } from "@/components/iconos/Disciplinas";
import { useEffect } from "react";
import { AppState, Text, useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/theme";
import { autoSyncHealth } from "@/lib/health";
import { fonts } from "@/lib/theme";
import { startNetworkSync, syncAndNotify } from "@/lib/training-sync";

/**
 * Etiqueta de pestaña.
 *
 * Con cinco pestañas, "Biblioteca" y "Nutrición" son las que no perdonan: a
 * 11 px en un iPhone chico se cortan a media palabra. Por eso el tamaño se
 * mide contra el ancho real de la pantalla y baja un punto en los equipos
 * angostos, el tracking es casi cero, y `allowFontScaling` va apagado — con
 * el texto del sistema en grande, una etiqueta de tab no debe crecer hasta
 * partirse; para leer mejor está el contenido, no la barra.
 */
function tabLabel(title: string) {
  return function Label({ color }: { color: ColorValue }) {
    const { width } = useWindowDimensions();

    return (
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          // 11 px es el piso cómodo; abajo de 390 pt de ancho (iPhone 13 mini,
          // SE) se baja a 10 para que "Biblioteca" quepa completa.
          fontFamily: fonts.sansSemiBold,
          fontSize: width < 390 ? 10 : 11,
          letterSpacing: 0.2,
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
        // Sin esto cada pestaña reserva su padding por default y las cinco
        // etiquetas se quedan sin ancho para el texto.
        tabBarItemStyle: { paddingHorizontal: 2 },
        tabBarIconStyle: { marginBottom: -2 },
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
          // Una figura entrenando y no una mancuerna: en esta pestaña también
          // viven natación, box y squash desde que hay multi-disciplina.
          tabBarIcon: ({ color }) => <FiguraEntrenando size={22} color={color} strokeWidth={1.75} />,
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
