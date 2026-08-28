import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useTheme } from "@/context/theme";
import { fonts, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

export type Punto = { date: string; value: number | null };

type LineChartProps = {
  /** Del más viejo al más reciente: la línea se lee de izquierda a derecha. */
  points: Punto[];
  color: string;
  /** Línea punteada de referencia: la meta del rubro. */
  goal?: number | null;
  /** Cómo se escribe un valor en las etiquetas de los extremos. */
  format?: (value: number) => string;
  height?: number;
};

/**
 * Línea de tendencia con relleno y el último punto marcado.
 *
 * Dos decisiones que la hacen honesta: los días **sin dato no se inventan** —
 * la línea se corta y vuelve a empezar, en vez de unir dos puntos lejanos y
 * dibujar una pendiente que nadie vivió—; y el eje vertical **no arranca en
 * cero cuando el rango es angosto**, porque una cintura entre 116 y 118 cm
 * contra un eje desde cero se ve como una línea recta y plana, que es
 * justamente la lectura equivocada.
 */
export function LineChart({ points, color, goal = null, format, height = 140 }: LineChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const width = 320;
  const padY = 14;
  const conDato = points.filter((p): p is { date: string; value: number } => p.value !== null);

  if (conDato.length < 2) {
    return (
      <View style={[styles.vacio, { height }]}>
        <Text style={styles.vacioTexto}>Con dos días de dato ya se dibuja tu tendencia.</Text>
      </View>
    );
  }

  const valores = conDato.map((p) => p.value);
  const candidatos = goal === null ? valores : [...valores, goal];
  const min = Math.min(...candidatos);
  const max = Math.max(...candidatos);
  const rango = max - min || 1;

  const x = (index: number) => (index / Math.max(1, points.length - 1)) * width;
  const y = (value: number) => padY + (1 - (value - min) / rango) * (height - padY * 2);

  // Tramos: cada corte de datos abre un segmento nuevo en vez de unir el hueco.
  const tramos: string[] = [];
  let actual = "";
  points.forEach((punto, index) => {
    if (punto.value === null) {
      if (actual) tramos.push(actual);
      actual = "";
      return;
    }
    const comando = actual === "" ? "M" : "L";
    actual += `${comando}${x(index).toFixed(1)},${y(punto.value).toFixed(1)} `;
  });
  if (actual) tramos.push(actual);

  const ultimoIndex = points.reduce((last, p, i) => (p.value !== null ? i : last), 0);
  const ultimo = points[ultimoIndex]!.value!;

  const escribe = format ?? ((value: number) => `${Math.round(value)}`);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {goal !== null && (
          <Line
            x1={0}
            y1={y(goal)}
            x2={width}
            y2={y(goal)}
            stroke={withAlpha(colors.paloRosa, 0.5)}
            strokeWidth={1}
            strokeDasharray="4 5"
          />
        )}

        {tramos.map((tramo) => (
          <Path key={tramo.slice(0, 24)} d={tramo.trim()} stroke={color} strokeWidth={2.5} fill="none" />
        ))}

        <Circle cx={x(ultimoIndex)} cy={y(ultimo)} r={5} fill={color} />
      </Svg>

      <View style={styles.pie}>
        <Text style={styles.pieTexto}>
          mín {escribe(min)} · máx {escribe(max)}
        </Text>
        {goal !== null && <Text style={styles.pieTexto}>meta {escribe(goal)}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  vacio: {
    alignItems: "center",
    justifyContent: "center",
  },
  vacioTexto: {
    fontFamily: fonts.serifItalic,
    ...typeScale.body,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
  pie: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  pieTexto: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.paloRosa,
  },
});
