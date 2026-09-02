import { Cinzel_500Medium, Cinzel_600SemiBold } from "@expo-google-fonts/cinzel";
import { CormorantGaramond_500Medium_Italic } from "@expo-google-fonts/cormorant-garamond";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OpeningSequence } from "@/components/OpeningSequence";
import { SessionProvider, useSession } from "@/context/session";
import { ThemeProvider, useTheme } from "@/context/theme";
import { drenarComidas, responderComida } from "@/lib/comidas-pendientes";
import {
  ACCION_COMIDA_DESPUES,
  ACCION_COMIDA_NO,
  ACCION_COMIDA_SI,
  posponerComida,
  registrarAccionesDeComida,
} from "@/lib/recordatorio";
import { paletteLight } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Puede fallar si ya se ocultó (fast refresh); no es un error real.
});

/** Hoy en local, que es la fecha con la que se registra una comida. */
function hoyISO(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${String(ahora.getDate()).padStart(2, "0")}`;
}

/**
 * Qué pasa cuando se contesta una notificación.
 *
 * Dos caminos distintos y no conviene confundirlos:
 *
 * - **Con botón** (Sí / No / En 30 min, incluido desde el Apple Watch): se
 *   registra la respuesta y la app NO se abre. Abrirla para contestar un sí o
 *   un no es justo la fricción que los botones quitan.
 * - **Tocando el aviso**: se abre la ruta que traiga en `data.ruta`. Es el
 *   único contrato entre esta pantalla y `lib/recordatorio.ts`.
 *
 * Se escucha en la raíz porque la respuesta puede llegar con cualquier pestaña
 * abierta —y también con la app cerrada, en cuyo caso iOS la entrega en cuanto
 * arranca—.
 */
function useResponderNotificacion() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((respuesta) => {
      const contenido = respuesta.notification.request.content;
      const slot = contenido.data?.comidaSlot;
      const accion = respuesta.actionIdentifier;

      if (typeof slot === "string") {
        if (accion === ACCION_COMIDA_SI || accion === ACCION_COMIDA_NO) {
          void responderComida({
            date: hoyISO(),
            slot,
            taken: accion === ACCION_COMIDA_SI,
          });
          return;
        }
        if (accion === ACCION_COMIDA_DESPUES) {
          void posponerComida(slot);
          return;
        }
      }

      const ruta = contenido.data?.ruta;
      if (typeof ruta === "string" && ruta.startsWith("/")) router.push(ruta as never);
    });
    return () => sub.remove();
  }, []);
}

/**
 * Lo que se contestó sin señal sale en cuanto la hay.
 *
 * Al abrir y al volver del segundo plano: contestar desde la muñeca en un
 * sótano y que la respuesta se quede ahí para siempre sería peor que no haber
 * preguntado.
 */
function useDrenarComidas() {
  useEffect(() => {
    // Los botones se registran al arrancar y no solo al programar las
    // comidas: los avisos que ya estaban puestos por una versión anterior
    // apuntan a esta categoría, y sin registrarla llegarían pelones.
    void registrarAccionesDeComida();
    void drenarComidas();
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void drenarComidas();
    });
    return () => sub.remove();
  }, []);
}

function RootNavigator() {
  useResponderNotificacion();
  useDrenarComidas();
  const { session, loading, onboarded } = useSession();
  const { colors } = useTheme();

  // Con sesión y `onboarded` todavía en `null` (el `GET /me` de
  // `refreshOnboarded` no ha vuelto) se espera aquí en vez de decidir: es lo
  // mismo que ya hacía `loading` con la sesión, y evita el parpadeo de
  // (tabs) → /onboarding en cuanto esa consulta sí contesta.
  if (loading || (session && onboarded === null)) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Cada pantalla del Stack pinta su propio fondo por encima del View
        // raíz — sin esto, el default del sistema (claro) tapa el fondo del
        // tema activo.
        contentStyle: { backgroundColor: colors.obsidiana },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      {/* Cuenta creada pero sin cuestionario: la única ruta disponible es el
          onboarding nativo. Antes de esto, quien entraba desde el teléfono
          se topaba con el 403 "onboarding incompleto" de cualquier endpoint
          que lo exigiera y no tenía cómo completarlo sin un navegador. */}
      <Stack.Protected guard={Boolean(session) && onboarded === false}>
        <Stack.Screen name="onboarding/index" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && onboarded !== false}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="objetivo" />
        <Stack.Screen name="ajustes/index" />
        <Stack.Screen name="ajustes/[seccion]" />
        <Stack.Screen name="checkin" />
        <Stack.Screen name="historial" />
        <Stack.Screen name="fotos" />
        <Stack.Screen name="glidepath" />
        <Stack.Screen name="actividad" options={{ presentation: "modal" }} />
        <Stack.Screen name="salud/[metrica]" />
      </Stack.Protected>
    </Stack>
  );
}

/** Fondo raíz + barra de estado, reactivos al tema activo. */
function AppShell() {
  const { colors } = useTheme();
  // Claro → texto de la barra oscuro; Oscuro/Champán → texto claro. Se compara
  // por referencia porque `resolvePalette` siempre regresa uno de los 3
  // objetos exportados de theme.ts, nunca una copia.
  const barStyle = colors === paletteLight ? "dark" : "light";

  return (
    <View style={[styles.background, { backgroundColor: colors.obsidiana }]}>
      <StatusBar style={barStyle} />
      <RootNavigator />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Cinzel_500Medium,
    Cinzel_600SemiBold,
    CormorantGaramond_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [opened, setOpened] = useState(false);

  const ready = fontsLoaded || Boolean(fontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </ThemeProvider>
      {/* Encima de todo y en el nivel más alto: la app se monta y hace su
          primer fetch detrás de la apertura, así que cuando el guinda se va la
          pantalla de Hoy ya está lista en vez de aparecer vacía. */}
      {!opened && <OpeningSequence onDone={() => setOpened(true)} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
});
