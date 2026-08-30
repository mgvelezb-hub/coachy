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
        <Text style={styles.titulo} numberOfLines={1}>
          {title}
        </Text>
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

      {children ? <View style={styles.cuerpo}>{children}</View> : null}
    </View>
  );
}

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
    titulo: { fontFamily: fonts.sansSemiBold, ...typeScale.subheading, color: colors.marfil },
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
