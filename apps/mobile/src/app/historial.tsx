import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { WaistChart } from "@/components/WaistChart";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  DISCIPLINE_LABELS,
  getActivities,
  getHistoryMeasurements,
  getHistoryTraining,
  type Activity,
  type CheckInPoint,
  type Discipline,
  type PersonalRecord,
  type TrainingHistoryRow,
} from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
import { fonts, radius, spacing, withAlpha, type Palette, type as typeScale } from "@/lib/theme";

type HistorialData = {
  points: CheckInPoint[];
  records: PersonalRecord[];
  /** Sesiones de pesas y de las demás disciplinas, ya mezcladas. */
  entrenamientos: EntrenamientoHecho[];
};

/**
 * Una sesión entrenada, venga de donde venga.
 *
 * El historial de alguien que entrena tres disciplinas no puede tener tres
 * memorias separadas: lo que se recuerda es "qué hice el martes", no "qué hice
 * el martes en el módulo de pesas".
 */
type EntrenamientoHecho = {
  id: string;
  fecha: string;
  titulo: string;
  detalle: string;
  esPesas: boolean;
  /** Con qué se entrenó: de ahí sale el ícono de la fila. */
  discipline: Discipline;
};

function mezclarEntrenamientos(
  sesiones: TrainingHistoryRow[],
  actividades: Activity[],
): EntrenamientoHecho[] {
  const dePesas: EntrenamientoHecho[] = sesiones.map((sesion) => ({
    id: sesion.workoutId,
    fecha: sesion.date,
    titulo: sesion.muscleGroup,
    detalle: `${sesion.sets} series · ${sesion.volumeKg.toLocaleString("es-MX")} kg${
      sesion.prs.length > 0 ? ` · ${sesion.prs.length} PR` : ""
    }`,
    esPesas: true,
    discipline: "PESAS" as Discipline,
  }));

  // Las pesas sincronizadas del reloj ya están arriba como sesión propia: si
  // se dejaran pasar de nuevo, cada día de gimnasio aparecería dos veces.
  const deOtras: EntrenamientoHecho[] = actividades
    .filter((actividad) => actividad.discipline !== "PESAS")
    .map((actividad) => ({
      id: actividad.id,
      fecha: actividad.date,
      titulo: DISCIPLINE_LABELS[actividad.discipline],
      detalle: [
        `${actividad.durationMin} min`,
        actividad.distanceM ? `${(actividad.distanceM / 1000).toFixed(1)} km` : null,
        actividad.avgHr ? `${actividad.avgHr} lpm` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      esPesas: false,
      discipline: actividad.discipline,
    }));

  return [...dePesas, ...deOtras].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

const CHART_POINTS = 12;

export default function HistorialScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<HistorialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [measurements, training, actividades] = await Promise.all([
        getHistoryMeasurements(),
        getHistoryTraining(),
        getActivities().catch(() => null),
      ]);
      setData({
        points: measurements.points,
        records: training.records,
        entrenamientos: mezclarEntrenamientos(
          training.sessions ?? [],
          actividades?.actividades ?? [],
        ),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu historial");
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

  if (!data && !error) return <LoadingState label="Cargando tu historial..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const chartPoints = data.points.slice(-CHART_POINTS);
  // Más reciente primero para la lista; los deltas se calculan contra el
  // check-in cronológicamente anterior (que en esta lista queda "después").
  const listPoints = [...data.points].reverse();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backRow}>
        <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
        <Text style={styles.backText}>Atrás</Text>
      </Pressable>

      <Text style={styles.title}>Tu historial</Text>

      <Card>
        <SectionLabel>Tendencia de cintura</SectionLabel>
        <View style={{ marginTop: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <WaistChart points={chartPoints} />
          </ScrollView>
        </View>
      </Card>

      <Card>
        <SectionLabel>Check-ins</SectionLabel>
        {listPoints.length === 0 ? (
          <EmptyState message="Tu primer check-in estrena tu historial." />
        ) : (
          <View style={styles.list}>
            {listPoints.map((point, index) => {
              const previous = listPoints[index + 1];
              const delta =
                point.waistCm !== null && previous?.waistCm !== null && previous !== undefined
                  ? Math.round((point.waistCm - previous.waistCm) * 10) / 10
                  : null;
              return <CheckInRow key={point.id} point={point} delta={delta} />;
            })}
          </View>
        )}
      </Card>

      <Card>
        <SectionLabel>Lo que has entrenado</SectionLabel>
        {data.entrenamientos.length === 0 ? (
          <EmptyState message="Cuando cierres tu primera sesión aparece aquí." />
        ) : (
          <View style={styles.list}>
            {data.entrenamientos.slice(0, 20).map((entrenamiento) => {
              const Icono = iconoDe(entrenamiento.discipline);
              return (
                <Pressable
                  key={entrenamiento.id}
                  // Solo las de pesas se abren: el detalle serie por serie sale
                  // de `WorkoutSet`, y una sesión de alberca no tiene series
                  // que comparar contra un plan.
                  onPress={() =>
                    entrenamiento.esPesas && router.push(`/historial/${entrenamiento.id}`)
                  }
                  disabled={!entrenamiento.esPesas}
                  style={styles.prRow}
                >
                  <Icono size={20} color={colors.paloRosa} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prName}>{entrenamiento.titulo}</Text>
                    <Text style={styles.entrenamientoDetalle}>{entrenamiento.detalle}</Text>
                  </View>
                  <Text style={styles.entrenamientoFecha}>{entrenamiento.fecha.slice(5)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <SectionLabel color={colors.champan}>Récords personales</SectionLabel>
        {data.records.length === 0 ? (
          <EmptyState message="Tus PRs van a aparecer aquí en cuanto los rompas." />
        ) : (
          <View style={styles.list}>
            {data.records.map((record) => {
              const exerciseId = record.exerciseId;
              return (
                <Pressable
                  key={record.exerciseName}
                  // Tocar un récord abre su tendencia. Sin `exerciseId` —el
                  // catálogo cambió, o la serie se capturó suelta— la fila se
                  // queda como estaba en vez de llevar a una hoja vacía.
                  onPress={() => exerciseId && router.push(`/progreso/${exerciseId}`)}
                  disabled={!exerciseId}
                  style={styles.prRow}
                >
                  <Text style={styles.prName}>{record.exerciseName}</Text>
                  <Text style={styles.prValue}>
                    {record.weightKg} kg × {record.reps}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Pressable onPress={() => router.push("/objetivo")} style={styles.goalLink} hitSlop={8}>
        <Text style={styles.goalLinkText}>Rumbo a tu objetivo →</Text>
      </Pressable>
    </ScrollView>
  );
}

function CheckInRow({ point, delta }: { point: CheckInPoint; delta: number | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const deltaLabel = delta === null ? null : delta === 0 ? "=" : delta > 0 ? `+${delta}` : `${delta}`;
  const deltaTone = delta === null || delta === 0 ? "neutral" : delta < 0 ? "good" : "bad";

  return (
    <View style={styles.checkinRow}>
      <View style={styles.checkinInfo}>
        <Text style={styles.checkinDate}>{point.date}</Text>
        {point.phase && <Text style={styles.checkinPhase}>{point.phase}</Text>}
      </View>
      <View style={styles.checkinMeasure}>
        <Text style={styles.checkinWaist}>{point.waistCm !== null ? `${point.waistCm} cm` : "—"}</Text>
        {deltaLabel && (
          <View
            style={[
              styles.deltaBadge,
              deltaTone === "good" && styles.deltaGood,
              deltaTone === "bad" && styles.deltaBad,
            ]}
          >
            <Text style={styles.deltaText}>{deltaLabel}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  backRow: {
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
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  title: {
    fontFamily: fonts.display,
    ...typeScale.heading,
    color: colors.marfil,
  },
  list: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  checkinRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  checkinInfo: {
    gap: 2,
  },
  checkinDate: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  checkinPhase: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  checkinMeasure: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkinWaist: {
    fontFamily: fonts.display,
    ...typeScale.subheading,
    color: colors.champan,
  },
  deltaBadge: {
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
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  entrenamientoDetalle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  entrenamientoFecha: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosaLight },
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
  goalLink: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  goalLinkText: {
    fontFamily: fonts.serifItalic,
    ...typeScale.subheading,
    color: colors.paloRosaLight,
  },
});
