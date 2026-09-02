import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ChartBoundary } from "@/components/ChartBoundary";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { LineChart } from "@/components/LineChart";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  getActivities,
  getHistoryTraining,
  type Activity,
  type Discipline,
  type HistoryTrainingResponse,
  type PersonalRecord,
  type TrainingHistoryRow,
} from "@/lib/api";
import {
  GOLF_PRACTICE_KINDS,
  getGolf,
  type GolfAgregados,
  type GolfPracticeKind,
  type GolfResponse,
  type GolfRonda,
} from "@/lib/api-golf";
import { iconoDe } from "@/lib/disciplinas";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La hoja de zoom de una disciplina: el "entra aquí" del renglón compacto
 * que dejó `PanelResumen` (case "avance_disciplinas").
 *
 * EL PEDIDO que la origina: el desglose del panel traía GIR%, putts, volumen
 * y minutos amontonados en cada renglón — "colapsa los detalles: que
 * aparezcan como scorecards y de ahí que cada uno te lleve a una hoja nueva
 * limpia". El renglón se quedó con un ícono, un nombre, un número y una
 * flecha; todo lo demás se mudó aquí, una pantalla por disciplina, con sus
 * propios agregados y su propio historial — no una ficha genérica que
 * intenta servir para las nueve a la vez.
 *
 * Golf y pesas tienen endpoint y forma propios (`getGolf`, `getHistoryTraining`),
 * así que cada una arma su sección a mano. El resto de las disciplinas
 * comparte una sola fuente (`getActivities`), así que comparten una sola
 * sección genérica de sesiones y minutos por quincena.
 */

const KIND_LABELS: Record<GolfPracticeKind, string> = {
  RANGE: "Range",
  JUEGO_CORTO: "Juego corto",
  PUTTING: "Putting",
};

function textoTendencia(tendencia: GolfAgregados["tendencia"]): string {
  if (tendencia === "MEJORANDO") return "Mejorando";
  if (tendencia === "EMPEORANDO") return "Empeorando";
  if (tendencia === "ESTABLE") return "Estable";
  return "—";
}

/** Días completos entre una fecha yyyy-MM-dd y hoy, en UTC — mismo criterio
 * que `diasDesde` en `PanelResumen.tsx`, duplicado a propósito: cada
 * pantalla de la app calcula su propio "hace cuánto" en vez de importar de
 * un componente ajeno (ver `todayISO`/`dayLabel` repetidos en golf.tsx y
 * actividad.tsx). */
function diasDesdeHoy(fecha: string): number {
  const desde = Date.parse(`${fecha}T12:00:00.000Z`);
  const hoy = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);
  return Math.round((hoy - desde) / 86_400_000);
}

/**
 * Volumen por bloques de 7 días hacia atrás desde hoy, del más viejo al más
 * reciente — lo que pide `LineChart`. Una semana sin sesiones vale 0, no
 * `null`: es un dato real (no se entrenó), no un hueco de medición.
 */
function volumenPorSemana(
  sesiones: TrainingHistoryRow[],
  semanas: number,
): Array<{ date: string; value: number | null }> {
  const buckets = Array.from({ length: semanas }, () => 0);
  sesiones.forEach((sesion) => {
    const semana = Math.floor(diasDesdeHoy(sesion.date) / 7);
    if (semana >= 0 && semana < semanas) buckets[semana] += sesion.volumeKg;
  });
  // buckets[0] es esta semana; LineChart lee de izquierda (viejo) a derecha (hoy).
  return buckets.map((valor, indice) => ({ date: `s${indice}`, value: valor })).reverse();
}

type Quincena = { etiqueta: string; sesiones: number; minutos: number };

/** Sesiones y minutos en bloques de 15 días hacia atrás desde hoy. */
function porQuincena(actividades: Activity[], cantidad: number): Quincena[] {
  return Array.from({ length: cantidad }, (_, indice) => {
    const desde = indice * 15;
    const hasta = desde + 15;
    const enRango = actividades.filter((actividad) => {
      const dias = diasDesdeHoy(actividad.date);
      return dias >= desde && dias < hasta;
    });
    return {
      etiqueta: indice === 0 ? "Últimos 15 días" : `Hace ${desde}-${hasta} días`,
      sesiones: enRango.length,
      minutos: enRango.reduce((suma, actividad) => suma + actividad.durationMin, 0),
    };
  });
}

export default function AvanceDisciplinaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ disciplina?: string }>();
  // Un valor desconocido (ruta vieja, link roto, `as never` mal usado en
  // otro lado) no truena la pantalla: se queda sin disciplina y pinta el
  // estado vacío de abajo.
  const disciplina = (DISCIPLINES as readonly string[]).includes(params.disciplina ?? "")
    ? (params.disciplina as Discipline)
    : null;

  const esGolf = disciplina === "GOLF";
  const esPesas = disciplina === "PESAS";
  const esActividad = disciplina !== null && !esGolf && !esPesas;

  const [golf, setGolf] = useState<GolfResponse | null>(null);
  const [pesas, setPesas] = useState<HistoryTrainingResponse | null>(null);
  const [actividades, setActividades] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (disciplina === null) return;
    try {
      if (esGolf) {
        setGolf(await getGolf());
      } else if (esPesas) {
        setPesas(await getHistoryTraining());
      } else {
        const respuesta = await getActivities();
        setActividades(respuesta.actividades.filter((actividad) => actividad.discipline === disciplina));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu avance");
    }
  }, [disciplina, esGolf, esPesas]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const Icono = disciplina ? iconoDe(disciplina) : null;
  const cargando =
    disciplina !== null &&
    !error &&
    ((esGolf && golf === null) || (esPesas && pesas === null) || (esActividad && actividades === null));

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

        <View style={styles.titleRow}>
          {Icono && <Icono size={26} color={colors.champan} strokeWidth={2} />}
          <Text style={styles.title}>
            {disciplina ? DISCIPLINE_LABELS[disciplina] : "Disciplina"}
          </Text>
        </View>

        {disciplina === null && (
          <EmptyState message="No reconocemos esta disciplina. Vuelve al Resumen y toca un renglón desde ahí." />
        )}

        {disciplina !== null && error && <ErrorState message={error} onRetry={load} />}

        {disciplina !== null && !error && cargando && <LoadingState label="Cargando tu avance..." />}

        {!cargando && !error && esGolf && golf && (
          <SeccionGolf golf={golf} colors={colors} styles={styles} onRegistrar={() => router.push("/golf" as never)} />
        )}

        {!cargando && !error && esPesas && pesas && (
          <SeccionPesas
            historia={pesas}
            colors={colors}
            styles={styles}
            onVerHistorial={() => router.push("/historial" as never)}
          />
        )}

        {!cargando && !error && esActividad && actividades && disciplina && (
          <SeccionActividad
            discipline={disciplina}
            actividades={actividades}
            colors={colors}
            styles={styles}
            onRegistrar={() => router.push(`/actividad?discipline=${disciplina}` as never)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Golf: agregados completos, histórico de rondas, balance de práctica.
// ---------------------------------------------------------------------------

function SeccionGolf({
  golf,
  colors,
  styles,
  onRegistrar,
}: {
  golf: GolfResponse;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  onRegistrar: () => void;
}) {
  const { agregados, rondas, practicas } = golf;

  if (agregados.rondas === 0) {
    return (
      <>
        <EmptyState message="Registra tu primera ronda y aquí vas a ver tus agregados, tu histórico y tu balance de práctica." />
        <PrimaryButton label="Registrar en golf" onPress={onRegistrar} />
      </>
    );
  }

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <SectionLabel>Tus números</SectionLabel>
          <InfoTip titulo="Cómo se leen">
            <TextoInfo>
              GIR (greens en regulación) y FIR (fairways en regulación) son llegar al green o al
              fairway en el golpe que toca. El diferencial es tu score ajustado a la dificultad del
              campo, no el score crudo.
            </TextoInfo>
            <TextoInfo>
              La tendencia compara tus últimas 5 rondas contra las 5 anteriores. Con menos historial
              se queda sin flecha, en vez de inventar una.
            </TextoInfo>
          </InfoTip>
        </View>
        <View style={styles.statsGrid}>
          <Stat
            label="Score últ. 5"
            value={
              agregados.scoreVsPar.ultimas5 === null
                ? "—"
                : `${agregados.scoreVsPar.ultimas5 > 0 ? "+" : ""}${agregados.scoreVsPar.ultimas5}`
            }
            styles={styles}
          />
          <Stat
            label="Score total"
            value={
              agregados.scoreVsPar.todas === null
                ? "—"
                : `${agregados.scoreVsPar.todas > 0 ? "+" : ""}${agregados.scoreVsPar.todas}`
            }
            styles={styles}
          />
          <Stat label="Tendencia" value={textoTendencia(agregados.tendencia)} styles={styles} />
          <Stat label="GIR" value={agregados.girPct === null ? "—" : `${agregados.girPct}%`} styles={styles} />
          {agregados.firPct !== null && (
            <Stat label="FIR" value={`${agregados.firPct}%`} styles={styles} />
          )}
          <Stat
            label="Putts"
            value={agregados.puttsPromedio === null ? "—" : `${agregados.puttsPromedio}`}
            styles={styles}
          />
          <Stat
            label="Castigos"
            value={agregados.castigosPromedio === null ? "—" : `${agregados.castigosPromedio}`}
            styles={styles}
          />
          {agregados.diferencial !== null && (
            <Stat label="Diferencial" value={`${agregados.diferencial}`} styles={styles} />
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <SectionLabel>Histórico de rondas</SectionLabel>
        <View style={styles.list}>
          {rondas.map((ronda) => (
            <FilaRonda key={ronda.id} ronda={ronda} styles={styles} />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <SectionLabel>Balance de práctica</SectionLabel>
          <InfoTip titulo="Balance de práctica">
            <TextoInfo>
              El juego corto y el putting concentran ~60% de los golpes de una ronda amateur y
              suelen recibir una fracción de las horas de práctica frente al range. Este balance es
              para ver si tu tiempo va donde de verdad se fuga el score.
            </TextoInfo>
          </InfoTip>
        </View>
        {practicas.length === 0 || agregados.practica.totalMinutos === 0 ? (
          <EmptyState message="Registra una sesión de práctica para ver tu balance por tipo." />
        ) : (
          <View style={styles.list}>
            {GOLF_PRACTICE_KINDS.map((tipo) => {
              const minutos = agregados.practica.balancePorTipo[tipo] ?? 0;
              const porcentaje = Math.round((minutos / agregados.practica.totalMinutos) * 100);
              return (
                <View key={tipo} style={styles.filaHistorico}>
                  <Text style={styles.filaNombre}>{KIND_LABELS[tipo]}</Text>
                  <Text style={styles.filaValor}>
                    {minutos} min · {porcentaje}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <PrimaryButton label="Registrar en golf" onPress={onRegistrar} />
    </>
  );
}

function FilaRonda({ ronda, styles }: { ronda: GolfRonda; styles: ReturnType<typeof makeStyles> }) {
  const vsPar = ronda.par !== null && ronda.par !== undefined ? ronda.score - ronda.par : null;
  return (
    <View style={styles.filaHistorico}>
      <View style={styles.filaHistoricoTexto}>
        <Text style={styles.filaNombre}>{ronda.course?.trim() ? ronda.course : "Sin campo"}</Text>
        <Text style={styles.filaDetalle}>
          {ronda.date.slice(5)} · {ronda.holes} hoyos
        </Text>
      </View>
      <View style={styles.filaHistoricoDerecha}>
        <Text style={styles.filaValor}>{vsPar === null ? ronda.score : `${vsPar > 0 ? "+" : ""}${vsPar}`}</Text>
        {ronda.putts !== null && ronda.putts !== undefined && (
          <Text style={styles.filaDetalle}>{ronda.putts} putts</Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pesas: volumen por semana, PRs recientes, últimas sesiones.
// ---------------------------------------------------------------------------

const SEMANAS_VOLUMEN = 8;

function SeccionPesas({
  historia,
  colors,
  styles,
  onVerHistorial,
}: {
  historia: HistoryTrainingResponse;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  onVerHistorial: () => void;
}) {
  const cerradas = historia.sessions.filter((sesion) => sesion.completed);

  if (cerradas.length === 0) {
    return <EmptyState message="Cierra tu primera sesión de pesas y aquí vas a ver tu volumen semana a semana." />;
  }

  const semanas = volumenPorSemana(cerradas, SEMANAS_VOLUMEN);
  const semanaActual = semanas[semanas.length - 1]?.value ?? 0;
  const semanaPrevia = semanas[semanas.length - 2]?.value ?? 0;
  const delta =
    semanaPrevia > 0 ? Math.round(((semanaActual - semanaPrevia) / semanaPrevia) * 100) : null;

  const prsRecientes: PersonalRecord[] = [...historia.records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const ultimasSesiones = [...cerradas].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <SectionLabel>Volumen por semana</SectionLabel>
          <InfoTip titulo="Volumen por semana">
            <TextoInfo>
              Suma peso × repeticiones de tus sesiones cerradas, en bloques de 7 días hacia atrás
              desde hoy. Una semana sin sesiones se ve como 0, no como un hueco: sí entrenaste esa
              semana, o no.
            </TextoInfo>
          </InfoTip>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <ChartBoundary label="El volumen no se pudo dibujar.">
            <LineChart
              points={semanas}
              color={colors.paloRosa}
              format={(valor) => `${Math.round(valor).toLocaleString("es-MX")} kg`}
            />
          </ChartBoundary>
        </View>
        <Text style={styles.nota}>
          Esta semana: {Math.round(semanaActual ?? 0).toLocaleString("es-MX")} kg
          {delta !== null ? ` · ${delta > 0 ? "+" : ""}${delta}% vs. la semana pasada` : ""}
        </Text>
      </Card>

      {prsRecientes.length > 0 && (
        <Card style={styles.card}>
          <SectionLabel color={colors.champan}>PRs recientes</SectionLabel>
          <View style={styles.list}>
            {prsRecientes.map((record) => (
              <View key={record.exerciseName} style={styles.filaHistorico}>
                <Text style={styles.filaNombre} numberOfLines={1}>
                  {record.exerciseName}
                </Text>
                <Text style={styles.filaValor}>
                  {record.weightKg} kg × {record.reps}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card style={styles.card}>
        <SectionLabel>Últimas sesiones</SectionLabel>
        <View style={styles.list}>
          {ultimasSesiones.map((sesion) => (
            <View key={sesion.workoutId} style={styles.filaHistorico}>
              <View style={styles.filaHistoricoTexto}>
                <Text style={styles.filaNombre}>{sesion.muscleGroup}</Text>
                <Text style={styles.filaDetalle}>
                  {sesion.date.slice(5)} · {sesion.sets} series
                  {sesion.prs.length > 0 ? ` · ${sesion.prs.length} PR` : ""}
                </Text>
              </View>
              <Text style={styles.filaValor}>{sesion.volumeKg.toLocaleString("es-MX")} kg</Text>
            </View>
          ))}
        </View>
      </Card>

      <Pressable onPress={onVerHistorial} hitSlop={8}>
        <Text style={styles.link}>Ver tu historial completo →</Text>
      </Pressable>
    </>
  );
}

// ---------------------------------------------------------------------------
// Resto de disciplinas: sesiones y minutos por quincena, últimas actividades.
// ---------------------------------------------------------------------------

const QUINCENAS = 4;

function SeccionActividad({
  discipline,
  actividades,
  colors,
  styles,
  onRegistrar,
}: {
  discipline: Discipline;
  actividades: Activity[];
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  onRegistrar: () => void;
}) {
  if (actividades.length === 0) {
    return (
      <>
        <EmptyState
          message={`Registra tu primera sesión de ${DISCIPLINE_LABELS[discipline].toLowerCase()} y aquí vas a ver tu avance por quincena.`}
        />
        <PrimaryButton label="Registrar sesión" onPress={onRegistrar} />
      </>
    );
  }

  const quincenas = porQuincena(actividades, QUINCENAS);
  const ultimas = [...actividades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <SectionLabel>Por quincena</SectionLabel>
          <InfoTip titulo="Por quincena">
            <TextoInfo>
              Cada bloque son 15 días hacia atrás desde hoy: cuántas sesiones y cuántos minutos
              sumaste en ese tramo.
            </TextoInfo>
          </InfoTip>
        </View>
        <View style={styles.list}>
          {quincenas.map((quincena) => (
            <View key={quincena.etiqueta} style={styles.filaHistorico}>
              <Text style={styles.filaNombre}>{quincena.etiqueta}</Text>
              <Text style={styles.filaValor}>
                {quincena.sesiones} {quincena.sesiones === 1 ? "sesión" : "sesiones"} · {quincena.minutos} min
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <SectionLabel>Últimas actividades</SectionLabel>
        <View style={styles.list}>
          {ultimas.map((actividad) => (
            <View key={actividad.id} style={styles.filaHistorico}>
              <Text style={styles.filaFecha}>{actividad.date.slice(5)}</Text>
              <Text style={[styles.filaNombre, { flex: 1 }]} numberOfLines={1}>
                {actividad.notes?.trim() ? actividad.notes : DISCIPLINE_LABELS[actividad.discipline]}
              </Text>
              <Text style={styles.filaValor}>{actividad.durationMin} min</Text>
            </View>
          ))}
        </View>
      </Card>

      <PrimaryButton label="Registrar sesión" onPress={onRegistrar} />
    </>
  );
}

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: -spacing.xs,
    },
    title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    card: { gap: spacing.md },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    stat: { flexGrow: 1, minWidth: 76, alignItems: "center", gap: 2 },
    statValue: { fontFamily: fonts.display, ...typeScale.heading, color: colors.marfil },
    statLabel: {
      fontFamily: fonts.sansMedium,
      ...typeScale.label,
      color: colors.paloRosa,
      textAlign: "center",
    },
    list: { gap: spacing.xs },
    filaHistorico: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    filaHistoricoTexto: { flex: 1, gap: 1 },
    filaHistoricoDerecha: { alignItems: "flex-end", gap: 1 },
    filaNombre: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    filaDetalle: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosa },
    filaValor: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.champan },
    filaFecha: {
      width: 44,
      fontFamily: fonts.sansMedium,
      ...typeScale.bodySm,
      color: colors.paloRosaLight,
      fontVariant: ["tabular-nums"],
    },
    nota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    link: {
      alignSelf: "center",
      fontFamily: fonts.serifItalic,
      ...typeScale.subheading,
      color: colors.paloRosaLight,
      paddingVertical: spacing.md,
    },
  });
