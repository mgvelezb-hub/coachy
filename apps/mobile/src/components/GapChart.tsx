import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

export type Brecha = {
  /** Etiqueta de la zona: "Cintura", "Espalda"... */
  label: string;
  /**
   * Qué tanto del camino a la referencia ya está recorrido, de 0 a 1.
   * `null` = esa zona no se pudo leer en las dos series.
   */
  avance: number | null;
  /** Una palabra sobre el movimiento: "se acerca", "igual", "se aleja". */
  nota?: string | null;
};

/**
 * Brecha por zona: dónde estás hoy y dónde está la referencia.
 *
 * **Por qué esto y no otra telaraña.** La telaraña es buena para una cosa —la
 * FORMA de un perfil, si algo está hundido respecto de lo demás— y mala para
 * otra: comparar dos series. Dos polígonos encimados se leen pésimo, el área
 * que dibujan depende del orden en que se pongan los ejes (mover un eje de
 * lugar cambia el "tamaño" sin cambiar un solo dato), y con cinco zonas
 * ordinales el ojo termina midiendo puntas en vez de distancias.
 *
 * Una brecha se lee mejor como distancia: cada zona es un riel, tu punto está
 * donde estás y la meta al final. Se compara vertical, sin distorsión de área,
 * y se ordena de la más lejana a la más cercana, que es el orden en que
 * conviene atacarlas.
 */
export function GapChart({ brechas }: { brechas: Brecha[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (brechas.length === 0) return null;

  // La más lejana primero: es la que más mueve la aguja.
  const ordenadas = [...brechas].sort((a, b) => (a.avance ?? 0) - (b.avance ?? 0));

  return (
    <View style={styles.wrap}>
      {ordenadas.map((brecha) => {
        const avance = brecha.avance;
        const porcentaje = avance === null ? 0 : Math.round(Math.max(0, Math.min(1, avance)) * 100);

        return (
          <View key={brecha.label} style={styles.fila}>
            <Text style={styles.zona} numberOfLines={1}>
              {brecha.label}
            </Text>

            <View style={styles.riel}>
              <View style={[styles.recorrido, { width: `${porcentaje}%` }]} />
              {avance !== null && (
                <View style={[styles.punto, { left: `${porcentaje}%` }]} />
              )}
              <View style={styles.meta} />
            </View>

            <Text style={styles.nota} numberOfLines={1}>
              {avance === null ? "sin leer" : (brecha.nota ?? `${porcentaje}%`)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.pie}>
        El riel va de donde empezaste a tu referencia. El punto es dónde estás hoy.
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { gap: spacing.md },
  fila: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  zona: {
    width: 66,
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  riel: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.cardBorder,
    justifyContent: "center",
  },
  recorrido: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: withAlpha(colors.champan, 0.55),
  },
  punto: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.champan,
    marginLeft: -6,
  },
  meta: {
    position: "absolute",
    right: 0,
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.marfil,
  },
  nota: {
    width: 74,
    textAlign: "right",
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    color: colors.marfil,
  },
  pie: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
  },
});
