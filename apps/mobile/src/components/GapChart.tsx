import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

export type Brecha = {
  /** Etiqueta de la zona: "Cintura", "Espalda"... */
  label: string;
  /**
   * Qué tanto del camino al objetivo del periodo ya está recorrido, de 0 a 1.
   * `null` = esa zona no se pudo leer.
   */
  avance: number | null;
  /** Dónde estás hoy, ya con su unidad: "94.6 cm". */
  actual?: string | null;
  /** A dónde llega el escalón del periodo: "93 cm". */
  meta?: string | null;
  /**
   * Lo que falta, **con dirección**: "1.6 cm por bajar", "cumplida".
   *
   * La dirección no es un adorno: "3.4 kg más" en un plan de pérdida de grasa
   * se lee como que hay que subir 3.4 kg, que es exactamente lo contrario de
   * lo que dice el plan. El verbo lo aclara; el número solo, no.
   */
  nota?: string | null;
  /** Cada cuánto se mide. Las de cinta se toman una vez al mes. */
  cadencia?: "semanal" | "mensual" | null;
};

/**
 * Brecha por zona: dónde estás, a dónde va el escalón y cuánto falta.
 *
 * **Por qué esto y no otra telaraña.** La telaraña es buena para una cosa —la
 * FORMA de un perfil, si algo está hundido respecto de lo demás— y mala para
 * otra: comparar dos series. Dos polígonos encimados se leen pésimo, el área
 * que dibujan depende del orden de los ejes, y con zonas ordinales el ojo
 * termina midiendo puntas en vez de distancias.
 *
 * **Por qué lleva números.** La primera versión enseñaba el riel y una palabra
 * ("igual", "se acerca"). ¿Igual a qué? Un riel sin cifras obliga a confiar en
 * la posición de un punto, y la posición de un punto no se puede verificar.
 * Con el valor de hoy y el del escalón, el riel pasa a ilustrar un dato que ya
 * se puede leer sin él.
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
        const cumplida = avance !== null && avance >= 1;

        return (
          <View key={brecha.label} style={styles.bloque}>
            <View style={styles.encabezado}>
              <Text style={styles.zona} numberOfLines={1}>
                {brecha.label}
                {brecha.cadencia === "mensual" ? " · mensual" : ""}
              </Text>

              {brecha.actual ? (
                <Text style={styles.cifras} numberOfLines={1}>
                  {brecha.actual}
                  {brecha.meta ? ` → ${brecha.meta}` : ""}
                </Text>
              ) : null}
            </View>

            <View style={styles.riel}>
              <View
                style={[
                  styles.recorrido,
                  { width: `${porcentaje}%` },
                  cumplida && styles.recorridoCumplido,
                ]}
              />
              {avance !== null && <View style={[styles.punto, { left: `${porcentaje}%` }]} />}
              <View style={styles.meta} />
            </View>

            <Text style={[styles.nota, cumplida && styles.notaCumplida]} numberOfLines={1}>
              {avance === null ? "sin medir todavía" : (brecha.nota ?? `${porcentaje}% del camino`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.lg },
    bloque: { gap: 6 },
    encabezado: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    zona: { flex: 1, fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    cifras: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.bodySm,
      color: colors.champan,
      fontVariant: ["tabular-nums"],
    },
    riel: {
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
    recorridoCumplido: { backgroundColor: withAlpha(colors.champan, 0.85) },
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
    nota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    notaCumplida: { color: colors.champan, fontFamily: fonts.sansMedium },
  });
