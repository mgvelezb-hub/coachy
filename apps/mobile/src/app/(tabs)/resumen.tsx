import { useRouter } from "expo-router";
import {
  // El tipo `Activity` de la API ya ocupa ese nombre en este archivo.
  Activity as ActivityIcon,
  CalendarCheck,
  Dumbbell,
  Flame,
  Settings,
  Target,
  TrendingUp,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ScoreCard } from "@/components/ScoreCard";
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
import {
  activeDays,
  bestStreak,
  currentStreak,
  streakMessage,
  todayISO,
  trainingDays,
} from "@/lib/streak";
import { fonts, radius, spacing, withAlpha, type Palette, type as typeScale } from "@/lib/theme";
import { syncWidgetData } from "@/lib/widget";

/**
 * "Resumen" — la pestaña de la trayectoria: de dónde salí, cómo voy y hacia
 * dónde tengo que llegar.
 *
 * Contesta "¿voy bien?"; Hoy contesta "¿qué hago ahora?". Todo lo que aquí se
 * pinta llega COLAPSADO: la tarjeta cerrada trae su dato y su estado, y abrir
 * es para el detalle. El check-in vive aquí como tarjeta —ya no es pestaña—
 * porque es el cierre de la semana, no una tarea de todos los días.
 *
 * Gancho diario de
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
      // El widget enseña la MISMA racha que Hoy: la de entrenamiento. Si aquí
      // se mandara la de constancia, el widget diría un número y la pantalla
      // otro.
      const widgetDays = trainingDays({
        sessions: data.sessions ?? undefined,
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

  // Dos rachas, y se dicen las dos: la de ENTRENAMIENTO manda (es la que
  // aparece en Hoy y en el widget), y la de constancia con la app va debajo
  // como contexto. Antes solo existía la segunda, y como cuenta los días con
  // datos del reloj marcaba una racha larga a quien había entrenado dos veces.
  const training = trainingDays({
    sessions: data.sessions ?? undefined,
    activities: data.activities ?? undefined,
  });
  const streak = currentStreak(training, todayISO());
  const best = bestStreak(training);
  const engagement = currentStreak(
    activeDays({
      sessions: data.sessions ?? undefined,
      checkIns: data.checkIns ?? undefined,
      healthDays: data.healthDays ?? undefined,
      activities: data.activities ?? undefined,
    }),
    todayISO(),
  );

  // Resúmenes de las tarjetas cerradas. Cada uno tiene que contestar sin abrir:
  // si aquí no hay un número, la tarjeta cerrada no sirve.
  const dias = data.healthDays ?? [];
  const pasos = dias.map((d) => d.steps).filter((v): v is number => v != null);
  const suenos = dias.map((d) => d.sleepMin).filter((v): v is number => v != null);
  const relojResumen =
    dias.length === 0
      ? "Conecta Apple Salud para verlo"
      : [
          pasos.length > 0 ? `${Math.round(average(pasos)).toLocaleString("es-MX")} pasos/día` : null,
          suenos.length > 0 ? `${formatDuration(Math.round(average(suenos)))} de sueño` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Sin datos del reloj todavía";

  const sesionesTotal = data.week?.sessions.length ?? 0;
  const sesionesHechas = data.week?.sessions.filter((s) => s.completedAt !== null).length ?? 0;
  const entrenoResumen =
    sesionesTotal === 0
      ? "Sin semana generada"
      : `${sesionesHechas} de ${sesionesTotal} sesiones · ${(data.records ?? []).length} PRs`;

  const ultimoCheckIn = data.checkIns?.[0] ?? null;
  const avanceResumen = ultimoCheckIn
    ? `Cintura ${ultimoCheckIn.waistCm ?? "—"} cm · ${data.checkIns?.length ?? 0} check-ins`
    : "Tu primer check-in arranca el historial";

  // Pendiente cuando el último check-in tiene 7 días o más: es la cadencia
  // semanal, no una fecha fija — el día de cierre lo elige la atleta.
  const diasDesdeCheckIn =
    ultimoCheckIn === null
      ? null
      : Math.round(
          (Date.parse(`${todayISO()}T12:00:00.000Z`) - Date.parse(`${ultimoCheckIn.date}T12:00:00.000Z`)) /
            86_400_000,
        );
  const checkInPendiente = diasDesdeCheckIn === null || diasDesdeCheckIn >= 7;
  const checkInResumen =
    diasDesdeCheckIn === null
      ? "Nunca has hecho uno"
      : diasDesdeCheckIn === 0
        ? "Lo hiciste hoy"
        : `Último hace ${diasDesdeCheckIn} ${diasDesdeCheckIn === 1 ? "día" : "días"}`;

  const objetivoResumen =
    data.goal === null
      ? "Completa tu perfil"
      : data.goal.status.state === "listo"
        ? `${data.goal.status.references} referencias · analizado`
        : data.goal.status.state === "sin_referencia"
          ? "Sin fotos de referencia"
          : data.goal.status.state === "sin_fotos"
            ? `${data.goal.status.references} referencias`
            : "En análisis";

  const planResumen = data.decision
    ? `${data.decision.kcal} kcal · ${data.decision.phase.replace(/_/g, " ").toLowerCase()}`
    : "Sin decisión publicada";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Resumen</Text>
          <Pressable onPress={() => router.push("/ajustes")} hitSlop={8} style={styles.settings}>
            <Settings size={24} color={colors.paloRosa} strokeWidth={2} />
          </Pressable>
        </View>

        <StreakCard streak={streak} best={best} engagement={engagement} />

        <ScoreCard
          icon={CalendarCheck}
          tint={colors.guindaLight}
          title="Check-in"
          summary={checkInResumen}
          status={{ label: checkInPendiente ? "Toca" : "Al día", tone: checkInPendiente ? "warn" : "ok" }}
          onPress={() => router.push("/checkin")}
        />

        <ScoreCard icon={ActivityIcon} tint={colors.champan} title="Tu reloj" summary={relojResumen}>
          <ClockSection healthDays={data.healthDays} />
        </ScoreCard>

        <ScoreCard icon={Dumbbell} tint={colors.paloRosa} title="Entrenamiento" summary={entrenoResumen}>
          <TrainingSection week={data.week} records={data.records} activities={data.activities} />
        </ScoreCard>

        <ScoreCard icon={TrendingUp} tint={colors.champan} title="Tu avance" summary={avanceResumen}>
          <ProgressSection checkIns={data.checkIns} points={data.measurementPoints} />
        </ScoreCard>

        <ScoreCard icon={Target} tint={colors.guindaLight} title="Rumbo a tu objetivo" summary={objetivoResumen}>
          <GoalSection goal={data.goal} />
        </ScoreCard>

        <ScoreCard icon={Flame} tint={colors.champan} title="Tu plan" summary={planResumen}>
          <PlanCard decision={data.decision} />
        </ScoreCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function StreakCard({
  streak,
  best,
  engagement,
}: {
  streak: number;
  best: number;
  engagement: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card highlighted>
      <View style={styles.streakHeader}>
        <Flame size={22} color={colors.pergamino} strokeWidth={1.75} />
        <SectionLabel color={colors.pergaminoSoft}>Tu racha entrenando</SectionLabel>
      </View>

      <Text style={styles.streakBig}>{streak}</Text>
      <Text style={styles.streakBigLabel}>{streak === 1 ? "día seguido" : "días seguidos"}</Text>

      {best > streak && <Text style={styles.streakBest}>Tu mejor racha: {best} días</Text>}

      {engagement > streak && (
        <Text style={styles.streakBest}>
          {engagement} días seguidos sin soltar la app (check-in o datos del reloj)
        </Text>
      )}

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
      <View style={styles.seccion}>
        <EmptyState message="Conecta tu Apple Salud para ver tus pasos y tu sueño aquí." />
        <Pressable onPress={() => router.push("/ajustes")} style={styles.inlineLink} hitSlop={8}>
          <Text style={styles.inlineLinkText}>Conectar en Ajustes →</Text>
        </Pressable>
      </View>
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
    <View style={styles.seccion}>
      <View style={styles.clockRow}>
        <ClockStat label="Pasos / día" value={avgSteps !== null ? avgSteps.toLocaleString("es-MX") : "—"} />
        <ClockStat label="Sueño / noche" value={avgSleep !== null ? formatDuration(avgSleep) : "—"} />
      </View>
      <Text style={styles.clockCaption}>Último dato: {formatDateEs(lastDay.date)}</Text>
    </View>
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
    <View style={styles.seccion}>
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
    </View>
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
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const list = checkIns ?? [];
  if (list.length === 0) {
    return (
      <View style={styles.seccion}>
        <EmptyState message="Aún no tienes check-ins. El primero arranca tu historial." />
      </View>
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
    <View style={styles.seccion}>
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
      <Pressable onPress={() => router.push("/historial")} style={styles.inlineLink} hitSlop={8}>
        <Text style={styles.inlineLinkText}>Ver historial completo →</Text>
      </Pressable>
    </View>
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
      <View style={styles.seccion}>
        <EmptyState message="Tu objetivo aparece aquí en cuanto completes tu perfil." />
        <GoalLink />
      </View>
    );
  }

  const { status } = goal;

  if (status.state === "sin_referencia") {
    return (
      <View style={styles.seccion}>
        <EmptyState message="Sube tus 3 fotos de referencia para empezar a comparar tu rumbo." />
        <GoalLink label="Subir referencia →" />
      </View>
    );
  }

  if (status.state === "sin_fotos") {
    return (
      <View style={styles.seccion}>
        <EmptyState message="Ya tienes tu referencia. En cuanto tengas fotos de progreso, aquí aparece la comparación." />
        <GoalLink />
      </View>
    );
  }

  if (status.state === "en_espera") {
    return (
      <View style={styles.seccion}>
        <EmptyState message="El análisis se hace cada 2 semanas. Todavía no hay uno disponible — vuelve en unos días." />
        <GoalLink />
      </View>
    );
  }

  // "listo": las líneas ya vienen redactadas por el backend — se pintan
  // tal cual, sin reinterpretarlas.
  return (
    <View style={styles.seccion}>
      <View style={styles.goalLines}>
        {status.lines.map((line) => (
          <Text key={line} style={styles.goalLine}>
            {line}
          </Text>
        ))}
      </View>
      <GoalLink label="Ver detalle →" />
    </View>
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
      <View style={styles.seccion}>
        <EmptyState message="Tu coach todavía está armando tu siguiente decisión." />
      </View>
    );
  }

  return (
    <View style={styles.seccion}>
      <Text style={styles.planKcal}>{decision.kcal} kcal</Text>
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
    gap: spacing.md,
    paddingBottom: spacing.huge,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  settings: { padding: spacing.xs },
  title: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
  },
  /** Contenido de una sección ya dentro de su ScoreCard: sin fondo ni borde
   * propios — la tarjeta ya los puso, y anidarlos se ve como caja en caja. */
  seccion: { gap: spacing.md },
  streakHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  streakBig: {
    // Inter, no Cinzel: en un número de 56 px los remates de Cinzel se ven
    // afilados y el dato pierde peso en vez de ganarlo.
    fontFamily: fonts.sansBold,
    ...typeScale.hero,
    color: colors.pergamino,
    marginTop: spacing.md,
  },
  streakBigLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.pergaminoSoft,
    marginTop: -spacing.xs,
  },
  streakBest: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.pergaminoSoft,
    marginTop: spacing.sm,
  },
  streakMessage: {
    fontFamily: fonts.serifItalic,
    ...typeScale.subheading,
    color: colors.pergamino,
    marginTop: spacing.lg,
  },
  inlineLink: {
    marginTop: spacing.md,
  },
  inlineLinkText: {
    fontFamily: fonts.serifItalic,
    ...typeScale.body,
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
    ...typeScale.heading,
    color: colors.marfil,
  },
  clockCaption: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
    marginTop: spacing.md,
  },
  trainingWeekLine: {
    fontFamily: fonts.sans,
    ...typeScale.body,
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
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  prValue: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.champan,
  },
  progressHeader: {
    marginTop: spacing.md,
    gap: 2,
  },
  waistValue: {
    fontFamily: fonts.sansBold,
    ...typeScale.display,
    color: colors.champan,
  },
  waistCaption: {
    fontFamily: fonts.sans,
    ...typeScale.label,
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
    ...typeScale.subheading,
    color: colors.marfil,
  },
  deltaStat: {
    gap: spacing.xs,
  },
  deltaStatLabel: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  deltaStatLabelCompact: {
    ...typeScale.label,
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
    ...typeScale.label,
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
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  planKcal: {
    fontFamily: fonts.displaySemiBold,
    ...typeScale.title,
    color: colors.pergamino,
    marginTop: spacing.md,
  },
});
