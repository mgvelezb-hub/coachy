import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";

import { useTheme } from "@/context/theme";
import { fonts, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

export type Eje = {
  /** Etiqueta corta: en la telaraña no cabe una frase. */
  label: string;
  /** 0 a 1 — qué tan cerca está de su meta. `null` = sin dato. */
  value: number | null;
  /**
   * Lo que se esperaba a estas alturas, también de 0 a 1.
   *
   * Sin esto la telaraña miente por omisión: un polígono ancho se lee como
   * "voy bien" aunque a mitad de semana llevar dos de cinco sesiones sea ir
   * atrasado. Con la referencia dibujada detrás, lo que se compara es tu
   * forma contra la esperada, no contra el borde del dibujo.
   */
  esperado?: number | null;
  /** El dato real, con su unidad: "8 420 pasos". */
  detalle?: string | null;
  /** Contra qué se compara: "de 8 000". */
  referencia?: string | null;
};

/**
 * Telaraña de perfil: qué tan cerca estás de tu meta en cada frente.
 *
 * Sirve para lo que ninguna tarjeta suelta puede: enseñar el **desbalance**.
 * Seis números en fila se leen uno por uno; el mismo perfil dibujado se lee de
 * golpe — se ve que el polígono está hundido de un lado, y ese hundimiento es
 * la conversación.
 *
 * Cada eje llega ya normalizado a 0-1 contra SU meta (`lib/perfil.ts`), porque
 * pasos, horas de sueño y kilos no comparten unidad y solo son comparables
 * como fracción de su propio objetivo. Un eje sin dato se dibuja en el centro
 * pero se marca en la leyenda: hundido por falta de dato y hundido de verdad
 * no son lo mismo, y confundirlos haría mentir al dibujo.
 */
export function RadarChart({ ejes, size = 240 }: { ejes: Eje[] | undefined; size?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const center = size / 2;
  const radio = center * 0.62;
  const lista = ejes ?? [];
  const total = lista.length;

  if (total < 3) return null;

  /** Ángulo del eje `index`, arrancando arriba y girando a la derecha. */
  function punto(index: number, fraccion: number): { x: number; y: number } {
    const angulo = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
      x: center + Math.cos(angulo) * radio * fraccion,
      y: center + Math.sin(angulo) * radio * fraccion,
    };
  }

  const anillos = [0.25, 0.5, 0.75, 1];

  /** El polígono de lo esperado. `null` si ningún eje trae referencia. */
  const esperadoPoligono = lista.some((eje) => typeof eje.esperado === "number")
    ? lista
        .map((eje, index) => {
          const fraccion = Math.max(0, Math.min(1, eje.esperado ?? 0));
          const { x, y } = punto(index, fraccion);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : null;

  const poligono = lista
    .map((eje, index) => {
      // Un eje sin dato no se estira: se queda pegado al centro y la leyenda
      // lo dice. Rellenarlo con el promedio sería inventar.
      const fraccion = Math.max(0, Math.min(1, eje.value ?? 0));
      const { x, y } = punto(index, fraccion);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {anillos.map((anillo) => (
          <Circle
            key={anillo}
            cx={center}
            cy={center}
            r={radio * anillo}
            stroke={withAlpha(colors.paloRosa, anillo === 1 ? 0.35 : 0.15)}
            strokeWidth={1}
            fill="none"
          />
        ))}

        {/* Radios y etiquetas van en dos pasadas y NO dentro de un Fragment:
            react-native-svg recorre los hijos esperando elementos SVG, y un
            Fragment en medio lo tira en el lado nativo — sin traza de JS, la
            pantalla entera se cae. */}
        {lista.map((eje, index) => {
          const fin = punto(index, 1);
          return (
            <Line
              key={`eje-${eje.label}`}
              x1={center}
              y1={center}
              x2={fin.x}
              y2={fin.y}
              stroke={withAlpha(colors.paloRosa, 0.2)}
              strokeWidth={1}
            />
          );
        })}

        {lista.map((eje, index) => {
          const etiqueta = punto(index, 1.32);
          return (
            <SvgText
              key={`label-${eje.label}`}
              x={etiqueta.x}
              y={etiqueta.y + 4}
              fill={colors.paloRosa}
              fontSize={11}
              fontFamily={fonts.sansSemiBold}
              textAnchor="middle"
            >
              {eje.label}
            </SvgText>
          );
        })}

        {/* Primero lo esperado, detrás y en otro tono: es el fondo contra el
            que se lee tu forma. Va antes que tu polígono para quedar debajo. */}
        {esperadoPoligono && (
          <Polygon
            points={esperadoPoligono}
            fill={withAlpha(colors.paloRosa, 0.16)}
            stroke={withAlpha(colors.paloRosa, 0.55)}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        <Polygon
          points={poligono}
          fill={withAlpha(colors.champan, 0.28)}
          stroke={colors.champan}
          strokeWidth={2}
        />

        {lista.map((eje, index) => {
          const { x, y } = punto(index, Math.max(0, Math.min(1, eje.value ?? 0)));
          return (
            <Circle
              key={`p-${eje.label}`}
              cx={x}
              cy={y}
              r={3.5}
              fill={eje.value === null ? withAlpha(colors.paloRosa, 0.5) : colors.champan}
            />
          );
        })}
      </Svg>

      {esperadoPoligono && (
        <View style={styles.leyenda}>
          <View style={styles.leyendaItem}>
            <View style={[styles.muestra, { backgroundColor: colors.champan }]} />
            <Text style={styles.leyendaTexto}>Tu semana</Text>
          </View>
          <View style={styles.leyendaItem}>
            <View style={[styles.muestra, styles.muestraEsperada]} />
            <Text style={styles.leyendaTexto}>Lo esperado a estas alturas</Text>
          </View>
        </View>
      )}

      {/* La tabla no sobra: la telaraña enseña la forma y la tabla enseña de
          cuánto es la diferencia. Una sin la otra deja preguntas. */}
      <View style={styles.tabla}>
        {lista.map((eje) => {
          const desvio =
            eje.value === null || typeof eje.esperado !== "number" || eje.esperado === null
              ? null
              : Math.round((eje.value - eje.esperado) * 100);

          return (
            <View key={`fila-${eje.label}`} style={styles.fila}>
              <Text style={styles.filaLabel} numberOfLines={1}>
                {eje.label}
              </Text>
              <Text style={styles.filaDato} numberOfLines={1}>
                {eje.value === null ? "sin dato" : (eje.detalle ?? `${Math.round(eje.value * 100)} %`)}
                {eje.referencia ? ` · ${eje.referencia}` : ""}
              </Text>
              <Text
                style={[
                  styles.filaDesvio,
                  desvio !== null && desvio < -5 && styles.filaDesvioAbajo,
                  desvio !== null && desvio >= 0 && styles.filaDesvioArriba,
                ]}
              >
                {desvio === null ? "—" : `${desvio > 0 ? "+" : ""}${desvio} pp`}
              </Text>
            </View>
          );
        })}
      </View>

      {lista.some((eje) => eje.value === null) && (
        <Text style={styles.nota}>
          Los ejes sin dato ({lista.filter((e) => e.value === null).map((e) => e.label).join(", ")})
          se dibujan en el centro: falta medirlos, no es que estén en cero.
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  muestra: { width: 12, height: 12, borderRadius: 3 },
  muestraEsperada: {
    backgroundColor: withAlpha(colors.paloRosa, 0.25),
    borderWidth: 1,
    borderColor: withAlpha(colors.paloRosa, 0.6),
  },
  leyendaTexto: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  tabla: { marginTop: spacing.md, gap: 4 },
  fila: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filaLabel: { width: 92, fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
  filaDato: { flex: 1, fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  filaDesvio: {
    width: 62,
    textAlign: "right",
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    fontVariant: ["tabular-nums"],
  },
  filaDesvioAbajo: { color: colors.error },
  filaDesvioArriba: { color: colors.champan },
  wrap: {
    alignItems: "center",
    gap: spacing.sm,
  },
  nota: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
});
