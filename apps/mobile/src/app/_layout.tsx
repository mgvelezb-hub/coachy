import { Cinzel_500Medium, Cinzel_600SemiBold } from "@expo-google-fonts/cinzel";
import { CormorantGaramond_500Medium_Italic } from "@expo-google-fonts/cormorant-garamond";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OpeningSequence } from "@/components/OpeningSequence";
import { SessionProvider, useSession } from "@/context/session";
import { ThemeProvider, useTheme } from "@/context/theme";
import { paletteLight } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Puede fallar si ya se ocultó (fast refresh); no es un error real.
});

function RootNavigator() {
  const { session, loading } = useSession();
  const { colors } = useTheme();

  if (loading) return null;

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
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="objetivo" />
        <Stack.Screen name="ajustes" />
        <Stack.Screen name="resumen" />
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
