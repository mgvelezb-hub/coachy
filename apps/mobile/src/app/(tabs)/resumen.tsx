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
import { PanelResumen, type VistaResumen } from "@/components/PanelResumen";
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
import { getGolf, type GolfResponse } from "@/lib/api-golf";
import { bestStreak, currentStreak, todayISO, trainingDays } from "@/lib/streak";
import {
  GOAL_LABEL,
  PASOS_META,
  SUENO_META_MIN,
  formatSleep,
  type Goal,
} from "@/lib/insights";
import { brechasDeObjetivo, enfasisDeObjetivo, perfilDeEjes } from "@/lib/perfil";
import { layoutPorDefecto, sanearLayout, type PanelConfig } from "@/lib/paneles";
import { brechasDelMes, metasDelMes } from "@/lib/metas";
import { glidepathDeCintura, textoDeGlidepath } from "@/lib/glidepath";
import { metaDeHoy } from "@/lib/plan-ejercicio";
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
  /** Agregados de golf (`getGolf()`) — `null` si el fetch falló, no si no hay rondas. */
  golf: GolfResponse | null;
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
    const [
      historyRes,
      checkinsRes,
      healthRes,
      activitiesRes,
      week,
      goal,
      decisionRes,
      measurementsRes,
      me,
      golf,
    ] = await Promise.all([
      safeFetch(getHistoryTraining()),
      safeFetch(getCheckins()),
      safeFetch(getHealthDays()),
      safeFetch(getActivities()),
      safeFetch(getTrainingWeek()),
      safeFetch(getGoal()),
      safeFetch(getDecision()),
      safeFetch(getHistoryMeasurements()),
      safeFetch(getMe()),
      // Solo la alimenta el panel "Avance por disciplina" y solo dice algo
      // para quien juega golf, pero se pide igual que el resto de fuentes: el
      // Resumen no sabe, al cargar, qué paneles trae acomodados cada quien.
      safeFetch(getGolf()),
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
      golf,
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

  // La meta del anillo de Ejercicio sale del PLAN DEL DÍA, no de un número
  // fijo: 30 min es la guía general de actividad, pero a quien entrena de
  // verdad —pesas más otra disciplina— le puede tocar el triple. Con la
  // guía fija, esa persona cierra el anillo con el calentamiento y el resto
  // del día el anillo miente. Ver `lib/plan-ejercicio.ts` para el orden de
  // fuentes (declarado en Ajustes > sesiones de hoy > día de descanso).
  const metaEjercicioHoy = metaDeHoy({
    timePerDay: data.me?.profile?.timePerDay,
    hoyISO: todayISO(),
    week: data.week,
  });

  const rings: Ring[] = [
    { label: "Pasos", value: pasos?.value ?? null, goal: PASOS_META, color: colors.champan },
    { label: "Ejercicio", value: ejercicio?.value ?? null, goal: metaEjercicioHoy.minutos, color: colors.guindaLight },
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
  /**
   * Todo lo que un panel necesita, ya calculado una sola vez.
   *
   * Se arma aquí y se pasa entero al componente para que pintarlo dos veces
   * —en el tablero y en el editor— no cueste dos cargas.
   */
  const vista: VistaResumen = {
    datos,
    pasos,
    ejercicio,
    sueno,
    hrv,
    vo2,
    fecha,
    rings,
    ejes,
    metas,
    brechas,
    plan,
    ultimoCheckIn,
    diasCheckIn,
    checkInPendiente,
    sesionesTotal,
    sesionesHechas,
    streak,
    best,
    prs,
    ultimoPr,
    objetivoEstado,
    objetivoListo,
    objetivoLabel,
    anchoPanel,
    ultimoLab,
    cumplimiento,
    serieDe,
    serieSalud,
    puntosSalud,
    formatDateEs,
  };

  // Los `mini` se emparejan de dos en dos; `compacta` y `completa` ocupan su
  // propio renglón. El acomodo del editor se respeta tal cual: nada se cuela a
  // media retícula.
  const filas: Array<{ mini: boolean; paneles: PanelConfig[] }> = [];
  for (const config of layout) {
    if (config.tamano !== "mini") {
      filas.push({ mini: false, paneles: [config] });
      continue;
    }

    const ultima = filas[filas.length - 1];
    if (ultima && ultima.mini && ultima.paneles.length < 2) {
      ultima.paneles.push(config);
    } else {
      filas.push({ mini: true, paneles: [config] });
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
            key={`${fila.paneles.map((panel) => panel.id).join("-")}-${index}`}
            style={fila.mini ? styles.filaMosaico : undefined}
          >
            {fila.paneles.map((config) => (
              <View key={config.id} style={fila.mini ? styles.mitadMosaico : undefined}>
                <PanelResumen config={config} vista={vista} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <EditorDePaneles
        visible={editando}
        layout={layout}
        vista={vista}
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
