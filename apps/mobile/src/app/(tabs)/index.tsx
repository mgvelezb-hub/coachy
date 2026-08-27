import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ApiError,
  getDecision,
  getMe,
  getNotifications,
  getNutrition,
  getTrainingToday,
  markNotificationsRead,
  type Decision,
  type MeResponse,
  type Notification,
  type NutritionResponse,
  type TodayCard,
} from "@/lib/api";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Collapsible } from "@/components/Collapsible";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { colors, fonts, radius, spacing } from "@/lib/theme";

type HomeData = {
  me: MeResponse;
  decision: Decision | null;
  nutrition: NutritionResponse | null;
  today: TodayCard | null;
  notifications: Notification[];
};

/** true si el error de API es "onboarding incompleto" (403): no es una falla real. */
function isOnboardingIncomplete(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export default function HoyScreen() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [me, decisionRes, notificationsRes, nutrition, today] = await Promise.all([
        getMe(),
        getDecision(),
        getNotifications(),
        getNutrition().catch((e) => (isOnboardingIncomplete(e) ? null : Promise.reject(e))),
        getTrainingToday().catch((e) =>
          isOnboardingIncomplete(e) ? { today: null } : Promise.reject(e),
        ),
      ]);

      setData({
        me,
        decision: decisionRes.decision,
        nutrition,
        today: today?.today ?? null,
        notifications: notificationsRes.notificaciones,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu información");
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

  async function dismissNotification(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    try {
      await markNotificationsRead([id]);
    } catch {
      // Si falla la marca en el servidor no revertimos: la app ya la ocultó
      // localmente y la próxima carga la trae de vuelta si de verdad no se marcó.
    }
  }

  if (!data && !error) return <LoadingState label="Cargando tu día..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { me, decision, nutrition, today, notifications } = data;
  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id));
  const firstName = me.profile?.displayName ?? "atleta";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hola, {firstName}</Text>
        {me.profile?.currentPhase && (
          <SectionLabel color={colors.champan}>{me.profile.currentPhase}</SectionLabel>
        )}
      </View>

      {visibleNotifications.map((notification) => (
        <NotificationBanner
          key={notification.id}
          notification={notification}
          onDismiss={() => dismissNotification(notification.id)}
        />
      ))}

      <DecisionCard decision={decision} />

      <NutritionCard nutrition={nutrition} />

      <TodayTrainingCard today={today} onPress={() => router.push("/gym")} />
    </ScrollView>
  );
}

function NotificationBanner({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{notification.title}</Text>
        <Text style={styles.bannerBody}>{notification.body}</Text>
      </View>
      <Text onPress={onDismiss} style={styles.bannerClose} suppressHighlighting>
        ✕
      </Text>
    </View>
  );
}

function DecisionCard({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return (
      <Card>
        <SectionLabel>Tu decisión</SectionLabel>
        <EmptyState message="Tu coach todavía está armando tu siguiente decisión." />
      </Card>
    );
  }

  const longText = (decision.texto?.length ?? 0) > 220;

  return (
    <Card highlighted>
      <SectionLabel color={colors.paloRosa}>{decision.phase}</SectionLabel>

      <View style={styles.macroRow}>
        <Chip label={`${decision.kcal} kcal`} selected />
        <Chip label={`P ${decision.proteinG}g`} />
        <Chip label={`C ${decision.carbsG}g`} />
        <Chip label={`G ${decision.fatG}g`} />
      </View>

      {decision.meta && (
        <Text style={styles.decisionMeta}>{decision.meta}</Text>
      )}

      {decision.texto &&
        (longText ? (
          <Collapsible title="Mensaje de Coachy">
            <Text style={styles.decisionText}>{decision.texto}</Text>
          </Collapsible>
        ) : (
          <Text style={styles.decisionText}>{decision.texto}</Text>
        ))}
    </Card>
  );
}

function NutritionCard({ nutrition }: { nutrition: NutritionResponse | null }) {
  if (!nutrition || nutrition.menus.length === 0) {
    return (
      <Card>
        <SectionLabel>Tu alimentación</SectionLabel>
        <EmptyState message="Tu menú se sirve en cuanto tu coach publique tu decisión." />
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>Tu alimentación</SectionLabel>
      <View style={{ marginTop: spacing.sm }}>
        {nutrition.menus.map((menu, index) => (
          <Collapsible
            key={menu.menuNumber}
            title={`Menú ${menu.menuNumber}`}
            defaultOpen={index === 0}
          >
            {menu.meals.map((meal) => (
              <View key={meal.slot} style={styles.meal}>
                <Text style={styles.mealLabel}>
                  {meal.label} · {meal.timeHint}
                </Text>
                {meal.items.map((item) => (
                  <Text key={item.name} style={styles.mealItem}>
                    · {item.name} {item.free ? "(libre)" : `— ${item.grams} g`}
                  </Text>
                ))}
              </View>
            ))}
          </Collapsible>
        ))}

        {nutrition.groceries.length > 0 && (
          <Collapsible title="Lista de súper" subtitle={`${nutrition.groceries.length} artículos`}>
            {nutrition.groceries.map((item) => (
              <Text key={item.name} style={styles.mealItem}>
                · {item.name} — {item.grams} {item.unit}
              </Text>
            ))}
          </Collapsible>
        )}
      </View>
    </Card>
  );
}

function TodayTrainingCard({ today, onPress }: { today: TodayCard | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.trainingHeader}>
          <SectionLabel>Hoy toca</SectionLabel>
          {today?.completed && <Chip label="Hecho" tone="champan" selected />}
        </View>

        {today ? (
          <View style={styles.trainingBody}>
            <Text style={styles.trainingGroup}>{today.muscleGroup}</Text>
            <Text style={styles.trainingMeta}>
              {today.exerciseCount} ejercicios · {today.schemeLabel}
              {today.cardioMinutes ? ` · ${today.cardioMinutes} min cardio` : ""}
            </Text>
          </View>
        ) : (
          <EmptyState message="Hoy toca descanso. Aprovecha para recuperar." />
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  greeting: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.marfil,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.champanSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.marfil,
  },
  bannerBody: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.paloRosaLight,
  },
  bannerClose: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.paloRosaLight,
    padding: spacing.xs,
  },
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  decisionMeta: {
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    color: colors.champan,
    marginTop: spacing.lg,
  },
  decisionText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.marfil,
    marginTop: spacing.md,
  },
  meal: {
    paddingVertical: spacing.sm,
    gap: 2,
  },
  mealLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.paloRosa,
    marginBottom: 2,
  },
  mealItem: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.marfil,
  },
  trainingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trainingBody: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  trainingGroup: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.marfil,
  },
  trainingMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.paloRosaLight,
  },
});
