import { useRouter } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, DISCIPLINE_LABELS, getActivities, type Activity } from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * El zoom de "Otras disciplinas": todo lo entrenado fuera del gym, con el
 * registro a mano arriba.
 *
 * Es el único lugar donde una sesión de bici, box o alberca existe: el modo
 * gimnasio solo sabe de pesas serie a serie. Antes vivía como tarjeta con
 * lista larga directo en Hoy; ahora Hoy solo trae el resumen y este es el
 * detalle completo.
 */
export default function ActividadesRecientesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getActivities();
      setActivities(res.actividades);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tus actividades");
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

  if (!activities && !error) return <LoadingState label="Cargando tus actividades..." />;
  if (!activities && error) return <ErrorState message={error} onRetry={load} />;
  if (!activities) return null;

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

        <View style={styles.headerRow}>
          <Text style={styles.title}>Otras disciplinas</Text>
          <Pressable onPress={() => router.push("/actividad")} hitSlop={8} style={styles.addButton}>
            <Plus size={18} color={colors.pergamino} strokeWidth={2.5} />
            <Text style={styles.addLabel}>Registrar</Text>
          </Pressable>
        </View>

        {activities.length === 0 ? (
          <EmptyState message="Bici, box, alberca, funcional: lo que hagas fuera del gym se registra aquí y cuenta para tu racha." />
        ) : (
          <View style={styles.list}>
            {activities.map((activity) => {
              const Icono = iconoDe(activity.discipline);
              return (
                <View key={activity.id} style={styles.row}>
                  <View style={styles.icon}>
                    <Icono size={20} color={colors.champan} strokeWidth={2} />
                  </View>
                  <View style={styles.text}>
                    <Text style={styles.name}>{DISCIPLINE_LABELS[activity.discipline]}</Text>
                    <Text style={styles.meta}>
                      {activity.date} · {activity.durationMin} min
                      {activity.source === "HEALTHKIT" ? " · del reloj" : ""}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
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
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.guinda,
    },
    addLabel: { fontFamily: fonts.sansSemiBold, ...typeScale.label, color: colors.pergamino },
    list: { gap: spacing.md },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(colors.champan, 0.14),
    },
    text: { flex: 1, gap: 2 },
    name: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    meta: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  });
