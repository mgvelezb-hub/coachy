import { Flame, ShoppingBasket, UtensilsCrossed } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScoreCard } from "@/components/ScoreCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import { ApiError, getNutrition, type Menu, type NutritionResponse } from "@/lib/api";
import { fonts, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * Nutrición — todo lo de comer que NO es de hoy.
 *
 * Hoy se queda con la comida del día (qué toca y a qué hora); aquí viven los
 * menús completos, las equivalencias y la lista de súper, que son decisiones
 * de semana: se miran cuando se planea o se va al mercado, no entre series.
 *
 * Fase 1 mueve de casa lo que ya existía en Hoy. El tipo de dieta, sus
 * beneficios, los platillos por tiempo de preparación y el porqué de cada
 * alimento entran en la fase de Nutrición, no aquí.
 */

/** true si el error de API es "onboarding incompleto" (403): no es una falla real. */
function isOnboardingIncomplete(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export default function NutricionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tocar esta pestaña estando en ella regresa el scroll hasta arriba.
  const scrollRef = useScrollTop();
  const [data, setData] = useState<NutritionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const nutrition = await getNutrition().catch((e) =>
        isOnboardingIncomplete(e) ? null : Promise.reject(e),
      );
      setData(nutrition ?? { decision: null, menus: [], groceries: [], materialized: false });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu alimentación");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data && !error) return <LoadingState label="Cargando tu alimentación..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { decision, menus, groceries } = data;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
      }
    >
      <Text style={styles.titulo}>Nutrición</Text>

      <ScoreCard
        icon={Flame}
        tint={colors.champan}
        title="Tu plan"
        summary={
          decision
            ? `${decision.kcal} kcal · P ${decision.proteinG} · C ${decision.carbsG} · G ${decision.fatG}`
            : "Sin plan publicado todavía"
        }
        status={decision ? { label: decision.phase.replace(/_/g, " "), tone: "ok" } : null}
      >
        {decision ? (
          <View style={styles.macros}>
            <Macro label="Proteína" valor={`${decision.proteinG} g`} />
            <Macro label="Carbohidratos" valor={`${decision.carbsG} g`} />
            <Macro label="Grasas" valor={`${decision.fatG} g`} />
          </View>
        ) : (
          <EmptyState message="En cuanto tu coach publique tu decisión, aquí aparecen tus números." />
        )}
      </ScoreCard>

      {menus.map((menu) => (
        <MenuCard key={menu.menuNumber} menu={menu} />
      ))}

      <ScoreCard
        icon={ShoppingBasket}
        tint={colors.paloRosa}
        title="Lista de súper"
        summary={
          groceries.length === 0
            ? "Se arma sola con tus menús"
            : `${groceries.length} ${groceries.length === 1 ? "artículo" : "artículos"} para la semana`
        }
      >
        {groceries.length === 0 ? (
          <EmptyState message="Cuando tengas menús publicados, la lista se arma sola." />
        ) : (
          groceries.map((item) => (
            <Text key={item.name} style={styles.item}>
              · {item.name} — {item.grams} {item.unit}
            </Text>
          ))
        )}
      </ScoreCard>
    </ScrollView>
  );
}

function MenuCard({ menu }: { menu: Menu }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const primera = menu.meals[0];
  const resumen =
    menu.meals.length === 0
      ? "Sin comidas"
      : `${menu.meals.length} comidas · empieza ${primera?.timeHint ?? ""}`.trim();

  return (
    <ScoreCard
      icon={UtensilsCrossed}
      tint={colors.guindaLight}
      title={`Menú ${menu.menuNumber}`}
      summary={resumen}
    >
      {menu.meals.map((meal) => (
        <View key={meal.slot} style={styles.meal}>
          <Text style={styles.mealLabel}>
            {meal.label} · {meal.timeHint}
          </Text>
          {meal.items.map((item) => (
            <Text key={item.name} style={styles.item}>
              · {item.name} {item.free ? "(libre)" : `— ${item.grams} g`}
            </Text>
          ))}
          {meal.equivalences.map((equivalencia) => (
            <Text key={equivalencia.forName} style={styles.equivalencia}>
              {equivalencia.forName} se puede cambiar por{" "}
              {equivalencia.options.map((option) => `${option.name} (${option.grams} g)`).join(", ")}
            </Text>
          ))}
        </View>
      ))}
    </ScoreCard>
  );
}

function Macro({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValor}>{valor}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  titulo: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
    marginBottom: spacing.xs,
  },
  macros: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  macro: {
    gap: 2,
  },
  macroValor: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.marfil,
  },
  macroLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.paloRosa,
  },
  meal: {
    gap: 2,
  },
  mealLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    marginBottom: 2,
  },
  item: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
  },
  equivalencia: {
    fontFamily: fonts.serifItalic,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.xs,
  },
});
