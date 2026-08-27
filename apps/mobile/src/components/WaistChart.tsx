import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Polyline } from "react-native-svg";

import { colors, fonts, spacing } from "@/lib/theme";
import type { CheckInPoint } from "@/lib/api";

type WaistChartProps = {
  points: CheckInPoint[];
};

const CHART_HEIGHT = 140;
const PADDING = 12;

/**
 * Gráfica simple de cintura (línea sólida, el KPI) con peso como referencia
 * punteada, para los últimos puntos del historial. Sin librerías de charting:
 * solo `react-native-svg`, ya que son un puñado de puntos.
 */
export function WaistChart({ points }: WaistChartProps) {
  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Necesitas al menos 2 check-ins para ver tu tendencia.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChartSvg points={points} />
      <View style={styles.legend}>
        <LegendItem color={colors.champan} label="Cintura" />
        <LegendItem color={colors.paloRosaLight} label="Peso" dashed />
      </View>
    </View>
  );
}

function ChartSvg({ points }: WaistChartProps) {
  const width = Math.max(points.length * 48, 240);

  const waistValues = points.map((p) => p.waistCm).filter((v): v is number => v !== null);
  const weightValues = points.map((p) => p.weightKg).filter((v): v is number => v !== null);
  const allValues = [...waistValues, ...weightValues];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const xStep = (width - PADDING * 2) / Math.max(points.length - 1, 1);

  function toY(value: number): number {
    const usable = CHART_HEIGHT - PADDING * 2;
    return PADDING + usable - ((value - min) / range) * usable;
  }

  const waistCoords = points
    .map((p, i) => (p.waistCm !== null ? `${PADDING + i * xStep},${toY(p.waistCm)}` : null))
    .filter((v): v is string => v !== null);

  const weightCoords = points
    .map((p, i) => (p.weightKg !== null ? `${PADDING + i * xStep},${toY(p.weightKg)}` : null))
    .filter((v): v is string => v !== null);

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <SvgLine
        x1={PADDING}
        y1={CHART_HEIGHT - PADDING}
        x2={width - PADDING}
        y2={CHART_HEIGHT - PADDING}
        stroke={colors.cardBorder}
        strokeWidth={1}
      />

      {weightCoords.length > 1 && (
        <Polyline
          points={weightCoords.join(" ")}
          fill="none"
          stroke={colors.paloRosaLight}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />
      )}

      {waistCoords.length > 1 && (
        <Polyline points={waistCoords.join(" ")} fill="none" stroke={colors.champan} strokeWidth={2.5} />
      )}

      {points.map((p, i) =>
        p.waistCm !== null ? (
          <Circle key={p.id} cx={PADDING + i * xStep} cy={toY(p.waistCm)} r={3} fill={colors.champan} />
        ) : null,
      )}
    </Svg>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: dashed ? "transparent" : color, borderColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  legendLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
});
