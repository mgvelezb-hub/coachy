import { useRouter } from "expo-router";
import { Flame } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { WaistChart } from "@/components/WaistChart";
import { useTheme } from "@/context/theme";
import {
  DISCIPLINE_LABELS,
  getActivities,
  getCheckins,
  getDecision,
  getGoal,
  getHealthDays,
  getHistoryMeasurements,
  getHistoryTraining,
  getTrainingWeek,
  type Activity,
  type CheckInPoint,
  type CheckInRow,
  type Decision,
  type GoalResponse,
  type HealthDayPayload,
  type PersonalRecord,
  type TrainingHistoryRow,
  type WeekView,
} from "@/lib/api";
import { activeDays, bestStreak, currentStreak, streakMessage, todayISO } from "@/lib/streak";
import { fonts, radius, spacing, withAlpha, type Palette } from "@/lib/theme";
import { syncWidgetData } from "@/lib/widget";

/**
 * "Tu resumen" — pantalla empujada (fuera de tabs), gancho diario de
 * engagement. Todo lo que pinta ya sale de endpoints que existen para otras
 * pantallas (cero contratos nuevos): la racha se calcula en el cliente
 * (`src/lib/streak.ts`, puro), todo lo demás solo se transporta tal cual lo
 * manda el backend — ningún número de salud se reinterpreta aquí.
 */

const CHART_POINTS = 12;

type ResumenData = {
  sessions: TrainingHistoryRow[] | null;
  records: PersonalRecord[] | null;
  checkIns: CheckInRow[] | null;
  healthDays: HealthDayPayload[] | null;
  activities: Activity[] | null;
  measurementPoints: CheckInPoint[] | null;
  week: WeekView | null;
  goal: GoalResponse | null;
  decision: Decision | null;
};

/** Cada fuente se tolera por separado: que una falle no tumba la pantalla entera. */
async function safeFetch<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Minutos → "7 h 32 min" (o solo la unidad que aplique). */
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** yyyy-MM-dd → "26 de agosto", forzando UTC para no correr el día por el huso local. */
function formatDateEs(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** Diferencia `current - prior` redondeada a 1 decimal, o null si falta alguno. */
function delta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return Math.round((current - prior) * 10) / 10;
}

export default function ResumenScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<ResumenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [historyRes, checkinsRes, healthRes, activitiesRes, measurementsRes, week, goal, decisionRes] =
      await Promise.all([
        safeFetch(getHistoryTraining()),
        safeFetch(getCheckins()),
        safeFetch(getHealthDays()),
        safeFetch(getActivities()),
        safeFetch(getHistoryMeasurements()),
        safeFetch(getTrainingWeek()),
        safeFetch(getGoal()),
        safeFetch(getDecision()),
      ]);

    const next: ResumenData = {
      sessions: historyRes?.sessions ?? null,
      records: historyRes?.records ?? null,
      checkIns: checkinsRes?.checkIns ?? null,
      healthDays: healthRes?.dias ?? null,
      activities: activitiesRes?.actividades ?? null,
      measurementPoints: measurementsRes?.points ?? null,
      week,
      goal,
      decision: decisionRes?.decision ?? null,
    };

    const nothingLoaded = Object.values(next).every((value) => value === null);
    if (nothingLoaded) {
      // No se toca `data`: si ya había algo bueno de una carga previa, se
      // queda visible; solo se prende el error de pantalla completa cuando
      // nunca hubo nada que mostrar.
      setError("No se pudo cargar tu resumen. Revisa tu conexión.");
      return;
    }

    setData(next);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync parcial del widget: /resumen solo trae racha/mejor racha (no
  // entrenamiento ni comida), así que deja esos otros campos tal cual los
  // haya dejado Hoy — ver el contrato undefined/null en `src/lib/widget.ts`.
  useEffect(() => {
    if (!data) return;
    try {
      const widgetDays = activeDays({
        sessions: data.sessions ?? undefined,
        checkIns: data.checkIns ?? undefined,
        healthDays: data.healthDays ?? undefined,
        activities: data.activities ?? undefined,
      });
      syncWidgetData({
        racha: currentStreak(widgetDays, todayISO()),
        mejorRacha: bestStreak(widgetDays),
      });
    } catch {
      // Sincronizar el widget nunca debe tumbar la pantalla de resumen.
    }
  }, [data]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data && !error) return <LoadingState label="Cargando tu resumen..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const days = activeDays({
    sessions: data.sessions ?? undefined,
    checkIns: data.checkIns ?? undefined,
    healthDays: data.healthDays ?? undefined,
    activities: data.activities ?? undefined,
  });
  const streak = currentStreak(days, todayISO());
  const best = bestStreak(days);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />}
      >
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
          <Text style={styles.backText}>← Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Tu resumen</Text>

        <StreakCard streak={streak} best={best} />
        <ClockSection healthDays={data.healthDays} />
        <TrainingSection week={data.week} records={data.records} activities={data.activities} />
        <ProgressSection checkIns={data.checkIns} points={data.measurementPoints} />
        <GoalSection goal={data.goal} />
        <PlanCard decision={data.decision} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StreakCard({ streak, best }: { streak: number; best: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card highlighted>
      <View style={styles.streakHeader}>
        <Flame size={22} color={colors.pergamino} strokeWidth={1.75} />
        <SectionLabel color={colors.pergaminoSoft}>Tu racha</SectionLabel>
      </View>

      <Text style={styles.streakBig}>{streak}</Text>
      <Text style={styles.streakBigLabel}>{streak === 1 ? "día seguido" : "días seguidos"}</Text>

      {best > streak && <Text style={styles.streakBest}>Tu mejor racha: {best} días</Text>}

      <Text style={styles.streakMessage}>{streakMessage(streak)}</Text>
    </Card>
  );
}

function ClockSection({ healthDays }: { healthDays: HealthDayPayload[] | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const days = healthDays?.slice(0, 7) ?? [];

  if (days.length === 0) {
    return (
      <Card>
        <SectionLabel>Tu reloj</SectionLabel>
        <EmptyState message="Conecta tu Apple Salud para ver tus pasos y tu sueño aquí." />
        <Pressable onPress={() => router.push("/ajustes")} style={styles.inlineLink} hitSlop={8}>
          <Text style={styles.inlineLinkText}>Conectar en Ajustes →</Text>
        </Pressable>
      </Card>
    );
  }

  const stepsValues = days
    .map((day) => day.steps)
    .filter((value): value is number => value !== null && value !== undefined);
  const sleepValues = days
    .map((day) => day.sleepMin)
    .filter((value): value is number => value !== null && value !== undefined);

  const avgSteps = stepsValues.length > 0 ? Math.round(average(stepsValues)) : null;
  const avgSleep = sleepValues.length > 0 ? Math.round(average(sleepValues)) : null;
  const lastDay = days[0]!;

  return (
    <Card>
      <SectionLabel>Tu reloj</SectionLabel>
      <View style={styles.clockRow}>
        <ClockStat label="Pasos / día" value={avgSteps !== null ? avgSteps.toLocaleString("es-MX") : "—"} />
        <ClockStat label="Sueño / noche" value={avgSleep !== null ? formatDuration(avgSleep) : "—"} />
      </View>
      <Text style={styles.clockCaption}>Último dato: {formatDateEs(lastDay.date)}</Text>
    </Card>
  );
}

function ClockStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.clockStat}>
      <Text style={styles.clockStatValue}>{value}</Text>
      <SectionLabel color={colors.paloRosaLight}>{label}</SectionLabel>
    </View>
  );
}

function TrainingSection({
  week,
  records,
  activities,
}: {
  week: WeekView | null;
  records: PersonalRecord[] | null;
  activities: Activity[] | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const totalSessions = week?.sessions.length ?? 0;
  const completedSessions = week?.sessions.filter((session) => session.completedAt !== null).length ?? 0;

  // `personalRecordList` (apps/web/src/lib/training/view.ts) llega ordenado
  // por peso, no por fecha — se reordena aquí por `date` desc para "los 3
  // PRs MÁS RECIENTES" que pide la pantalla.
  const recentPRs = [...(records ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  // `getActivities()` ya llega ordenado por `startedAt` desc. PESAS no entra
  // aquí porque ya tiene su propio bloque (sesiones de la semana + PRs).
  const recentWatchActivities = (activities ?? []).filter((activity) => activity.discipline !== "PESAS").slice(0, 3);

  return (
    <Card>
      <SectionLabel>Entrenamiento</SectionLabel>

      {week ? (
        <Text style={styles.trainingWeekLine}>
          {completedSessions} de {totalSessions}{" "}
          {totalSessions === 1 ? "sesión completada" : "sesiones completadas"} esta semana
        </Text>
      ) : (
        <EmptyState message="Tu semana de gym aparece aquí en cuanto tengas rutina activa." />
      )}

      {recentPRs.length > 0 && (
        <View style={styles.prList}>
          <SectionLabel color={colors.champan}>PRs recientes</SectionLabel>
          {recentPRs.map((record) => (
            <View key={`${record.exerciseName}-${record.date}`} style={styles.prRow}>
              <Text style={styles.prName}>{record.exerciseName}</Text>
              <Text style={styles.prValue}>
                {record.weightKg} kg × {record.reps}
              </Text>
            </View>
          ))}
        </View>
      )}

      {recentWatchActivities.length > 0 && (
        <View style={styles.prList}>
          <SectionLabel color={colors.paloRosa}>Desde tu reloj</SectionLabel>
          {recentWatchActivities.map((activity) => (
            <View key={activity.id} style={styles.prRow}>
              <Text style={styles.prName}>{DISCIPLINE_LABELS[activity.discipline]}</Text>
              <Text style={styles.prValue}>
                {formatDuration(activity.durationMin)}
                {formatActivityExtra(activity) ? ` · ${formatActivityExtra(activity)}` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** Distancia si hay (en km si es >= 1000 m), si no kcal si hay, si no nada. */
function formatActivityExtra(activity: Activity): string | null {
  if (activity.distanceM != null) {
    return activity.distanceM >= 1000
      ? `${(activity.distanceM / 1000).toFixed(1)} km`
      : `${activity.distanceM} m`;
  }
  if (activity.activeKcal != null) return `${activity.activeKcal} kcal`;
  return null;
}

function ProgressSection({
  checkIns,
  points,
}: {
  checkIns: CheckInRow[] | null;
  points: CheckInPoint[] | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const list = checkIns ?? [];
  if (list.length === 0) {
    return (
      <Card>
        <SectionLabel color={colors.champan}>Tu avance</SectionLabel>
        <EmptyState message="Aún no tienes check-ins. El primero arranca tu historial." />
      </Card>
    );
  }

  // `getCheckins()` llega del más reciente al más viejo (orderBy date desc
  // en apps/web/src/app/api/v1/checkins/route.ts).
  const latest = list[0]!;
  const previous = list[1] ?? null;
  const oldest = list[list.length - 1]!;
  const hasHistory = list.length > 1;

  const waistDeltaPrev = delta(latest.waistCm, previous?.waistCm ?? null);
  const waistDeltaTotal = hasHistory ? delta(latest.waistCm, oldest.waistCm) : null;
  const weightDeltaPrev = delta(latest.weightKg, previous?.weightKg ?? null);
  const weightDeltaTotal = hasHistory ? delta(latest.weightKg, oldest.weightKg) : null;

  const chartPoints = (points ?? []).slice(-CHART_POINTS);

  return (
    <Card>
      <SectionLabel color={colors.champan}>Tu avance</SectionLabel>

      <View style={styles.progressHeader}>
        <Text style={styles.waistValue}>{latest.waistCm !== null ? `${latest.waistCm} cm` : "—"}</Text>
        <Text style={styles.waistCaption}>Cintura · {formatDateEs(latest.date)}</Text>
      </View>

      <View style={styles.deltaRow}>
        <DeltaStat label="Vs. anterior" value={waistDeltaPrev} colorCode />
        <DeltaStat label="Desde el inicio" value={waistDeltaTotal} colorCode />
      </View>

      {latest.weightKg !== null && (
        <View style={styles.weightRow}>
          <Text style={styles.weightValue}>{latest.weightKg} kg</Text>
          <DeltaStat label="Vs. anterior" value={weightDeltaPrev} compact />
          <DeltaStat label="Desde el inicio" value={weightDeltaTotal} compact />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}>
        <WaistChart points={chartPoints} />
      </ScrollView>
    </Card>
  );
}

function DeltaStat({
  label,
  value,
  colorCode = false,
  compact = false,
}: {
  label: string;
  value: number | null;
  colorCode?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const text = value === null ? "—" : value === 0 ? "=" : value > 0 ? `+${value}` : `${value}`;
  const tone = !colorCode || value === null || value === 0 ? "neutral" : value < 0 ? "good" : "bad";

  return (
    <View style={styles.deltaStat}>
      <Text style={[styles.deltaStatLabel, compact && styles.deltaStatLabelCompact]}>{label}</Text>
      <View style={[styles.deltaBadge, tone === "good" && styles.deltaGood, tone === "bad" && styles.deltaBad]}>
        <Text style={styles.deltaText}>{text}</Text>
      </View>
    </View>
  );
}

function GoalSection({ goal }: { goal: GoalResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!goal) {
    return (
      <Card>
        <SectionLabel>Rumbo a tu objetivo</SectionLabel>
        <EmptyState message="Tu objetivo aparece aquí en cuanto completes tu perfil." />
        <GoalLink />
      </Card>
    );
  }

  const { status } = goal;

  if (status.state === "sin_referencia") {
    return (
      <Card>
        <SectionLabel>Rumbo a tu objetivo</SectionLabel>
        <EmptyState message="Sube tus 3 fotos de referencia para empezar a comparar tu rumbo." />
        <GoalLink label="Subir referencia →" />
      </Card>
    );
  }

  if (status.state === "sin_fotos") {
    return (
      <Card>
        <SectionLabel>Rumbo a tu objetivo</SectionLabel>
        <EmptyState message="Ya tienes tu referencia. En cuanto tengas fotos de progreso, aquí aparece la comparación." />
        <GoalLink />
      </Card>
    );
  }

  if (status.state === "en_espera") {
    return (
      <Card>
        <SectionLabel>Rumbo a tu objetivo</SectionLabel>
        <EmptyState message="El análisis se hace cada 2 semanas. Todavía no hay uno disponible — vuelve en unos días." />
        <GoalLink />
      </Card>
    );
  }

  // "listo": las líneas ya vienen redactadas por el backend — se pintan
  // tal cual, sin reinterpretarlas.
  return (
    <Card>
      <SectionLabel color={colors.champan}>Rumbo a tu objetivo</SectionLabel>
      <View style={styles.goalLines}>
        {status.lines.map((line) => (
          <Text key={line} style={styles.goalLine}>
            {line}
          </Text>
        ))}
      </View>
      <GoalLink label="Ver detalle →" />
    </Card>
  );
}

function GoalLink({ label = "Ir a tu objetivo →" }: { label?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable onPress={() => router.push("/objetivo")} style={styles.inlineLink} hitSlop={8}>
      <Text style={styles.inlineLinkText}>{label}</Text>
    </Pressable>
  );
}

function PlanCard({ decision }: { decision: Decision | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!decision) {
    return (
      <Card>
        <SectionLabel>Tu plan de hoy</SectionLabel>
        <EmptyState message="Tu coach todavía está armando tu siguiente decisión." />
      </Card>
    );
  }

  return (
    <Card highlighted>
      <SectionLabel color={colors.pergaminoSoft}>{decision.phase}</SectionLabel>
      <Text style={styles.planKcal}>{decision.kcal} kcal</Text>
    </Card>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  backRow: { flexDirection: "row", alignItems: "center" },
  backText: { fontFamily: fonts.sans, fontSize: 13, color: colors.paloRosaLight },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.marfil,
  },
  streakHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  streakBig: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 56,
    color: colors.pergamino,
    marginTop: spacing.md,
  },
  streakBigLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.pergaminoSoft,
    marginTop: -spacing.xs,
  },
  streakBest: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.pergaminoSoft,
    marginTop: spacing.sm,
  },
  streakMessage: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    lineHeight: 22,
    color: colors.pergamino,
    marginTop: spacing.lg,
  },
  inlineLink: {
    marginTop: spacing.md,
  },
  inlineLinkText: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    color: colors.paloRosaLight,
  },
  clockRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  clockStat: {
    gap: 2,
  },
  clockStatValue: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.marfil,
  },
  clockCaption: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
    marginTop: spacing.md,
  },
  trainingWeekLine: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.marfil,
    marginTop: spacing.md,
  },
  prList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  prName: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.marfil,
  },
  prValue: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.champan,
  },
  progressHeader: {
    marginTop: spacing.md,
    gap: 2,
  },
  waistValue: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 34,
    color: colors.champan,
  },
  waistCaption: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.paloRosaLight,
  },
  deltaRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  weightValue: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.marfil,
  },
  deltaStat: {
    gap: spacing.xs,
  },
  deltaStatLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
  deltaStatLabelCompact: {
    fontSize: 10,
  },
  deltaBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
  },
  deltaGood: {
    backgroundColor: withAlpha(colors.champan, 0.2),
  },
  deltaBad: {
    backgroundColor: withAlpha(colors.error, 0.2),
  },
  deltaText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.marfil,
  },
  chartScroll: {
    marginTop: spacing.lg,
  },
  goalLines: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  goalLine: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.marfil,
  },
  planKcal: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 24,
    color: colors.pergamino,
    marginTop: spacing.md,
  },
});
