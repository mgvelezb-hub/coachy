import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, getComidasLog, getNutrition, postComidaLog, type NutritionResponse } from "@/lib/api";
import { todayISO } from "@/lib/streak";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * El zoom de "Tu comida de hoy": el menú completo, con la confirmación de
 * cada comida.
 *
 * Antes vivía en Hoy como tarjeta desplegable —abría hacia abajo y empujaba
 * todo lo de debajo—. La LEY DE DISEÑO lo prohíbe: Hoy solo trae el resumen
 * en una línea (qué sigue y a qué hora) y aquí vive el detalle, con el mismo
 * botón de "la hice / no" de siempre.
 */
export default function ComidaHoyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [nutrition, setNutrition] = useState<NutritionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [registros, setRegistros] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [nutritionRes, comidasRes] = await Promise.all([
        getNutrition(),
        getComidasLog().catch(() => null),
      ]);
      setNutrition(nutritionRes);
      if (comidasRes) {
        const hoy = todayISO();
        setRegistros(
          Object.fromEntries(
            comidasRes.registros.filter((registro) => registro.date === hoy).map((registro) => [
              registro.slot,
              registro.taken,
            ]),
          ),
        );
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu comida de hoy");
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

  function confirmar(slot: string, taken: boolean) {
    setRegistros((previos) => ({ ...previos, [slot]: taken }));
    void postComidaLog({ date: todayISO(), slot, taken }).catch(() => {
      // Se reintenta la próxima vez que se toque: un error aquí no vale una
      // alerta a media comida.
    });
  }

  if (!nutrition && !error) return <LoadingState label="Cargando tu comida..." />;
  if (!nutrition && error) return <ErrorState message={error} onRetry={load} />;
  if (!nutrition) return null;

  const menu = nutrition.menus[0] ?? null;

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

        <Text style={styles.title}>Tu comida de hoy</Text>

        {!menu ? (
          <EmptyState message="Tu menú se sirve en cuanto tu coach publique tu decisión." />
        ) : (
          <View style={styles.lista}>
            {menu.meals.map((meal) => {
              const respuesta = registros[meal.slot];
              return (
                <View key={meal.slot} style={styles.meal}>
                  <Text style={styles.mealLabel}>
                    {meal.label} · {meal.timeHint}
                  </Text>
                  {meal.items.map((item) => (
                    <Text key={item.name} style={styles.mealItem}>
                      · {item.name} {item.free ? "(libre)" : `— ${item.grams} g`}
                    </Text>
                  ))}

                  {/* Dos botones y nada más: "la hice" o "no". Un deslizador de
                      porcentaje por comida sería precisión inventada. */}
                  <View style={styles.mealBotones}>
                    <Pressable
                      onPress={() => confirmar(meal.slot, true)}
                      style={[styles.mealBoton, respuesta === true && styles.mealBotonSi]}
                    >
                      <Text style={[styles.mealBotonTexto, respuesta === true && styles.mealBotonTextoOn]}>
                        La hice
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmar(meal.slot, false)}
                      style={[styles.mealBoton, respuesta === false && styles.mealBotonNo]}
                    >
                      <Text style={[styles.mealBotonTexto, respuesta === false && styles.mealBotonTextoOn]}>
                        No
                      </Text>
                    </Pressable>
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
    title: {
      fontFamily: fonts.sansBold,
      ...typeScale.title,
      color: colors.marfil,
      marginBottom: spacing.sm,
    },
    lista: { gap: spacing.lg },
    meal: {
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
      gap: 2,
    },
    mealLabel: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.bodySm,
      color: colors.paloRosa,
      marginBottom: 2,
    },
    mealItem: {
      fontFamily: fonts.sans,
      ...typeScale.body,
      color: colors.marfil,
    },
    mealBotones: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    mealBoton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    mealBotonSi: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    mealBotonNo: { backgroundColor: withAlpha(colors.error, 0.7), borderColor: colors.error },
    mealBotonTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    mealBotonTextoOn: { color: colors.pergamino, fontFamily: fonts.sansSemiBold },
  });
