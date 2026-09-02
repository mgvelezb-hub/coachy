import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, getDecision, type Decision } from "@/lib/api";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * El zoom de "Tu decisión": kcal, macros y el mensaje completo de Coachy.
 *
 * Antes vivía en Hoy como HeroCard, con el mensaje largo escondido en un
 * Collapsible que abría hacia abajo dentro de la misma pantalla. La LEY DE
 * DISEÑO prohíbe eso — nada se abre hacia abajo — así que Hoy ahora solo trae
 * el resumen en una línea (kcal · meta) y este es el detalle completo.
 */
export default function DecisionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // `undefined` = todavía no contestó el servidor; `null` = contestó y no hay
  // decisión publicada. Sin la distinción, un `null` inicial se leería igual
  // que "ya se sabe que no hay decisión" antes de que la llamada regrese.
  const [decision, setDecision] = useState<Decision | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getDecision();
      setDecision(res.decision);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu decisión");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (decision === undefined && !error) return <LoadingState label="Cargando tu decisión..." />;
  if (decision === undefined && error) return <ErrorState message={error} onRetry={load} />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Tu decisión</Text>

        {!decision ? (
          <EmptyState message="Tu coach todavía está armando tu siguiente decisión." />
        ) : (
          <>
            <Text style={styles.eyebrow}>{decision.phase.replace(/_/g, " ").toUpperCase()}</Text>
            <Text style={styles.kcal}>{decision.kcal} kcal</Text>
            {decision.meta && <Text style={styles.meta}>{decision.meta}</Text>}

            <View style={styles.macroRow}>
              <View style={styles.macro}>
                <Text style={styles.macroValue}>{decision.proteinG}g</Text>
                <Text style={styles.macroLabel}>Proteína</Text>
              </View>
              <View style={styles.macro}>
                <Text style={styles.macroValue}>{decision.carbsG}g</Text>
                <Text style={styles.macroLabel}>Carbos</Text>
              </View>
              <View style={styles.macro}>
                <Text style={styles.macroValue}>{decision.fatG}g</Text>
                <Text style={styles.macroLabel}>Grasas</Text>
              </View>
            </View>

            {decision.texto && (
              <View style={styles.mensaje}>
                <Text style={styles.mensajeTitulo}>Mensaje de Coachy</Text>
                <Text style={styles.mensajeTexto}>{decision.texto}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    title: {
      fontFamily: fonts.sansBold,
      ...typeScale.title,
      color: colors.marfil,
      marginBottom: spacing.sm,
    },
    eyebrow: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1.2,
      color: colors.champan,
    },
    kcal: {
      fontFamily: fonts.sansBold,
      ...typeScale.hero,
      color: colors.marfil,
      marginTop: spacing.xs,
    },
    meta: {
      fontFamily: fonts.sans,
      ...typeScale.body,
      color: colors.paloRosaLight,
      marginTop: spacing.xs,
    },
    macroRow: {
      flexDirection: "row",
      gap: spacing.xl,
      marginTop: spacing.lg,
    },
    macro: { gap: 2 },
    macroValue: {
      fontFamily: fonts.sansBold,
      ...typeScale.heading,
      color: colors.marfil,
    },
    macroLabel: {
      fontFamily: fonts.sansMedium,
      ...typeScale.label,
      color: colors.paloRosa,
    },
    mensaje: {
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
      gap: spacing.sm,
    },
    mensajeTitulo: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1.2,
      color: colors.paloRosa,
    },
    mensajeTexto: {
      fontFamily: fonts.sans,
      ...typeScale.body,
      color: colors.marfil,
    },
  });
