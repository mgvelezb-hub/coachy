import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";

import { paletteChampan, paletteDark, paletteLight, type Palette } from "@/lib/theme";

/**
 * Selector de tema (Fase de Ajustes): 3 paletas fijas + "sistema", que sigue
 * `useColorScheme()` de React Native en vivo (claro de día / oscuro de
 * noche, cambia solo cuando iOS cambia de apariencia).
 */
export type ThemePreference = "system" | "light" | "dark" | "champan";

const STORAGE_KEY = "holygains:theme";
const VALID_PREFERENCES: ThemePreference[] = ["system", "light", "dark", "champan"];

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && (VALID_PREFERENCES as string[]).includes(value);
}

type ThemeContextValue = {
  colors: Palette;
  /** La preferencia guardada — puede ser "system" aunque el tema resuelto ahora sea claro u oscuro. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolvePalette(preference: ThemePreference, systemScheme: ColorSchemeName): Palette {
  // `useColorScheme()` de React Native puede regresar "unspecified" (Android
  // viejo) además de "light"/"dark"/null — cualquier valor que no sea "light"
  // cae al oscuro, que es el default histórico de la app.
  const effective = preference === "system" ? (systemScheme === "light" ? "light" : "dark") : preference;
  if (effective === "light") return paletteLight;
  if (effective === "champan") return paletteChampan;
  return paletteDark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Arranca en "system" (el default) mientras se resuelve lo guardado en
  // AsyncStorage — no hay parpadeo real porque "system" ya es un tema válido
  // y renderizable de inmediato, solo puede corregirse una vez a lo que la
  // atleta haya elegido antes.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // Sin storage disponible: se queda en "system" el resto de la sesión.
      });
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // No se pudo persistir: la preferencia igual queda activa en memoria.
    });
  }

  const colors = useMemo(() => resolvePalette(preference, systemScheme), [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, preference, setPreference }),
    [colors, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
