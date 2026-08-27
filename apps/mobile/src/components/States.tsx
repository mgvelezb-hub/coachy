import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette } from "@/lib/theme";

/** Loading de pantalla completa: ActivityIndicator paloRosa sobre el fondo del tema. */
export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.paloRosa} size="large" />
      {label && <Text style={styles.loadingLabel}>{label}</Text>}
    </View>
  );
}

/** Error de red con botón de reintentar. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Algo no cargó</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryLabel}>REINTENTAR</Text>
      </Pressable>
    </View>
  );
}

/** Estado vacío con mensaje cálido en Cormorant itálica. */
export function EmptyState({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  loadingLabel: {
    fontFamily: fonts.sans,
    color: colors.paloRosaLight,
    fontSize: 13,
  },
  errorTitle: {
    fontFamily: fonts.display,
    color: colors.marfil,
    fontSize: 16,
    letterSpacing: 1,
  },
  errorMessage: {
    fontFamily: fonts.sans,
    color: colors.paloRosaLight,
    fontSize: 13,
    textAlign: "center",
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.guinda,
  },
  retryLabel: {
    fontFamily: fonts.display,
    // pergamino: rol "texto sobre fondo de acento" (aquí guinda).
    color: colors.pergamino,
    fontSize: 11,
    letterSpacing: 2,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyMessage: {
    fontFamily: fonts.serifItalic,
    color: colors.paloRosaLight,
    fontSize: 16,
    textAlign: "center",
  },
});
