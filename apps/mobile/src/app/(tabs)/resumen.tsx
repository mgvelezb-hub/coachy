import { useRouter } from "expo-router";
import {
  // El tipo `Activity` de la API ya ocupa ese nombre en este archivo.
  Activity as ActivityIcon,
  CalendarCheck,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  Settings,
  Target,
  Timer,
  Trophy,
  TrendingUp,
  FlaskConical,
  Waves,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActivityRings, type Ring } from "@/components/ActivityRings";
import { BotonEditar, EditorDePaneles } from "@/components/EditorDePaneles";
import { ChartBoundary } from "@/components/ChartBoundary";
import { GapChart } from "@/components/GapChart";
import { RadarChart } from "@/components/RadarChart";
import { ScoreTile } from "@/components/ScoreTile";
import { ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import {
  DISCIPLINE_LABELS,
  getActivities,
  getCheckins,
  getLabs,
  patchResumen,
  getDecision,
  getGoal,
  getHealthDays,
  getHistoryMeasurements,
  getHistoryTraining,
  getMe,
  getTrainingWeek,
  type Activity,
  type CheckInRow,
  type CheckInPoint,
  type Decision,
  type GoalResponse,
  type HealthDayPayload,
  type LabResult,
  type MeResponse,
  type PersonalRecord,
  type TrainingHistoryRow,
  type WeekView,
} from "@/lib/api";
import { bestStreak, currentStreak, todayISO, trainingDays } from "@/lib/streak";
import {
  EJERCICIO_META_MIN,
  GOAL_LABEL,
  PASOS_META,
  SUENO_META_MIN,
  formatSleep,
  type Goal,
} from "@/lib/insights";
import { brechasDeObjetivo, enfasisDeObjetivo, perfilDeEjes } from "@/lib/perfil";
import {
  layoutPorDefecto,
  sanearLayout,
  type PanelConfig,
} from "@/lib/paneles";
import { brechasDelMes, metasDelMes } from "@/lib/metas";
import { glidepathDeCintura, textoDeGlidepath } from "@/lib/glidepath";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";
import { syncWidgetData } from "@/lib/widget";

/**
 * "Resumen" — la pestaña de la trayectoria: de dónde salí, cómo voy y hacia
 * dónde tengo que llegar.
 *
 * Contesta "¿voy bien?"; Hoy contesta "¿qué hago ahora?".
 *
 * Está en mosaico y no en columna a propósito. Una pantalla que existe para
 * dar el panorama no puede obligar a hacer scroll para saber cómo vas: en
 * cuadros de media pantalla caben seis rubros de un vistazo y el ojo los
 * compara solo. Por eso ningún cuadro despliega — cada uno lleva a su detalle,
 * donde sí hay espacio para gráficas y lectura.
 *
 * Arriba manda el dato del cuerpo, no la racha. La racha es constancia, que
 * importa, pero no es lo primero que quieres saber al abrir: es un cuadro más
 * del mosaico.
 */

type ResumenData = {
  sessions: TrainingHistoryRow[] | null;
  records: PersonalRecord[] | null;
  checkIns: CheckInRow[] | null;
  healthDays: HealthDayPayload[] | null;
  activities: Activity[] | null;
  week: WeekView | null;
  goal: GoalResponse | null;
  decision: Decision | null;
  points: CheckInPoint[] | null;
  me: MeResponse | null;
  labs: LabResult[] | null;
};

/** Cada fuente se tolera por separado: que una falle no tumba la pantalla entera. */
async function safeFetch<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/** El día más reciente que traiga ese campo. Un día puede llegar a medias. */
function ultimoConDato(
  days: HealthDayPayload[],
  field: "steps" | "sleepMin" | "exerciseMin" | "hrvMs" | "vo2max",
): { value: number; date: string } | null {
  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date));
  for (const day of ordenados) {
    const value = day[field];
    if (value !== null && value !== undefined) return { value, date: day.date };
  }
  return null;
}

/** yyyy-MM-dd → "26 de agosto", en UTC para no correr el día por el huso local. */
function formatDateEs(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** Días enteros entre una fecha ISO y hoy. */
function diasDesde(dateKey: string): number {
  const desde = Date.parse(`${dateKey}T12:00:00.000Z`);
  const hoy = Date.parse(`${todayISO()}T12:00:00.000Z`);
  return Math.round((hoy - desde) / 86_400_000);
}

export default function ResumenScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tocar esta pestaña estando en ella regresa el scroll hasta arriba.
  const scrollRef = useScrollTop();
  const [data, setData] = useState<ResumenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * El acomodo del tablero.
   *
   * Se pinta con lo que hay —de fábrica al arrancar— y se reemplaza en cuanto
   * llega el del servidor. Guardar es optimista: la pantalla se reacomoda al
   * instante y la llamada va detrás, porque reordenar es la clase de gesto que
   * se hace cinco veces seguidas y esperar al servidor cada vez lo arruina.
   */
  const [layout, setLayout] = useState<PanelConfig[]>(() => layoutPorDefecto());
  const [editando, setEditando] = useState(false);

  const guardarLayout = useCallback((siguiente: PanelConfig[]) => {
    setLayout(siguiente);
    void patchResumen(siguiente).catch(() => {
      // Si no se pudo guardar, el tablero sigue como lo dejó: se vuelve a
      // mandar la próxima vez que lo mueva. Un error aquí no vale una alerta.
    });
  }, []);

  const load = useCallback(async () => {
    const [historyRes, checkinsRes, healthRes, activitiesRes, week, goal, decisionRes, measurementsRes, me] =
      await Promise.all([
        safeFetch(getHistoryTraining()),
        safeFetch(getCheckins()),
        safeFetch(getHealthDays()),
        safeFetch(getActivities()),
        safeFetch(getTrainingWeek()),
        safeFetch(getGoal()),
        safeFetch(getDecision()),
        safeFetch(getHistoryMeasurements()),
        safeFetch(getMe()),
      ]);

    const labsRes = await safeFetch(getLabs());

    const next: ResumenData = {
      sessions: historyRes?.sessions ?? null,
      records: historyRes?.records ?? null,
      checkIns: checkinsRes?.checkIns ?? null,
      healthDays: healthRes?.dias ?? null,
      activities: activitiesRes?.actividades ?? null,
      week,
      goal,
      decision: decisionRes?.decision ?? null,
      points: measurementsRes?.points ?? null,
      me,
      labs: labsRes?.labs ?? null,
    };

    if (Object.values(next).every((value) => value === null)) {
      // No se toca `data`: si ya había algo de una carga previa se queda
      // visible, y el error de pantalla completa solo aparece cuando nunca
      // hubo nada que mostrar.
      setError("No se pudo cargar tu resumen. Revisa tu conexión.");
      return;
    }

    setData(next);
    setError(null);

    const guardado = me?.profile?.summaryLayout;
    if (guardado !== undefined && guardado !== null) setLayout(sanearLayout(guardado));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync parcial del widget: aquí solo viaja la racha (no entrenamiento ni
  // comida), y deja los demás campos tal cual los dejó Hoy — ver el contrato
  // undefined/null en `src/lib/widget.ts`.
  useEffect(() => {
    if (!data) return;
    try {
      const days = trainingDays({
        sessions: data.sessions ?? undefined,
        activities: data.activities ?? undefined,
      });
      syncWidgetData({ racha: currentStreak(days, todayISO()), mejorRacha: bestStreak(days) });
    } catch {
      // Sincronizar el widget nunca debe tumbar la pantalla.
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

  const objetivoLabel = GOAL_LABEL[(data.me?.profile?.goal ?? "") as Goal] ?? null;
  const dias = data.healthDays ?? [];
  const pasos = ultimoConDato(dias, "steps");
  const ejercicio = ultimoConDato(dias, "exerciseMin");
  const sueno = ultimoConDato(dias, "sleepMin");
  const fecha = pasos?.date ?? ejercicio?.date ?? sueno?.date ?? null;

  const hrv = ultimoConDato(dias, "hrvMs");
  const vo2 = ultimoConDato(dias, "vo2max");

  // La comparación contra la referencia: con fotos propias es una brecha real
  // por zona; sin ellas, el énfasis que pide cada zona. Son dos preguntas
  // distintas y la tarjeta lo dice, no se disfraza una de la otra.
  const objetivoListo = data.goal?.status.state === "listo";
  const brechas =
    data.goal?.status.state === "listo"
      ? brechasDeObjetivo(data.goal.status.readings)
      : data.goal?.status.state === "sin_fotos"
        ? enfasisDeObjetivo(data.goal.status.emphasis)
        : [];

  // Las metas del mes: la rampa, no la cima. Comparar tu cintura de hoy contra
  // la referencia da una brecha enorme que no dice qué hacer esta semana; el
  // escalón del mes sí.
  const plan = glidepathDeCintura(data.points ?? [], data.me?.profile?.heightCm ?? null);
  const metas = metasDelMes(
    data.points ?? [],
    data.me?.profile?.goal ?? "SALUD",
    todayISO(),
    plan?.meta ?? null,
  );

  const ejes = perfilDeEjes({
    healthDays: dias,
    week: data.week,
    points: data.points ?? [],
  });

  const rings: Ring[] = [
    { label: "Pasos", value: pasos?.value ?? null, goal: PASOS_META, color: colors.champan },
    { label: "Ejercicio", value: ejercicio?.value ?? null, goal: EJERCICIO_META_MIN, color: colors.guindaLight },
    { label: "Sueño", value: sueno?.value ?? null, goal: SUENO_META_MIN, color: colors.paloRosa },
  ];

  const training = trainingDays({
    sessions: data.sessions ?? undefined,
    activities: data.activities ?? undefined,
  });
  const streak = currentStreak(training, todayISO());
  const best = bestStreak(training);

  const ultimoCheckIn = data.checkIns?.[0] ?? null;
  const diasCheckIn = ultimoCheckIn ? diasDesde(ultimoCheckIn.date) : null;
  const checkInPendiente = diasCheckIn === null || diasCheckIn >= 7;

  const sesionesTotal = data.week?.sessions.length ?? 0;
  const sesionesHechas = data.week?.sessions.filter((s) => s.completedAt !== null).length ?? 0;

  const prs = [...(data.records ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const ultimoPr = prs[0] ?? null;

  const objetivoEstado = data.goal?.status.state ?? null;

  // `data` ya pasó su guardia, pero el cierre de `renderPanel` pierde ese
  // estrechamiento: aquí se fija una vez y adentro se usa esta constante.
  const datos = data;

  const ultimoLab = datos.labs?.[0] ?? null;

  /** Los últimos valores de una medida del check-in, del más viejo al más nuevo. */
  function serieDe(campo: "waistCm" | "weightKg"): number[] {
    return (datos.points ?? [])
      .map((punto) => punto[campo])
      .filter((valor): valor is number => typeof valor === "number")
      .slice(-8);
  }

  /** Los últimos días del reloj para esa métrica, en orden cronológico. */
  function serieSalud(campo: "steps" | "sleepMin" | "hrvMs" | "vo2max"): number[] {
    return [...(datos.healthDays ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((dia) => dia[campo])
      .filter((valor): valor is number => typeof valor === "number")
      .slice(-8);
  }

  // Lado a lado solo si a cada panel le queda ancho para leerse; en un
  // teléfono angosto dos telarañas de 150 pt se vuelven adorno ilegible.
  const ladoALado = width >= 760;
  const anchoPanel = ladoALado ? 200 : 240;

  /**
   * Cada panel del tablero, ya resuelto.
   *
   * El `switch` está aquí adentro a propósito: los paneles se alimentan de los
   * mismos datos que la pantalla ya calculó, y sacarlos a otro archivo
   * obligaría a pasar veinte props o a volver a pedir todo. Lo que sí vive
   * afuera es el catálogo (`lib/paneles.ts`), que es lo que el editor necesita
   * y lo único que hay que tocar para agregar un panel nuevo.
   */
  function renderPanel(config: PanelConfig): React.ReactNode {
    const { id, variante, ancho } = config;
    const detallado = variante === "detallado";
    const compacto = variante === "compacto";

    switch (id) {
      case "anillos":
        return (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Tu día</Text>
            {!compacto && (
              <Text style={styles.heroCaption}>
                {fecha ? `Último dato del reloj: ${formatDateEs(fecha)}` : "Conecta tu reloj para llenar los anillos"}
              </Text>
            )}

            <View style={styles.heroBody}>
              <ActivityRings rings={rings} size={compacto ? 110 : 132} />

              {!compacto && (
                <View style={styles.leyendas}>
                  <Leyenda
                    icon={Footprints}
                    color={colors.champan}
                    label="Pasos"
                    valor={pasos ? `${pasos.value.toLocaleString("es-MX")}` : "—"}
                    meta={`de ${PASOS_META.toLocaleString("es-MX")}`}
                    onPress={() => router.push("/salud/pasos")}
                  />
                  <Leyenda
                    icon={Timer}
                    color={colors.guindaLight}
                    label="Ejercicio"
                    valor={ejercicio ? `${ejercicio.value} min` : "—"}
                    meta={`de ${EJERCICIO_META_MIN} min`}
                    onPress={() => router.push("/salud/pasos")}
                  />
                  <Leyenda
                    icon={Moon}
                    color={colors.paloRosa}
                    label="Sueño"
                    valor={sueno ? formatSleep(sueno.value) : "—"}
                    meta={`de ${formatSleep(SUENO_META_MIN)}`}
                    onPress={() => router.push("/salud/descanso")}
                  />
                </View>
              )}
            </View>

            {detallado && (
              <View style={styles.extras}>
                <Leyenda
                  icon={HeartPulse}
                  color={colors.error}
                  label="Recuperación"
                  valor={hrv ? `${hrv.value} ms` : "—"}
                  meta="variabilidad"
                  onPress={() => router.push("/salud/recuperacion")}
                />
                <Leyenda
                  icon={ActivityIcon}
                  color={colors.champan}
                  label="Condición"
                  valor={vo2 ? `${vo2.value}` : "—"}
                  meta="VO₂ máx"
                  onPress={() => router.push("/salud/condicion")}
                />
              </View>
            )}
          </View>
        );

      case "perfil":
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu perfil</Text>
            {detallado && (
              <Text style={styles.heroCaption}>
                Cada eje contra lo sugerido para tu objetivo
                {objetivoLabel ? ` de ${objetivoLabel}` : ""}: 100 % es la meta, no un máximo.
              </Text>
            )}
            <ChartBoundary label="La telaraña no se pudo dibujar.">
              <RadarChart ejes={ejes} size={ancho === "ancho" ? 280 : anchoPanel} />
            </ChartBoundary>
          </View>
        );

      case "mes":
        if (metas.medidas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu mes</Text>
            {detallado && (
              <Text style={styles.heroCaption}>
                Tus medidas contra el corte de este mes, desde tu check-in del {metas.desde}
              </Text>
            )}
            {plan && detallado && (
              <Pressable onPress={() => router.push("/glidepath")} hitSlop={6}>
                <Text style={styles.glidepath}>{textoDeGlidepath(plan)}</Text>
                <Text style={styles.glidepathLink}>Ver el plan completo →</Text>
              </Pressable>
            )}
            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="Las metas del mes no se pudieron dibujar.">
                <GapChart brechas={brechasDelMes(metas.medidas)} />
              </ChartBoundary>
            </View>
          </View>
        );

      case "brecha_objetivo":
        if (brechas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Vs. tu objetivo</Text>
            {detallado && (
              <Text style={styles.heroCaption}>
                {objetivoListo
                  ? "Qué tan lejos está cada zona de tu referencia"
                  : "Todavía sin fotos tuyas: esto es el énfasis que pide tu referencia, no tu brecha"}
              </Text>
            )}
            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="La brecha no se pudo dibujar.">
                <GapChart brechas={brechas} />
              </ChartBoundary>
            </View>
          </View>
        );

      case "cintura":
        return (
          <ScoreTile
            icon={TrendingUp}
            tint={colors.champan}
            title="Cintura"
            value={ultimoCheckIn?.waistCm != null ? `${ultimoCheckIn.waistCm} cm` : "—"}
            detail={
              compacto
                ? null
                : ultimoCheckIn
                  ? `${datos.checkIns?.length ?? 0} check-ins · ${formatDateEs(ultimoCheckIn.date)}`
                  : "Tu primer check-in arranca el historial"
            }
            serie={detallado ? serieDe("waistCm") : undefined}
            onPress={() => router.push("/salud/medidas")}
          />
        );

      case "checkin":
        return (
          <ScoreTile
            icon={CalendarCheck}
            tint={colors.guindaLight}
            title="Check-in"
            value={diasCheckIn === null ? "—" : diasCheckIn === 0 ? "Hoy" : `${diasCheckIn} d`}
            detail={compacto ? null : diasCheckIn === null ? "Nunca has hecho uno" : "desde el último"}
            status={{
              label: checkInPendiente ? "Toca" : "Al día",
              tone: checkInPendiente ? "warn" : "ok",
            }}
            onPress={() => router.push("/checkin")}
          />
        );

      case "semana":
        return (
          <ScoreTile
            icon={Dumbbell}
            tint={colors.paloRosa}
            title="Esta semana"
            value={sesionesTotal === 0 ? "—" : `${sesionesHechas}/${sesionesTotal}`}
            detail={
              compacto ? null : sesionesTotal === 0 ? "Sin semana generada" : "sesiones completadas"
            }
            extra={
              detallado && datos.week
                ? datos.week.sessions.map((sesion) => sesion.muscleGroup).join(" · ")
                : undefined
            }
            onPress={() => router.push("/rutinas")}
          />
        );

      case "disciplinas": {
        const otras = datos.week?.otherSessions ?? [];
        return (
          <ScoreTile
            icon={Waves}
            tint={colors.paloRosa}
            title="Tus disciplinas"
            value={`${sesionesTotal + otras.length}`}
            detail={compacto ? null : "sesiones esta semana"}
            extra={
              detallado
                ? otras.length > 0
                  ? `${sesionesTotal} de pesas · ${otras
                      .map((sesion) => DISCIPLINE_LABELS[sesion.discipline].toLowerCase())
                      .join(", ")}`
                  : "Solo pesas. Agrega otra disciplina en Ajustes."
                : undefined
            }
            onPress={() => router.push("/rutinas")}
          />
        );
      }

      case "racha":
        return (
          <ScoreTile
            icon={Flame}
            tint={colors.champan}
            title="Racha"
            value={`${streak}`}
            detail={
              compacto
                ? null
                : streak === 0
                  ? "Hoy cuenta para empezar"
                  : best > streak
                    ? `días · tu mejor: ${best}`
                    : "días entrenando seguido"
            }
          />
        );

      case "estudios":
        return (
          <ScoreTile
            icon={FlaskConical}
            tint={colors.guindaLight}
            title="Tus estudios"
            value={ultimoLab ? formatDateEs(ultimoLab.takenOn) : "—"}
            detail={
              compacto
                ? null
                : ultimoLab
                  ? `${ultimoLab.values.length} valores · ${ultimoLab.kind === "INBODY" ? "bioimpedancia" : "química"}`
                  : "Todavía sin estudios cargados"
            }
            status={
              ultimoLab && ultimoLab.outsideRange.length > 0
                ? { label: "Revisar", tone: "warn" }
                : null
            }
            onPress={() => router.push("/laboratorios")}
          />
        );

      case "plan":
        return (
          <ScoreTile
            icon={Flame}
            tint={colors.paloRosa}
            title="Tu plan"
            value={datos.decision ? `${datos.decision.kcal}` : "—"}
            detail={
              compacto
                ? null
                : datos.decision
                  ? `kcal · ${datos.decision.phase.replace(/_/g, " ").toLowerCase()}`
                  : "Sin decisión publicada"
            }
            extra={
              detallado && datos.decision
                ? `P ${datos.decision.proteinG} · C ${datos.decision.carbsG} · G ${datos.decision.fatG}`
                : undefined
            }
            onPress={() => router.push("/nutricion")}
          />
        );

      case "objetivo":
        return (
          <ScoreTile
            icon={Target}
            tint={colors.guindaLight}
            title="Objetivo"
            value={
              objetivoEstado === "listo"
                ? "Listo"
                : objetivoEstado === "en_espera"
                  ? "En análisis"
                  : "Pendiente"
            }
            detail={
              compacto
                ? null
                : datos.goal && "references" in datos.goal.status
                  ? `${datos.goal.status.references} referencias`
                  : "Sube tus fotos de referencia"
            }
            onPress={() => router.push("/objetivo")}
          />
        );

      case "records":
        return (
          <ScoreTile
            icon={Trophy}
            tint={colors.champan}
            title="Récords"
            value={`${prs.length}`}
            detail={
              compacto
                ? null
                : ultimoPr
                  ? `último: ${ultimoPr.exerciseName} ${ultimoPr.weightKg} kg`
                  : "Cierra sesiones para tener PRs"
            }
            onPress={() => router.push("/historial")}
          />
        );

      case "peso":
        return (
          <ScoreTile
            icon={TrendingUp}
            tint={colors.paloRosa}
            title="Peso"
            value={ultimoCheckIn?.weightKg != null ? `${ultimoCheckIn.weightKg} kg` : "—"}
            detail={compacto ? null : "de tu último check-in"}
            serie={detallado ? serieDe("weightKg") : undefined}
            onPress={() => router.push("/salud/medidas")}
          />
        );

      case "pasos":
        return (
          <ScoreTile
            icon={Footprints}
            tint={colors.champan}
            title="Pasos"
            value={pasos ? pasos.value.toLocaleString("es-MX") : "—"}
            detail={compacto ? null : `de ${PASOS_META.toLocaleString("es-MX")}`}
            serie={detallado ? serieSalud("steps") : undefined}
            onPress={() => router.push("/salud/pasos")}
          />
        );

      case "sueno":
        return (
          <ScoreTile
            icon={Moon}
            tint={colors.paloRosa}
            title="Sueño"
            value={sueno ? formatSleep(sueno.value) : "—"}
            detail={compacto ? null : `de ${formatSleep(SUENO_META_MIN)}`}
            serie={detallado ? serieSalud("sleepMin") : undefined}
            onPress={() => router.push("/salud/descanso")}
          />
        );

      case "recuperacion":
        return (
          <ScoreTile
            icon={HeartPulse}
            tint={colors.error}
            title="Recuperación"
            value={hrv ? `${hrv.value}` : "—"}
            detail={compacto ? null : "ms de variabilidad"}
            serie={detallado ? serieSalud("hrvMs") : undefined}
            onPress={() => router.push("/salud/recuperacion")}
          />
        );

      case "condicion":
        return (
          <ScoreTile
            icon={ActivityIcon}
            tint={colors.champan}
            title="Condición"
            value={vo2 ? `${vo2.value}` : "—"}
            detail={compacto ? null : "VO₂ máx"}
            serie={detallado ? serieSalud("vo2max") : undefined}
            onPress={() => router.push("/salud/condicion")}
          />
        );

      default:
        return null;
    }
  }

  // Los paneles de media pantalla se agrupan en filas; los de ancho completo
  // cortan la fila. Así el acomodo del editor se respeta tal cual, sin que un
  // panel ancho se cuele a media retícula.
  const filas: Array<{ ancho: boolean; paneles: Array<{ config: PanelConfig; node: React.ReactNode }> }> = [];
  for (const config of layout) {
    const node = renderPanel(config);
    if (!node) continue;

    if (config.ancho === "ancho") {
      filas.push({ ancho: true, paneles: [{ config, node }] });
      continue;
    }

    const ultima = filas[filas.length - 1];
    if (ultima && !ultima.ancho && ultima.paneles.length < 2) {
      ultima.paneles.push({ config, node });
    } else {
      filas.push({ ancho: false, paneles: [{ config, node }] });
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Resumen</Text>
          <View style={styles.headerAcciones}>
            <BotonEditar onPress={() => setEditando(true)} />
            <Pressable onPress={() => router.push("/ajustes")} hitSlop={8} style={styles.settings}>
              <Settings size={24} color={colors.paloRosa} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        {filas.map((fila, index) => (
          <View
            key={`${fila.paneles.map((panel) => panel.config.id).join("-")}-${index}`}
            style={fila.ancho ? undefined : styles.filaMosaico}
          >
            {fila.paneles.map(({ config, node }) => (
              <View key={config.id} style={fila.ancho ? undefined : styles.mitadMosaico}>
                {node}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <EditorDePaneles
        visible={editando}
        layout={layout}
        onChange={guardarLayout}
        onClose={() => setEditando(false)}
      />
    </SafeAreaView>
  );
}

function Leyenda({
  icon: Icon,
  color,
  label,
  valor,
  meta,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
  valor: string;
  meta: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.leyenda, pressed && styles.pressed]}>
      <Icon size={16} color={color} strokeWidth={2} />
      <View style={styles.leyendaTexto}>
        <Text style={styles.leyendaValor}>{valor}</Text>
        <Text style={styles.leyendaLabel}>
          {label} · {meta}
        </Text>
      </View>
    </Pressable>
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
  hero: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroTitle: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.marfil,
  },
  heroCaption: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  leyendas: {
    flex: 1,
    gap: spacing.md,
  },
  leyenda: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  leyendaTexto: { flex: 1 },
  leyendaValor: {
    fontFamily: fonts.sansBold,
    ...typeScale.subheading,
    color: colors.marfil,
  },
  leyendaLabel: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: withAlpha(colors.paloRosa, 0.9),
  },
  extras: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  perfil: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    padding: spacing.xl,
    gap: spacing.xs,
    alignItems: "stretch",
  },
  comparativa: {
    gap: spacing.md,
  },
  comparativaAncha: {
    flexDirection: "row",
  },
  glidepath: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.champan,
    marginTop: spacing.sm,
  },
  glidepathLink: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    marginTop: spacing.xs,
  },
  mitad: {
    flex: 1,
  },
  mosaico: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  headerAcciones: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  // Una fila del tablero: hasta dos paneles de media pantalla. Los de ancho
  // completo no pasan por aquí, van sueltos y cortan la retícula.
  filaMosaico: { flexDirection: "row", gap: spacing.md, alignItems: "stretch" },
  mitadMosaico: { flex: 1 },
});
