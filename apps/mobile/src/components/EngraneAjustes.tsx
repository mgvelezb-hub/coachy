import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/context/theme";
import { spacing } from "@/lib/theme";
import type { Seccion } from "@/app/ajustes/[seccion]";

/**
 * Engrane de configuración, contextual por pestaña.
 *
 * Antes las cinco pestañas —cuando tenían engrane— mandaban todas a
 * `/ajustes`, la lista completa de nueve secciones: para cambiar algo de tu
 * entrenamiento desde Rutinas había que buscarlo entre check-in, teléfono,
 * reloj... Ahora cada pestaña sabe qué ajuste le pertenece y salta
 * directo a esa hoja (`/ajustes/${seccion}`), sin pasar por el índice.
 * Resumen es la única sin dueño claro — "voy bien en general", no en un
 * tema— así que es la única que sigue abriendo el índice completo.
 */
export function EngraneAjustes({ seccion }: { seccion?: Seccion }) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.push(seccion ? `/ajustes/${seccion}` : "/ajustes")}
      hitSlop={8}
      style={styles.boton}
    >
      <Settings size={24} color={colors.paloRosa} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: { padding: spacing.xs },
});
