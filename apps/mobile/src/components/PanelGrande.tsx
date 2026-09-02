import { ChevronRight } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ScoreTone } from "@/components/ScoreCard";
import { useTheme } from "@/context/theme";
import { fonts, radius, shadow, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

/**
 * Panel de ancho completo del Resumen.
 *
 * Es el hermano grande de `ScoreTile`, y existe porque cambiar de tamaño tiene
 * que cambiar **el contenido**, no solo el ancho: un cuadro chico estirado a
 * toda la pantalla se ve peor que el chico, no mejor. Aquí el dato principal
 * manda arriba y abajo entra lo que en media pantalla no cabía —una gráfica,
 * una tabla, una lista de días—.
 *
 * La regla de las tarjetas cerradas sigue viva: el encabezado ya contesta sin
 * leer el cuerpo. El cuerpo explica, no revela.
 */
export function PanelGrande({
  icon: Icon,
  tint,
  title,
  value,
  detail,
  status = null,
  onPress,
  children,
  serie,
  infoTip,
}: {
  icon: ComponentType<IconProps>;
  tint?: string;
  title: string;
  /** El número protagonista. Va grande y a la izquierda. */
  value: string;
  /** Una línea de contexto. Dos como mucho: esto no es un párrafo. */
  detail?: string | null;
  status?: { label: string; tone: ScoreTone } | null;
  onPress?: () => void;
  /** El detalle que solo cabe a ancho completo. */
  children?: ReactNode;
  /**
   * Los últimos valores, para la chispa de tendencia del renglón bajo. La
   * gráfica completa vive en `children`; esto es lo que cabe sin crecer.
   */
  serie?: number[];
  /**
   * Un `InfoTip` junto al título, para el "porqué" que no vale su propio
   * renglón en `children`. Igual que en `ScoreCard`: va dentro del
   * `Pressable` de la cabecera, así que tocarlo no dispara `onPress`.
   */
  infoTip?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = tint ?? colors.champan;

  const toneColor: Record<ScoreTone, string> = {
    ok: colors.champan,
    warn: colors.paloRosa,
    alto: colors.error,
    neutral: colors.paloRosaLight,
  };

  const cabecera = (
    <View style={styles.cabecera}>
      <View style={[styles.aro, { backgroundColor: withAlpha(color, 0.18) }]}>
        <Icon size={20} color={color} strokeWidth={2} />
      </View>

      <View style={styles.textos}>
        <View style={styles.tituloRow}>
          <Text style={styles.titulo} numberOfLines={1}>
            {title}
          </Text>
          {infoTip}
        </View>
        {detail ? (
          <Text style={styles.detalle} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>

      <Text style={styles.valor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>

      {status && (
        <View style={[styles.chip, { backgroundColor: withAlpha(toneColor[status.tone], 0.18) }]}>
          <Text style={[styles.chipTexto, { color: toneColor[status.tone] }]}>
            {status.label.toUpperCase()}
          </Text>
        </View>
      )}

      {onPress ? <ChevronRight size={20} color={colors.paloRosa} strokeWidth={2} /> : null}
    </View>
  );

  return (
    <View style={styles.panel}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.presionado}>
          {cabecera}
        </Pressable>
      ) : (
        cabecera
      )}

      {serie && serie.length >= 2 && <Chispa valores={serie} color={color} />}

      {children ? <View style={styles.cuerpo}>{children}</View> : null}
    </View>
  );
}

/**
 * Tendencia mínima del renglón bajo: barras, sin ejes ni etiquetas.
 *
 * Con vistas se dibuja aquí y no con SVG por lo mismo de siempre: un SVG por
 * panel multiplica el costo de pintar el Resumen entero.
 */
function Chispa({ valores, color }: { valores: number[]; color: string }) {
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = max - min || 1;

  return (
    <View style={chispaStyles.wrap}>
      {valores.map((valor, index) => (
        <View
          key={`${index}-${valor}`}
          style={[
            chispaStyles.barra,
            {
              backgroundColor: withAlpha(color, index === valores.length - 1 ? 1 : 0.45),
              height: 5 + ((valor - min) / rango) * 22,
            },
          ]}
        />
      ))}
    </View>
  );
}

const chispaStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 28 },
  barra: { flex: 1, borderRadius: 2, minWidth: 3 },
});

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    panel: {
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.lg,
      gap: spacing.md,
      ...shadow.card,
    },
    presionado: { opacity: 0.85 },
    cabecera: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    aro: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    textos: { flex: 1, gap: 2 },
    tituloRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    titulo: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.subheading,
      color: colors.marfil,
      flexShrink: 1,
      minWidth: 0,
    },
    detalle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    valor: {
      fontFamily: fonts.sansBold,
      ...typeScale.title,
      color: colors.marfil,
      maxWidth: 140,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
    chipTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.label, letterSpacing: 0.8 },
    cuerpo: { gap: spacing.md },
  });
