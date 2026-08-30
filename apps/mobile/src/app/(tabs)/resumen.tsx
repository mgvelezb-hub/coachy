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
  ClipboardCheck,
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
import { LineChart } from "@/components/LineChart";
import { PanelGrande } from "@/components/PanelGrande";
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
  getComidasLog,
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
  type ComidasResponse,
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
  comidas: ComidasResponse | null;
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
    const comidasRes = await safeFetch(getComidasLog());

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
      comidas: comidasRes ?? null,
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
    hoy: todayISO(),
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

  /**
   * El cumplimiento de la semana: rutina y dieta.
   *
   * La rutina se cuenta sola con lo que ya está registrado —sesiones cerradas
   * en la app más las de otras disciplinas que quedaron capturadas—; la dieta
   * sigue viniendo del último check-in, que es donde hoy se declara.
   */
  const cumplimiento = (() => {
    const sesiones = datos.week?.sessions ?? [];
    const otras = datos.week?.otherSessions ?? [];
    const registradas = new Set((datos.activities ?? []).map((actividad) => actividad.date));

    const hoyISO = todayISO();
    const gymTocaban = sesiones.filter((sesion) => sesion.date <= hoyISO);
    const otrasTocaban = otras.filter((sesion) => sesion.date <= hoyISO);
    const total = gymTocaban.length + otrasTocaban.length;

    const hechas =
      gymTocaban.filter((sesion) => sesion.completedAt !== null).length +
      otrasTocaban.filter((sesion) => registradas.has(sesion.date)).length;

    return {
      rutina: total === 0 ? null : Math.round((hechas / total) * 100),
      rutinaDetalle: total === 0 ? null : `${hechas} de ${total} que ya tocaban`,
      // Primero lo medido: las comidas que se confirmaron durante la semana.
      // Si todavía no hay ninguna, se cae a lo que se declaró en el último
      // check-in, que es de donde salía antes.
      dieta:
        datos.comidas?.apego ??
        [...(datos.points ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]?.dietCompliance ??
        null,
      dietaMedida: datos.comidas?.apego !== null && datos.comidas?.apego !== undefined,
      dietaContestadas: datos.comidas?.contestadas ?? 0,
    };
  })();

  /** Los últimos días del reloj para esa métrica, como puntos para la gráfica. */
  function puntosSalud(
    campo: "steps" | "sleepMin" | "hrvMs" | "vo2max",
  ): Array<{ date: string; value: number | null }> {
    return [...(datos.healthDays ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((dia) => ({ date: dia.date, value: dia[campo] ?? null }));
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
  /**
   * Cada panel del tablero, ya resuelto.
   *
   * Dos formatos y no uno estirado: **medio** es un cuadro estándar —ícono,
   * título, número grande, una línea de contexto y, si se pidió, su
   * tendencia— y **ancho** trae contenido que en media pantalla no cabía. Un
   * cuadro chico estirado a toda la pantalla se ve peor que el chico, y eso
   * fue exactamente lo que pasó la primera vez que alguien probó los tamaños.
   *
   * El `switch` vive aquí porque los paneles se alimentan de los datos que la
   * pantalla ya calculó; sacarlo obligaría a pasar veinte props. Lo que sí
   * vive afuera es el catálogo (`lib/paneles.ts`).
   */
  function renderPanel(config: PanelConfig): React.ReactNode {
    const { id, variante, ancho } = config;
    const grande = ancho === "ancho";
    const conTendencia = variante === "detallado";
    const compacto = variante === "compacto";

    /** Cuadro estándar de media pantalla. Todos los chicos se ven igual. */
    function chico(props: {
      icon: typeof Flame;
      tint: string;
      title: string;
      value: string;
      detail?: string | null;
      status?: { label: string; tone: "ok" | "warn" | "alto" | "neutral" } | null;
      serie?: number[];
      onPress?: () => void;
    }) {
      return (
        <ScoreTile
          icon={props.icon}
          tint={props.tint}
          title={props.title}
          value={props.value}
          detail={compacto ? null : props.detail}
          status={props.status ?? null}
          serie={conTendencia ? props.serie : undefined}
          onPress={props.onPress}
        />
      );
    }

    switch (id) {
      case "anillos": {
        const cuerpo = (
          <>
            <View style={styles.heroBody}>
              <ActivityRings rings={rings} size={grande ? 132 : 108} />
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
            </View>

            {/* Recuperación y condición ya no son dos íconos sueltos abajo:
                llevan su número y su lectura, o dicen que falta el dato. Un
                ícono solo no informa nada. */}
            {grande && (
              <View style={styles.extras}>
                <Leyenda
                  icon={HeartPulse}
                  color={colors.error}
                  label="Recuperación"
                  valor={hrv ? `${hrv.value} ms` : "Sin dato"}
                  meta={hrv ? "vs. tu normal de 4 semanas" : "el reloj no la ha subido"}
                  onPress={() => router.push("/salud/recuperacion")}
                />
                <Leyenda
                  icon={ActivityIcon}
                  color={colors.champan}
                  label="Condición"
                  valor={vo2 ? `${vo2.value}` : "Sin dato"}
                  meta={vo2 ? "VO₂ máx" : "necesita entrenos al aire libre"}
                  onPress={() => router.push("/salud/condicion")}
                />
              </View>
            )}
          </>
        );

        return (
          <View style={styles.hero}>
            <View style={styles.heroHead}>
              <Text style={styles.heroTitle}>Tu día</Text>
              <Text style={styles.heroPista}>toca cualquiera para ver su detalle ›</Text>
            </View>
            {!compacto && (
              <Text style={styles.heroCaption}>
                {fecha
                  ? `Último dato del reloj: ${formatDateEs(fecha)}`
                  : "Conecta tu reloj para llenar los anillos"}
              </Text>
            )}
            {cuerpo}
          </View>
        );
      }

      case "perfil":
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu semana vs. lo esperado</Text>
            <Text style={styles.heroCaption}>
              Cada eje contra lo que tocaba a estas alturas
              {objetivoLabel ? `, para tu objetivo de ${objetivoLabel}` : ""}.
            </Text>
            <ChartBoundary label="La telaraña no se pudo dibujar.">
              <RadarChart ejes={grande ? ejes : ejes.slice(0, 6)} size={grande ? 260 : anchoPanel} />
            </ChartBoundary>
          </View>
        );

      case "mes":
        if (metas.medidas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu mes</Text>
            <Text style={styles.heroCaption}>
              Dónde estás hoy y a dónde llega el escalón de este mes, desde tu check-in del{" "}
              {metas.desde}
            </Text>

            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="Las metas del mes no se pudieron dibujar.">
                <GapChart brechas={grande ? brechasDelMes(metas.medidas) : brechasDelMes(metas.medidas).slice(0, 2)} />
              </ChartBoundary>
            </View>

            <Pressable onPress={() => router.push("/glidepath")} hitSlop={6}>
              <Text style={styles.glidepathLink}>Ver todo el camino al objetivo →</Text>
            </Pressable>
          </View>
        );

      case "brecha_objetivo":
        if (brechas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Vs. tu objetivo final</Text>
            <Text style={styles.heroCaption}>
              {objetivoListo
                ? "Sale de comparar tus fotos con tu referencia. Es una lectura por zona, no centímetros: de una foto no salen medidas."
                : "Todavía sin fotos tuyas: esto es el énfasis que pide tu referencia, no tu brecha."}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="La brecha no se pudo dibujar.">
                <GapChart brechas={grande ? brechas : brechas.slice(0, 3)} />
              </ChartBoundary>
            </View>
          </View>
        );

      case "cintura": {
        const serie = serieDe("waistCm");
        const detalle = ultimoCheckIn
          ? `${datos.checkIns?.length ?? 0} check-ins · ${formatDateEs(ultimoCheckIn.date)}`
          : "Tu primer check-in arranca el historial";
        const valor = ultimoCheckIn?.waistCm != null ? `${ultimoCheckIn.waistCm} cm` : "—";

        if (!grande) {
          return chico({
            icon: TrendingUp,
            tint: colors.champan,
            title: "Cintura",
            value: valor,
            detail: detalle,
            serie,
            onPress: () => router.push("/salud/medidas"),
          });
        }

        return (
          <PanelGrande
            icon={TrendingUp}
            tint={colors.champan}
            title="Cintura"
            value={valor}
            detail={detalle}
            onPress={() => router.push("/salud/medidas")}
          >
            <ChartBoundary label="La tendencia no se pudo dibujar.">
              <LineChart
                points={(datos.points ?? []).slice(-10).map((punto) => ({
                  date: punto.date,
                  value: punto.waistCm,
                }))}
                color={colors.champan}
                goal={plan?.meta ?? null}
                format={(valor) => `${valor} cm`}
              />
            </ChartBoundary>
            {plan && <Text style={styles.panelNota}>{textoDeGlidepath(plan)}</Text>}
          </PanelGrande>
        );
      }

      case "checkin": {
        const valor = diasCheckIn === null ? "—" : diasCheckIn === 0 ? "Hoy" : `${diasCheckIn} d`;
        const estado = {
          label: checkInPendiente ? "Toca" : "Al día",
          tone: (checkInPendiente ? "warn" : "ok") as "warn" | "ok",
        };
        const detalle = diasCheckIn === null ? "Nunca has hecho uno" : "desde el último";

        if (!grande) {
          return chico({
            icon: CalendarCheck,
            tint: colors.guindaLight,
            title: "Check-in",
            value: valor,
            detail: detalle,
            status: estado,
            onPress: () => router.push("/checkin"),
          });
        }

        return (
          <PanelGrande
            icon={CalendarCheck}
            tint={colors.guindaLight}
            title="Check-in"
            value={valor}
            detail={detalle}
            status={estado}
            onPress={() => router.push("/checkin")}
          >
            <Text style={styles.panelNota}>
              {datos.me?.profile?.checkinWeekday != null
                ? `Cierras tu semana los ${DIAS_SEMANA[datos.me.profile.checkinWeekday]}${
                    datos.me.profile.checkinHour != null
                      ? ` a las ${datos.me.profile.checkinHour}:00`
                      : ""
                  }.`
                : "Todavía no eliges qué día cierras tu semana. Se configura en Ajustes."}
            </Text>
            <Text style={styles.panelNota}>
              Seis campos: cintura, peso y cuatro escalas. Brazos y piernas van una vez al mes.
            </Text>
          </PanelGrande>
        );
      }

      case "semana": {
        const valor = sesionesTotal === 0 ? "—" : `${sesionesHechas}/${sesionesTotal}`;
        const detalle = sesionesTotal === 0 ? "Sin semana generada" : "sesiones completadas";

        if (!grande) {
          return chico({
            icon: Dumbbell,
            tint: colors.paloRosa,
            title: "Esta semana",
            value: valor,
            detail: detalle,
            onPress: () => router.push("/rutinas"),
          });
        }

        return (
          <PanelGrande
            icon={Dumbbell}
            tint={colors.paloRosa}
            title="Esta semana"
            value={valor}
            detail={detalle}
            onPress={() => router.push("/rutinas")}
          >
            {(datos.week?.sessions ?? []).map((sesion) => (
              <View key={sesion.workoutId} style={styles.filaSemana}>
                <Text style={styles.filaSemanaDia}>{sesion.date.slice(8)}/{sesion.date.slice(5, 7)}</Text>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {sesion.muscleGroup}
                </Text>
                <Text
                  style={[
                    styles.filaSemanaEstado,
                    sesion.completedAt !== null && styles.filaSemanaHecha,
                  ]}
                >
                  {sesion.completedAt !== null ? "hecha" : "pendiente"}
                </Text>
              </View>
            ))}
          </PanelGrande>
        );
      }

      case "disciplinas": {
        const otras = datos.week?.otherSessions ?? [];
        const valor = `${sesionesTotal + otras.length}`;

        if (!grande) {
          return chico({
            icon: Waves,
            tint: colors.paloRosa,
            title: "Tus disciplinas",
            value: valor,
            detail: "sesiones esta semana",
            onPress: () => router.push("/rutinas"),
          });
        }

        return (
          <PanelGrande
            icon={Waves}
            tint={colors.paloRosa}
            title="Tus disciplinas"
            value={valor}
            detail="sesiones esta semana"
            onPress={() => router.push("/rutinas")}
          >
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Pesas</Text>
              <Text style={styles.filaSemanaEstado}>{sesionesTotal} sesiones</Text>
            </View>
            {otras.length === 0 ? (
              <Text style={styles.panelNota}>
                Solo pesas. Agrega otra disciplina en Ajustes y se reparte sola en tu semana.
              </Text>
            ) : (
              Object.entries(
                otras.reduce<Record<string, number>>((cuenta, sesion) => {
                  const nombre = DISCIPLINE_LABELS[sesion.discipline];
                  cuenta[nombre] = (cuenta[nombre] ?? 0) + 1;
                  return cuenta;
                }, {}),
              ).map(([nombre, cuantas]) => (
                <View key={nombre} style={styles.filaSemana}>
                  <Text style={styles.filaSemanaGrupo}>{nombre}</Text>
                  <Text style={styles.filaSemanaEstado}>{cuantas} sesiones</Text>
                </View>
              ))
            )}
          </PanelGrande>
        );
      }

      case "cumplimiento": {
        const valor = cumplimiento.rutina === null ? "—" : `${cumplimiento.rutina} %`;
        const detalle = "de tu rutina, con lo ya registrado";

        if (!grande) {
          return chico({
            icon: ClipboardCheck,
            tint: colors.champan,
            title: "Cumplimiento",
            value: valor,
            detail: detalle,
            onPress: () => router.push("/checkin"),
          });
        }

        return (
          <PanelGrande
            icon={ClipboardCheck}
            tint={colors.champan}
            title="Cumplimiento"
            value={valor}
            detail={detalle}
            onPress={() => router.push("/checkin")}
          >
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Rutina</Text>
              <Text style={styles.filaSemanaEstado}>
                {cumplimiento.rutinaDetalle ?? "sin semana generada"}
              </Text>
            </View>
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Dieta</Text>
              <Text style={styles.filaSemanaEstado}>
                {cumplimiento.dieta === null
                  ? "sin datos todavía"
                  : cumplimiento.dietaMedida
                    ? `${cumplimiento.dieta} % · ${cumplimiento.dietaContestadas} comidas confirmadas`
                    : `${cumplimiento.dieta} % en tu último check-in`}
              </Text>
            </View>
            <Text style={styles.panelNota}>
              {cumplimiento.dietaMedida
                ? "Los dos se cuentan solos: la rutina con lo que cierras en la app y sube el reloj, y la dieta con las comidas que confirmas desde el aviso."
                : "La rutina se cuenta sola. Para que la dieta también, confirma tus comidas desde Hoy o desde el aviso que llega a su hora."}
            </Text>
          </PanelGrande>
        );
      }

      case "racha": {
        const detalle =
          streak === 0
            ? "Hoy cuenta para empezar"
            : best > streak
              ? `días · tu mejor: ${best}`
              : "días entrenando seguido";

        if (!grande) {
          return chico({ icon: Flame, tint: colors.champan, title: "Racha", value: `${streak}`, detail: detalle });
        }

        return (
          <PanelGrande icon={Flame} tint={colors.champan} title="Racha" value={`${streak}`} detail={detalle}>
            <Text style={styles.panelNota}>
              Tu mejor racha son {best} {best === 1 ? "día" : "días"}. Cuenta cualquier sesión
              registrada, de gimnasio o de otra disciplina.
            </Text>
          </PanelGrande>
        );
      }

      case "estudios": {
        const valor = ultimoLab ? formatDateEs(ultimoLab.takenOn) : "—";
        const detalle = ultimoLab
          ? `${ultimoLab.values.length} valores · ${ultimoLab.kind === "INBODY" ? "bioimpedancia" : "química"}`
          : "Todavía sin estudios cargados";
        const estado =
          ultimoLab && ultimoLab.outsideRange.length > 0
            ? { label: "Revisar", tone: "warn" as const }
            : null;

        if (!grande) {
          return chico({
            icon: FlaskConical,
            tint: colors.guindaLight,
            title: "Tus estudios",
            value: valor,
            detail: detalle,
            status: estado,
            onPress: () => router.push("/laboratorios"),
          });
        }

        return (
          <PanelGrande
            icon={FlaskConical}
            tint={colors.guindaLight}
            title="Tus estudios"
            value={valor}
            detail={detalle}
            status={estado}
            onPress={() => router.push("/laboratorios")}
          >
            {(ultimoLab?.values ?? []).slice(0, 5).map((dato) => (
              <View key={dato.key} style={styles.filaSemana}>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {dato.label}
                </Text>
                <Text style={styles.filaSemanaEstado}>
                  {dato.value} {dato.unit}
                </Text>
              </View>
            ))}
            <Text style={styles.panelNota}>
              Se guardan y se grafican. La app no los interpreta: lo que salga fuera del rango de
              tu laboratorio lo revisa un médico.
            </Text>
          </PanelGrande>
        );
      }

      case "plan": {
        const valor = datos.decision ? `${datos.decision.kcal}` : "—";
        const detalle = datos.decision
          ? `kcal · ${datos.decision.phase.replace(/_/g, " ").toLowerCase()}`
          : "Sin decisión publicada";

        if (!grande) {
          return chico({
            icon: Flame,
            tint: colors.paloRosa,
            title: "Tu plan",
            value: valor,
            detail: detalle,
            onPress: () => router.push("/nutricion"),
          });
        }

        return (
          <PanelGrande
            icon={Flame}
            tint={colors.paloRosa}
            title="Tu plan"
            value={valor}
            detail={detalle}
            onPress={() => router.push("/nutricion")}
          >
            {datos.decision ? (
              <View style={styles.macros}>
                <Macro label="Proteína" valor={`${datos.decision.proteinG} g`} />
                <Macro label="Carbohidratos" valor={`${datos.decision.carbsG} g`} />
                <Macro label="Grasas" valor={`${datos.decision.fatG} g`} />
              </View>
            ) : (
              <Text style={styles.panelNota}>
                Tu primera decisión sale de tu primer check-in.
              </Text>
            )}
          </PanelGrande>
        );
      }

      case "objetivo": {
        const valor =
          objetivoEstado === "listo"
            ? "Listo"
            : objetivoEstado === "en_espera"
              ? "En análisis"
              : "Pendiente";
        const detalle =
          datos.goal && "references" in datos.goal.status
            ? `${datos.goal.status.references} referencias`
            : "Sube tus fotos de referencia";

        if (!grande) {
          return chico({
            icon: Target,
            tint: colors.guindaLight,
            title: "Objetivo",
            value: valor,
            detail: detalle,
            onPress: () => router.push("/objetivo"),
          });
        }

        return (
          <PanelGrande
            icon={Target}
            tint={colors.guindaLight}
            title="Objetivo"
            value={valor}
            detail={detalle}
            onPress={() => router.push("/objetivo")}
          >
            <Text style={styles.panelNota}>
              La referencia es dirección, no promesa: se comparan proporciones, nunca identidades.
            </Text>
          </PanelGrande>
        );
      }

      case "records": {
        const detalle = ultimoPr
          ? `último: ${ultimoPr.exerciseName} ${ultimoPr.weightKg} kg`
          : "Cierra sesiones para tener PRs";

        if (!grande) {
          return chico({
            icon: Trophy,
            tint: colors.champan,
            title: "Récords",
            value: `${prs.length}`,
            detail: detalle,
            onPress: () => router.push("/historial"),
          });
        }

        return (
          <PanelGrande
            icon={Trophy}
            tint={colors.champan}
            title="Récords"
            value={`${prs.length}`}
            detail={detalle}
            onPress={() => router.push("/historial")}
          >
            {prs.slice(0, 5).map((record) => (
              <View key={record.exerciseName} style={styles.filaSemana}>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {record.exerciseName}
                </Text>
                <Text style={styles.filaSemanaEstado}>
                  {record.weightKg} kg × {record.reps}
                </Text>
              </View>
            ))}
          </PanelGrande>
        );
      }

      case "peso":
        return metricaSimple({
          grande,
          icon: TrendingUp,
          tint: colors.paloRosa,
          title: "Peso",
          value: ultimoCheckIn?.weightKg != null ? `${ultimoCheckIn.weightKg} kg` : "—",
          detail: "de tu último check-in",
          serie: serieDe("weightKg"),
          puntos: (datos.points ?? []).slice(-10).map((punto) => ({ date: punto.date, value: punto.weightKg })),
          formato: (valor: number) => `${valor} kg`,
          ruta: "/salud/medidas",
        });

      case "pasos":
        return metricaSimple({
          grande,
          icon: Footprints,
          tint: colors.champan,
          title: "Pasos",
          value: pasos ? pasos.value.toLocaleString("es-MX") : "—",
          detail: `de ${PASOS_META.toLocaleString("es-MX")}`,
          serie: serieSalud("steps"),
          puntos: puntosSalud("steps"),
          formato: (valor: number) => `${Math.round(valor)}`,
          ruta: "/salud/pasos",
        });

      case "sueno":
        return metricaSimple({
          grande,
          icon: Moon,
          tint: colors.paloRosa,
          title: "Sueño",
          value: sueno ? formatSleep(sueno.value) : "—",
          detail: `de ${formatSleep(SUENO_META_MIN)}`,
          serie: serieSalud("sleepMin"),
          puntos: puntosSalud("sleepMin"),
          formato: (valor: number) => formatSleep(valor),
          ruta: "/salud/descanso",
        });

      case "recuperacion":
        return metricaSimple({
          grande,
          icon: HeartPulse,
          tint: colors.error,
          title: "Recuperación",
          value: hrv ? `${hrv.value}` : "—",
          detail: "ms de variabilidad",
          serie: serieSalud("hrvMs"),
          puntos: puntosSalud("hrvMs"),
          formato: (valor: number) => `${Math.round(valor)} ms`,
          ruta: "/salud/recuperacion",
        });

      case "condicion":
        return metricaSimple({
          grande,
          icon: ActivityIcon,
          tint: colors.champan,
          title: "Condición",
          value: vo2 ? `${vo2.value}` : "—",
          detail: "VO₂ máx",
          serie: serieSalud("vo2max"),
          puntos: puntosSalud("vo2max"),
          formato: (valor: number) => `${valor}`,
          ruta: "/salud/condicion",
        });

      default:
        return null;
    }

    /** Métrica de una sola serie: el mismo molde para las cinco del reloj. */
    function metricaSimple(props: {
      grande: boolean;
      icon: typeof Flame;
      tint: string;
      title: string;
      value: string;
      detail: string;
      serie: number[];
      puntos: Array<{ date: string; value: number | null }>;
      formato: (valor: number) => string;
      ruta: string;
    }): React.ReactNode {
      if (!props.grande) {
        return chico({
          icon: props.icon,
          tint: props.tint,
          title: props.title,
          value: props.value,
          detail: props.detail,
          serie: props.serie,
          onPress: () => router.push(props.ruta as never),
        });
      }

      return (
        <PanelGrande
          icon={props.icon}
          tint={props.tint}
          title={props.title}
          value={props.value}
          detail={props.detail}
          onPress={() => router.push(props.ruta as never)}
        >
          <ChartBoundary label="La tendencia no se pudo dibujar.">
            <LineChart points={props.puntos} color={props.tint} format={props.formato} />
          </ChartBoundary>
        </PanelGrande>
      );
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

const DIAS_SEMANA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

function Macro({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValor}>{valor}</Text>
    </View>
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
  heroHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  // La pista de que los anillos son tocables: sin ella nadie descubre que
  // cada uno lleva a su detalle.
  heroPista: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosaLight },
  panelNota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  filaSemana: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  filaSemanaDia: {
    width: 52,
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    fontVariant: ["tabular-nums"],
  },
  filaSemanaGrupo: { flex: 1, fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
  filaSemanaEstado: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  filaSemanaHecha: { color: colors.champan, fontFamily: fonts.sansSemiBold },
  macros: { flexDirection: "row", gap: spacing.lg },
  macro: { gap: 2 },
  macroLabel: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.paloRosa },
  macroValor: { fontFamily: fonts.sansBold, ...typeScale.subheading, color: colors.marfil },
  // Una fila del tablero: hasta dos paneles de media pantalla. Los de ancho
  // completo no pasan por aquí, van sueltos y cortan la retícula.
  filaMosaico: { flexDirection: "row", gap: spacing.md, alignItems: "stretch" },
  mitadMosaico: { flex: 1 },
});
