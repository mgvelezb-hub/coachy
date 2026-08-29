import { useRouter } from "expo-router";
import {
  Bike,
  Dumbbell,
  Footprints,
  Moon,
  Plus,
  Ruler,
  Settings,
  UtensilsCrossed,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ApiError,
  DISCIPLINE_LABELS,
  getActivities,
  getCheckins,
  getDecision,
  getHealthDays,
  getHistoryTraining,
  getMe,
  getNotifications,
  getNutrition,
  getTrainingToday,
  markNotificationsRead,
  type Activity,
  type CheckInRow,
  type Decision,
  type HealthDayPayload,
  type MeResponse,
  type Notification,
  type OtherSessionView,
  type TrainingTodayResponse,
  type NutritionResponse,
  type TodayCard,
} from "@/lib/api";
import { Card } from "@/components/Card";
import { Collapsible } from "@/components/Collapsible";
import { HeroCard } from "@/components/HeroCard";
import { ScoreCard } from "@/components/ScoreCard";
import { StatRow } from "@/components/StatRow";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import { bestStreak, currentStreak, todayISO, trainingDays } from "@/lib/streak";
import {
  fonts,
  radius,
  shadow,
  spacing,
  type as typeScale,
  withAlpha,
  type Palette,
} from "@/lib/theme";
import { formatMealItem, pickNextMeal, syncWidgetData } from "@/lib/widget";

/**
 * "Hoy" — la pantalla de lo que se hace en las próximas horas.
 *
 * La frontera con Resumen es dura: aquí solo entra lo que cambia lo que haces
 * HOY. Por eso no vive aquí la racha (no mueve nada de hoy), ni la lista de
 * súper, ni los menús completos de la semana, ni nada del check-in — todo eso
 * se resuelve en Nutrición o en Resumen. Lo que sí: la sesión de hoy, los
 * datos del reloj del día, la comida de hoy y lo que Coachy te diría ahorita.
 */

type HomeData = {
  me: MeResponse;
  decision: Decision | null;
  nutrition: NutritionResponse | null;
  today: TodayCard | null;
  /** La sesión de otra disciplina de hoy, si el día la trae (Fase 7). */
  todayOther: OtherSessionView | null;
  notifications: Notification[];
  /**
   * Racha de entrenamiento. No se pinta en Hoy —vive en Resumen y en el
   * widget—, pero se calcula aquí porque Hoy es la pantalla que siempre se
   * abre, y el widget se quedaría sin actualizar si dependiera de que alguien
   * entre a Resumen.
   */
  streak: number;
  healthDays: HealthDayPayload[];
  checkIns: CheckInRow[];
  activities: Activity[];
};

/** true si el error de API es "onboarding incompleto" (403): no es una falla real. */
function isOnboardingIncomplete(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** Minutos → "7 h 20 min". Sin dato → null. */
function formatSleep(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** El día del reloj más reciente que traiga ese campo (un día puede venir a medias). */
function latestWith(
  days: HealthDayPayload[],
  field: "steps" | "sleepMin",
): number | null {
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  for (const day of sorted) {
    const value = day[field];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export default function HoyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tocar esta pestaña estando en ella regresa el scroll hasta arriba.
  const scrollRef = useScrollTop();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [me, decisionRes, notificationsRes, nutrition, today, history, checkinsRes, healthRes, activitiesRes] =
        await Promise.all([
          getMe(),
          getDecision(),
          getNotifications(),
          getNutrition().catch((e) => (isOnboardingIncomplete(e) ? null : Promise.reject(e))),
          getTrainingToday().catch(
            (e): TrainingTodayResponse =>
              isOnboardingIncomplete(e)
                ? { today: null, otherSession: null }
                : (Promise.reject(e) as never),
          ),
          // Las fuentes de la racha son tolerantes a fallar por separado: un
          // endpoint caído no debe tumbar la pantalla de Hoy.
          getHistoryTraining().catch(() => null),
          getCheckins().catch(() => null),
          getHealthDays().catch(() => null),
          getActivities().catch(() => null),
        ]);

      const sources = {
        sessions: history?.sessions,
        activities: activitiesRes?.actividades,
      };
      const days = trainingDays(sources);
      const streak = currentStreak(days, todayISO());
      const todayCard = today?.today ?? null;

      setData({
        me,
        decision: decisionRes.decision,
        nutrition,
        today: todayCard,
        todayOther: today.otherSession ?? null,
        notifications: notificationsRes.notificaciones,
        streak,
        healthDays: healthRes?.dias ?? [],
        checkIns: checkinsRes?.checkIns ?? [],
        activities: activitiesRes?.actividades ?? [],
      });
      setError(null);

      try {
        const nextMeal = pickNextMeal(nutrition?.menus[0]?.meals ?? []);
        syncWidgetData({
          racha: streak,
          mejorRacha: bestStreak(days),
          hoyGrupo:
            todayCard?.muscleGroup ??
            (today.otherSession ? DISCIPLINE_LABELS[today.otherSession.discipline] : "Descanso"),
          hoyEjercicios: todayCard?.exerciseCount ?? null,
          hoyEsquema: todayCard?.schemeLabel ?? null,
          hoyHecho: todayCard?.completed ?? false,
          comidaLabel: nextMeal?.label ?? null,
          comidaHora: nextMeal?.timeHint ?? null,
          comidaItems: nextMeal ? nextMeal.items.slice(0, 3).map(formatMealItem) : null,
        });
      } catch {
        // Sincronizar el widget nunca debe tumbar la pantalla de Hoy.
      }
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
  const steps = latestWith(data.healthDays, "steps");
  const sleep = formatSleep(latestWith(data.healthDays, "sleepMin"));
  const lastCheckIn = [...data.checkIns].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>Hola, {firstName}</Text>
          {me.profile?.currentPhase && (
            <Text style={styles.phase}>{me.profile.currentPhase.replace(/_/g, " ")}</Text>
          )}
        </View>
        <Pressable onPress={() => router.push("/ajustes")} hitSlop={8} style={styles.settingsButton}>
          <Settings size={24} color={colors.paloRosa} strokeWidth={2} />
        </Pressable>
      </View>

      {visibleNotifications.map((notification) => (
        <NotificationBanner
          key={notification.id}
          notification={notification}
          onDismiss={() => dismissNotification(notification.id)}
        />
      ))}

      <TodayTrainingCard
        today={today}
        otherSession={data.todayOther}
        onPress={() => router.push("/rutinas")}
      />

      <View style={styles.stats}>
        <StatRow
          icon={Footprints}
          label="Actividad"
          value={steps === null ? "—" : steps.toLocaleString("es-MX")}
          unit={steps === null ? null : "pasos"}
          tint={colors.champan}
          onPress={() => router.push("/salud/pasos")}
        />
        <StatRow
          icon={Moon}
          label="Descanso"
          value={sleep ?? "—"}
          unit={null}
          tint={colors.paloRosa}
          onPress={() => router.push("/salud/descanso")}
        />
        <StatRow
          icon={Ruler}
          label="Cintura"
          value={lastCheckIn?.waistCm != null ? `${lastCheckIn.waistCm}` : "—"}
          unit={lastCheckIn?.waistCm != null ? "cm" : null}
          tint={colors.guindaLight}
          onPress={() => router.push("/salud/medidas")}
        />
      </View>

      <ComidaDeHoy nutrition={nutrition} />

      <ActivitiesCard
        activities={data.activities}
        onAdd={() => router.push("/actividad")}
      />

      <DecisionCard decision={decision} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

function TodayTrainingCard({
  today,
  otherSession,
  onPress,
}: {
  today: TodayCard | null;
  otherSession: OtherSessionView | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  // Un día sin pesas pero con alberca NO es descanso. Decirlo así mandaría a
  // descansar a quien tiene sesión programada.
  if (!today && otherSession) {
    const nombre = DISCIPLINE_LABELS[otherSession.discipline];
    return (
      <HeroCard
        eyebrow="Hoy toca"
        title={nombre}
        subtitle={
          otherSession.swim
            ? `${otherSession.swim.totalMeters} m · ${otherSession.swim.focus} · ${otherSession.minutes} min`
            : `${otherSession.minutes} min · tú eliges cómo la entrenas`
        }
        onPress={onPress}
      />
    );
  }

  if (!today) {
    return (
      <HeroCard
        eyebrow="Hoy"
        title="Descanso"
        subtitle="Sin sesión programada. Si te moviste por tu cuenta, regístralo abajo."
        colorsOverride={[colors.guindaDark, colors.obsidiana]}
      />
    );
  }

  return (
    <HeroCard
      eyebrow={today.completed ? "Hoy · hecho" : "Hoy toca"}
      title={today.muscleGroup}
      subtitle={`${today.exerciseCount} ejercicios · ${today.schemeLabel}${
        today.cardioMinutes ? ` · ${today.cardioMinutes} min cardio` : ""
      }${today.trimmedMinutes ? ` · recortada a ${today.trimmedMinutes} min` : ""}${
        otherSession ? ` · + ${DISCIPLINE_LABELS[otherSession.discipline].toLowerCase()}` : ""
      }`}
      onPress={onPress}
    />
  );
}

/**
 * Lo que se entrenó fuera del gym. Es el único lugar donde una sesión de bici,
 * box o alberca existe: el modo gimnasio solo sabe de pesas serie a serie.
 */
function ActivitiesCard({
  activities,
  onAdd,
}: {
  activities: Activity[];
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const recent = activities.slice(0, 4);

  return (
    <Card>
      <View style={styles.cardHeader}>
        <SectionLabel>Otras disciplinas</SectionLabel>
        <Pressable onPress={onAdd} hitSlop={8} style={styles.addButton}>
          <Plus size={18} color={colors.pergamino} strokeWidth={2.5} />
          <Text style={styles.addLabel}>Registrar</Text>
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <EmptyState message="Bici, box, alberca, funcional: lo que hagas fuera del gym se registra aquí y cuenta para tu racha." />
      ) : (
        <View style={styles.activityList}>
          {recent.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                {activity.discipline === "PESAS" ? (
                  <Dumbbell size={20} color={colors.champan} strokeWidth={2} />
                ) : (
                  <Bike size={20} color={colors.champan} strokeWidth={2} />
                )}
              </View>
              <View style={styles.activityText}>
                <Text style={styles.activityName}>{DISCIPLINE_LABELS[activity.discipline]}</Text>
                <Text style={styles.activityMeta}>
                  {activity.date} · {activity.durationMin} min
                  {activity.source === "HEALTHKIT" ? " · del reloj" : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function DecisionCard({ decision }: { decision: Decision | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    <HeroCard eyebrow={decision.phase.replace(/_/g, " ")} title={`${decision.kcal} kcal`} subtitle={decision.meta}>
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

      {decision.texto &&
        (longText ? (
          <Collapsible title="Mensaje de Coachy" onAccent>
            <Text style={styles.decisionText}>{decision.texto}</Text>
          </Collapsible>
        ) : (
          <Text style={styles.decisionText}>{decision.texto}</Text>
        ))}
    </HeroCard>
  );
}

/**
 * La comida de hoy. Un solo menú —el primero—, cerrado, con la siguiente
 * comida a la vista sin abrir.
 *
 * Los menús completos y la lista de súper se fueron a Nutrición: son
 * decisiones de semana, se miran al planear o al ir al mercado, no entre
 * series.
 */
function ComidaDeHoy({ nutrition }: { nutrition: NutritionResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const menu = nutrition?.menus[0] ?? null;

  if (!menu) {
    return (
      <Card>
        <SectionLabel>Tu comida de hoy</SectionLabel>
        <EmptyState message="Tu menú se sirve en cuanto tu coach publique tu decisión." />
      </Card>
    );
  }

  const siguiente = pickNextMeal(menu.meals);
  const resumen = siguiente
    ? `Sigue ${siguiente.label.toLowerCase()} · ${siguiente.timeHint}`
    : `${menu.meals.length} comidas hoy`;

  return (
    <ScoreCard
      icon={UtensilsCrossed}
      tint={colors.guindaLight}
      title="Tu comida de hoy"
      summary={resumen}
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
    </ScoreCard>
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
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  greeting: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
  },
  phase: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    letterSpacing: 1.2,
    color: colors.champan,
  },
  stats: {
    gap: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.champanSoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.marfil,
  },
  bannerBody: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
  },
  bannerClose: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.paloRosaLight,
    padding: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.guinda,
  },
  addLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    color: colors.pergamino,
  },
  activityList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.champan, 0.14),
  },
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityName: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.marfil,
  },
  activityMeta: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  macro: {
    gap: 2,
  },
  macroValue: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.pergamino,
  },
  macroLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.pergaminoSoft,
  },
  decisionText: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.pergamino,
    marginTop: spacing.md,
  },
  meal: {
    paddingVertical: spacing.sm,
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
});
