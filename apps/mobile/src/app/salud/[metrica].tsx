import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, ChevronLeft, Footprints, HeartPulse, Moon, Ruler, Timer } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getCheckins,
  getHealthDays,
  getMe,
  type CheckInRow,
  type HealthDayPayload,
  type MeResponse,
} from "@/lib/api";
import { ChartBoundary } from "@/components/ChartBoundary";
import { LineChart, type Punto } from "@/components/LineChart";
import {
  EJERCICIO_META_MIN,
  PASOS_META,
  SUENO_META_MIN,
  exerciseInsight,
  fitnessInsight,
  formatSleep,
  measuresInsight,
  recoveryInsight,
  sleepInsight,
  stepsInsight,
  type Insight,
  type Trend,
} from "@/lib/insights";
import {
  fonts,
  radius,
  spacing,
  type as typeScale,
  withAlpha,
  type Palette,
} from "@/lib/theme";

/**
 * Detalle de una métrica de salud: `/salud/pasos`, `/salud/descanso`,
 * `/salud/medidas`.
 *
 * Las tres viven en la misma pantalla porque comparten forma —número grande,
 * lectura, historial— y se alimentan de las mismas dos llamadas. Lo único que
 * cambia por métrica es de dónde sale la serie y cómo se formatea, y eso vive
 * en `SERIES` aquí abajo; la lectura ("¿esto va hacia mi objetivo?") vive en
 * `lib/insights.ts`, aparte y pura.
 */

const METRICAS = ["pasos", "ejercicio", "descanso", "recuperacion", "condicion", "medidas"] as const;
type Metrica = (typeof METRICAS)[number];

function esMetrica(value: string | undefined): value is Metrica {
  return METRICAS.includes(value as Metrica);
}

/** Días que se listan. Dos semanas: una para leer, otra para comparar. */
const DIAS_VISIBLES = 14;

type Data = {
  me: MeResponse;
  days: HealthDayPayload[];
  checkIns: CheckInRow[];
};

export default function DetalleMetricaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { metrica } = useLocalSearchParams<{ metrica: string }>();

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, healthRes, checkinsRes] = await Promise.all([
        getMe(),
        getHealthDays().catch(() => null),
        getCheckins().catch(() => null),
      ]);
      setData({ me, days: healthRes?.dias ?? [], checkIns: checkinsRes?.checkIns ?? [] });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el detalle");
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

  if (!esMetrica(metrica)) {
    return <ErrorState message="Esa métrica no existe." onRetry={() => router.back()} />;
  }
  if (!data && !error) return <LoadingState label="Cargando tu detalle..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const goal = data.me.profile?.goal ?? "SALUD";

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

        {metrica === "pasos" && <Pasos days={data.days} goal={goal} />}
        {metrica === "ejercicio" && <Ejercicio days={data.days} goal={goal} />}
        {metrica === "descanso" && <Descanso days={data.days} goal={goal} />}
        {metrica === "recuperacion" && <Recuperacion days={data.days} goal={goal} />}
        {metrica === "condicion" && <Condicion days={data.days} />}
        {metrica === "medidas" && <Medidas checkIns={data.checkIns} goal={goal} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

function Pasos({ days, goal }: { days: HealthDayPayload[]; goal: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = stepsInsight(days, goal);

  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DIAS_VISIBLES);
  const conPasos = ordenados.filter((day) => day.steps != null);
  const ultimo = conPasos[0]?.steps ?? null;
  const kcal = promedioDe(ordenados.map((day) => day.activeKcal));
  const ejercicio = promedioDe(ordenados.map((day) => day.exerciseMin));

  return (
    <>
      <Encabezado
        icon={<Footprints size={26} color={colors.champan} strokeWidth={2} />}
        titulo="Actividad"
        valor={ultimo === null ? "—" : ultimo.toLocaleString("es-MX")}
        unidad="pasos el último día con dato"
        tint={colors.champan}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Tu semana en el reloj</SectionLabel>
        <View style={styles.resumenRow}>
          <Dato label="Kcal activas" valor={kcal === null ? "—" : `${Math.round(kcal)}`} />
          <Dato
            label="Min. de ejercicio"
            valor={ejercicio === null ? "—" : `${Math.round(ejercicio)}`}
          />
          <Dato label="Días con dato" valor={`${conPasos.length}`} />
        </View>
      </Card>

      <Tendencia
        titulo="Últimos días"
        puntos={serieDe(ordenados, "steps")}
        color={colors.champan}
        meta={PASOS_META}
        format={(v) => Math.round(v).toLocaleString("es-MX")}
        filas={ordenados.map((day) => ({
          date: day.date,
          valor: day.steps ?? null,
          etiqueta: day.steps == null ? "—" : day.steps.toLocaleString("es-MX"),
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Minutos de ejercicio
// ---------------------------------------------------------------------------

function Ejercicio({ days, goal }: { days: HealthDayPayload[]; goal: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = exerciseInsight(days, goal);

  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DIAS_VISIBLES);
  const conDato = ordenados.filter((day) => day.exerciseMin != null);
  const ultimo = conDato[0]?.exerciseMin ?? null;
  const kcal = promedioDe(ordenados.map((day) => day.activeKcal));
  const cumplidos = conDato.filter((day) => (day.exerciseMin ?? 0) >= EJERCICIO_META_MIN).length;

  return (
    <>
      <Encabezado
        icon={<Timer size={26} color={colors.guindaLight} strokeWidth={2} />}
        titulo="Ejercicio"
        valor={ultimo === null ? "—" : `${ultimo} min`}
        unidad="el último día con dato"
        tint={colors.guindaLight}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Tu esfuerzo</SectionLabel>
        <View style={styles.resumenRow}>
          <Dato label={`Días de ${EJERCICIO_META_MIN}+`} valor={`${cumplidos}`} />
          <Dato label="Kcal activas" valor={kcal === null ? "—" : `${Math.round(kcal)}`} />
          <Dato label="Días con dato" valor={`${conDato.length}`} />
        </View>
      </Card>

      <Tendencia
        titulo="Últimos días"
        puntos={serieDe(ordenados, "exerciseMin")}
        color={colors.guindaLight}
        meta={EJERCICIO_META_MIN}
        format={(v) => `${Math.round(v)} min`}
        filas={ordenados.map((day) => ({
          date: day.date,
          valor: day.exerciseMin ?? null,
          etiqueta: day.exerciseMin == null ? "—" : `${day.exerciseMin} min`,
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Descanso
// ---------------------------------------------------------------------------

function Descanso({ days, goal }: { days: HealthDayPayload[]; goal: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = sleepInsight(days, goal);

  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DIAS_VISIBLES);
  const conSueno = ordenados.filter((day) => day.sleepMin != null);
  const ultimo = conSueno[0]?.sleepMin ?? null;
  const fc = promedioDe(ordenados.map((day) => day.restingHr));
  const mejor = conSueno.length > 0 ? Math.max(...conSueno.map((day) => day.sleepMin!)) : null;
  const peor = conSueno.length > 0 ? Math.min(...conSueno.map((day) => day.sleepMin!)) : null;

  return (
    <>
      <Encabezado
        icon={<Moon size={26} color={colors.paloRosa} strokeWidth={2} />}
        titulo="Descanso"
        valor={ultimo === null ? "—" : formatSleep(ultimo)}
        unidad="la última noche con dato"
        tint={colors.paloRosa}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Tus noches</SectionLabel>
        <View style={styles.resumenRow}>
          <Dato label="Mejor noche" valor={mejor === null ? "—" : formatSleep(mejor)} />
          <Dato label="Peor noche" valor={peor === null ? "—" : formatSleep(peor)} />
          <Dato label="FC en reposo" valor={fc === null ? "—" : `${Math.round(fc)}`} />
        </View>
      </Card>

      <Tendencia
        titulo="Últimas noches"
        puntos={serieDe(ordenados, "sleepMin")}
        color={colors.paloRosa}
        meta={SUENO_META_MIN}
        format={formatSleep}
        filas={ordenados.map((day) => ({
          date: day.date,
          valor: day.sleepMin ?? null,
          etiqueta: day.sleepMin == null ? "—" : formatSleep(day.sleepMin),
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------

function Recuperacion({ days, goal }: { days: HealthDayPayload[]; goal: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = recoveryInsight(days, goal);

  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DIAS_VISIBLES);
  const conDato = ordenados.filter((day) => day.hrvMs != null);
  const ultimo = conDato[0]?.hrvMs ?? null;
  const fcReposo = promedioDe(ordenados.map((day) => day.restingHr));
  const respiratoria = promedioDe(ordenados.map((day) => day.respiratoryRate));
  const oxigeno = promedioDe(ordenados.map((day) => day.spo2));

  // La referencia del gráfico es TU normal de 4 semanas, no un número de tabla.
  const base = promedioDe([...days].slice(0, 28).map((day) => day.hrvMs));

  return (
    <>
      <Encabezado
        icon={<HeartPulse size={26} color={colors.error} strokeWidth={2} />}
        titulo="Recuperación"
        valor={ultimo === null ? "—" : `${ultimo}`}
        unidad="ms de variabilidad cardiaca, la última noche con dato"
        tint={colors.error}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Tus signos en reposo</SectionLabel>
        <View style={styles.resumenRow}>
          <Dato label="FC en reposo" valor={fcReposo === null ? "—" : `${Math.round(fcReposo)}`} />
          <Dato
            label="Respiración"
            valor={respiratoria === null ? "—" : `${respiratoria.toFixed(1)}`}
          />
          <Dato label="Oxígeno" valor={oxigeno === null ? "—" : `${oxigeno.toFixed(1)} %`} />
        </View>
        <Text style={styles.aviso}>
          Estos tres se guardan y se grafican, no se interpretan. Si alguno te preocupa, eso lo ve
          un médico, no una app.
        </Text>
      </Card>

      <Tendencia
        titulo="Últimas noches"
        puntos={serieDe(ordenados, "hrvMs")}
        color={colors.error}
        meta={base === null ? null : Math.round(base)}
        format={(v) => `${Math.round(v)} ms`}
        filas={ordenados.map((day) => ({
          date: day.date,
          valor: day.hrvMs ?? null,
          etiqueta: day.hrvMs == null ? "—" : `${day.hrvMs} ms`,
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Condición cardiorrespiratoria
// ---------------------------------------------------------------------------

function Condicion({ days }: { days: HealthDayPayload[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = fitnessInsight(days);

  // El VO₂ máx se mueve de mes en mes: la ventana es larga a propósito.
  const ordenados = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
  const conDato = ordenados.filter((day) => day.vo2max != null);
  const ultimo = conDato[0]?.vo2max ?? null;
  const maximo = conDato.length > 0 ? Math.max(...conDato.map((day) => day.vo2max!)) : null;

  return (
    <>
      <Encabezado
        icon={<Activity size={26} color={colors.champan} strokeWidth={2} />}
        titulo="Condición"
        valor={ultimo === null ? "—" : `${ultimo}`}
        unidad="mL/kg/min de VO₂ máx estimado"
        tint={colors.champan}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Tu marca</SectionLabel>
        <View style={styles.resumenRow}>
          <Dato label="Mejor registro" valor={maximo === null ? "—" : `${maximo}`} />
          <Dato label="Mediciones" valor={`${conDato.length}`} />
        </View>
        <Text style={styles.aviso}>
          Lo estima el reloj en caminatas y carreras al aire libre, no en las pesas: por eso puede
          pasar semanas sin moverse.
        </Text>
      </Card>

      <Tendencia
        titulo="Últimos 90 días"
        puntos={serieDe(ordenados, "vo2max")}
        color={colors.champan}
        meta={null}
        format={(v) => `${v.toFixed(1)}`}
        filas={conDato.slice(0, DIAS_VISIBLES).map((day) => ({
          date: day.date,
          valor: day.vo2max ?? null,
          etiqueta: `${day.vo2max}`,
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

function Medidas({ checkIns, goal }: { checkIns: CheckInRow[]; goal: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insight = measuresInsight(checkIns, goal);

  const ordenados = [...checkIns].sort((a, b) => b.date.localeCompare(a.date));
  const ultimo = ordenados.find((row) => row.waistCm !== null) ?? null;

  return (
    <>
      <Encabezado
        icon={<Ruler size={26} color={colors.guindaLight} strokeWidth={2} />}
        titulo="Medidas"
        valor={ultimo?.waistCm != null ? `${ultimo.waistCm}` : "—"}
        unidad={ultimo ? `cm de cintura · ${ultimo.date}` : "cm de cintura"}
        tint={colors.guindaLight}
      />

      <InsightCard insight={insight} />

      <Card>
        <SectionLabel>Check-in por check-in</SectionLabel>
        <View style={styles.tabla}>
          {ordenados.length === 0 ? (
            <Text style={styles.vacio}>Todavía no hay check-ins registrados.</Text>
          ) : (
            ordenados.map((row) => (
              <View key={row.date} style={styles.checkRow}>
                <Text style={styles.checkFecha}>{row.date}</Text>
                <View style={styles.checkDatos}>
                  <Medida label="Cintura" valor={row.waistCm} unidad="cm" />
                  <Medida label="Peso" valor={row.weightKg} unidad="kg" />
                  <Medida label="Brazos" valor={promedioPar(row.armLeftCm, row.armRightCm)} unidad="cm" />
                  <Medida label="Piernas" valor={promedioPar(row.legLeftCm, row.legRightCm)} unidad="cm" />
                </View>
              </View>
            ))
          )}
        </View>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

function Encabezado({
  icon,
  titulo,
  valor,
  unidad,
  tint,
}: {
  icon: React.ReactNode;
  titulo: string;
  valor: string;
  unidad: string;
  tint: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.encabezado}>
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(tint, 0.18) }]}>{icon}</View>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.valor}>{valor}</Text>
      <Text style={styles.unidad}>{unidad}</Text>
    </View>
  );
}

/** El semáforo de la tendencia. `sin_datos` no es rojo: es "todavía no sé". */
const TREND_LABEL: Record<Trend, string> = {
  buena: "Va bien",
  estable: "Estable",
  atencion: "Ojo aquí",
  sin_datos: "Sin datos suficientes",
};

function InsightCard({ insight }: { insight: Insight }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tint =
    insight.trend === "buena"
      ? colors.champan
      : insight.trend === "atencion"
        ? colors.error
        : colors.paloRosa;

  return (
    <Card style={{ borderColor: withAlpha(tint, 0.45) }}>
      <View style={[styles.pill, { backgroundColor: withAlpha(tint, 0.18) }]}>
        <Text style={[styles.pillText, { color: tint }]}>{TREND_LABEL[insight.trend].toUpperCase()}</Text>
      </View>

      <Text style={styles.insightHeadline}>{insight.headline}</Text>
      <Text style={styles.insightDetail}>{insight.detail}</Text>

      {insight.recomendacion && (
        <View style={styles.recoWrap}>
          <SectionLabel>Qué hacer</SectionLabel>
          <Text style={styles.reco}>{insight.recomendacion}</Text>
        </View>
      )}
    </Card>
  );
}

type Fila = { date: string; valor: number | null; etiqueta: string };

/** Los días en orden cronológico —del más viejo al más reciente— que es como
 * se lee una línea de tendencia. La lista de abajo va al revés, porque ahí lo
 * que se busca es "¿qué hice ayer?". */
function serieDe(
  days: HealthDayPayload[],
  field: "steps" | "sleepMin" | "exerciseMin" | "hrvMs" | "vo2max",
): Punto[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ date: day.date, value: day[field] ?? null }));
}

/** Tendencia: la línea con su meta punteada, y debajo el día por día. */
function Tendencia({
  titulo,
  puntos,
  color,
  meta,
  format,
  filas,
}: {
  titulo: string;
  puntos: Punto[];
  color: string;
  meta: number | null;
  format: (value: number) => string;
  filas: Fila[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Card>
      <SectionLabel>{titulo}</SectionLabel>
      <View style={{ marginTop: spacing.md }}>
        <ChartBoundary label="La línea no se pudo dibujar con estos días.">
          <LineChart points={puntos} color={color} goal={meta} format={format} />
        </ChartBoundary>
      </View>

      <View style={styles.serie}>
        {filas.length === 0 ? (
          <Text style={styles.vacio}>El reloj todavía no manda días.</Text>
        ) : (
          filas.map((fila) => (
            <View key={fila.date} style={styles.serieRow}>
              <Text style={styles.serieFecha}>{diaCorto(fila.date)}</Text>
              <View style={styles.serieBarBg}>
                <View
                  style={[
                    styles.serieBar,
                    {
                      backgroundColor: withAlpha(color, 0.55),
                      width: `${Math.round(((fila.valor ?? 0) / Math.max(1, ...filas.map((f) => f.valor ?? 0))) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.serieValor}>{fila.etiqueta}</Text>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.dato}>
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={styles.datoLabel}>{label}</Text>
    </View>
  );
}

function Medida({ label, valor, unidad }: { label: string; valor: number | null; unidad: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.medida}>
      <Text style={styles.medidaLabel}>{label}</Text>
      <Text style={styles.medidaValor}>{valor === null ? "—" : `${valor} ${unidad}`}</Text>
    </View>
  );
}

/** "2026-08-27" → "27/08". La fecha corta cabe; la larga empuja la barra. */
function diaCorto(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function promedioDe(values: Array<number | null | undefined>): number | null {
  const presentes = values.filter((value): value is number => value !== null && value !== undefined);
  if (presentes.length === 0) return null;
  return presentes.reduce((sum, value) => sum + value, 0) / presentes.length;
}

/** Izquierdo y derecho se enseñan como uno: el promedio, redondeado a 1 decimal. */
function promedioPar(izquierdo: number | null, derecho: number | null): number | null {
  const media = promedioDe([izquierdo, derecho]);
  return media === null ? null : Math.round(media * 10) / 10;
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
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.sm,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.paloRosa,
  },
  encabezado: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  titulo: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.subheading,
    letterSpacing: 1.2,
    color: colors.paloRosa,
  },
  valor: {
    fontFamily: fonts.sansBold,
    ...typeScale.hero,
    color: colors.marfil,
  },
  unidad: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  pillText: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1.2,
  },
  insightHeadline: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.marfil,
  },
  insightDetail: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.paloRosaLight,
    marginTop: spacing.xs,
  },
  recoWrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  reco: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
  },
  resumenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dato: {
    flex: 1,
    gap: 2,
  },
  datoValor: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.marfil,
  },
  datoLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.paloRosa,
  },
  serie: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  serieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  serieFecha: {
    width: 46,
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  serieBarBg: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.cardBorder,
    overflow: "hidden",
  },
  serieBar: {
    height: 10,
    borderRadius: radius.full,
  },
  serieValor: {
    width: 76,
    textAlign: "right",
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  tabla: {
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  checkRow: {
    gap: spacing.sm,
  },
  checkFecha: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.champan,
  },
  checkDatos: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  medida: {
    minWidth: "44%",
    gap: 2,
  },
  medidaLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.paloRosa,
  },
  medidaValor: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.marfil,
  },
  aviso: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.md,
  },
  vacio: {
    fontFamily: fonts.serifItalic,
    ...typeScale.body,
    color: colors.paloRosaLight,
    marginTop: spacing.sm,
  },
});
