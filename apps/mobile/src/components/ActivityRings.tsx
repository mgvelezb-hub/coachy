import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { useTheme } from "@/context/theme";
import { withAlpha } from "@/lib/theme";

export type Ring = {
  /** Qué mide, para la leyenda de al lado. */
  label: string;
  /** Valor de hoy. `null` = sin dato: el anillo se pinta vacío, no en cero. */
  value: number | null;
  /** La meta contra la que se llena el anillo. */
  goal: number;
  color: string;
};

/**
 * Tres anillos concéntricos, al estilo de los de Actividad.
 *
 * Cada anillo es un círculo con `strokeDasharray` recortado: la vuelta
 * completa es su circunferencia y el avance es la fracción `value / goal`,
 * topada en 1 — pasarse de la meta no dibuja una segunda vuelta, solo cierra
 * el anillo. Un anillo sin dato queda en su carril gris, que se distingue de
 * un cero real: "no traías el reloj" y "no te moviste" no son lo mismo.
 *
 * Es puro dibujo: no decide metas ni interpreta números, solo pinta lo que le
 * pasan.
 */
export function ActivityRings({ rings, size = 132 }: { rings: Ring[]; size?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(size), [size]);

  const stroke = size * 0.093;
  const center = size / 2;
  // De afuera hacia adentro, con un carril de aire entre anillos.
  const radios = rings.map((_, index) => center - stroke / 2 - index * (stroke + size * 0.023));

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Se gira todo el grupo para que los anillos arranquen arriba y no a las 3. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {rings.map((ring, index) => {
            const radius = radios[index]!;
            const circunferencia = 2 * Math.PI * radius;
            const avance =
              ring.value === null ? 0 : Math.max(0, Math.min(1, ring.value / ring.goal));

            return (
              <G key={ring.label}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={withAlpha(ring.color, 0.18)}
                  strokeWidth={stroke}
                  fill="none"
                />
                {avance > 0 && (
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={ring.color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={[circunferencia * avance, circunferencia]}
                    fill="none"
                  />
                )}
              </G>
            );
          })}
        </G>
      </Svg>
      {/* El color del tema no entra al SVG: los anillos traen el suyo. Esta
          referencia existe solo para que el componente se repinte al cambiar
          de tema junto con el resto de la tarjeta. */}
      <View style={[styles.hidden, { backgroundColor: colors.obsidiana }]} />
    </View>
  );
}

const makeStyles = (size: number) => StyleSheet.create({
  wrap: {
    width: size,
    height: size,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: {
    width: 0,
    height: 0,
  },
});
