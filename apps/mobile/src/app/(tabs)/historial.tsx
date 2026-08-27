import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { WaistChart } from "@/components/WaistChart";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getHistoryMeasurements,
  getHistoryTraining,
  type CheckInPoint,
  type PersonalRecord,
} from "@/lib/api";
import { fonts, radius, spacing, withAlpha, type Palette } from "@/lib/theme";

type HistorialData = {
  points: CheckInPoint[];
  records: PersonalRecord[];
};

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
      const [measurements, training] = await Promise.all([
        getHistoryMeasurements(),
        getHistoryTraining(),
      ]);
      setData({ points: measurements.points, records: training.records });
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
        <SectionLabel color={colors.champan}>Récords personales</SectionLabel>
        {data.records.length === 0 ? (
          <EmptyState message="Tus PRs van a aparecer aquí en cuanto los rompas." />
        ) : (
          <View style={styles.list}>
            {data.records.map((record) => (
              <View key={record.exerciseName} style={styles.prRow}>
                <Text style={styles.prName}>{record.exerciseName}</Text>
                <Text style={styles.prValue}>
                  {record.weightKg} kg × {record.reps}
                </Text>
              </View>
            ))}
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
    fontSize: 20,
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
    fontSize: 13,
    color: colors.marfil,
  },
  checkinPhase: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
  checkinMeasure: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkinWaist: {
    fontFamily: fonts.display,
    fontSize: 15,
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
    fontSize: 11,
    color: colors.marfil,
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
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
  goalLink: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  goalLinkText: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    color: colors.paloRosaLight,
  },
});
