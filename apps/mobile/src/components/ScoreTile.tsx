import { ChevronRight } from "lucide-react-native";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import type { ScoreTone } from "@/components/ScoreCard";
import { fonts, radius, shadow, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

type ScoreTileProps = {
  icon: ComponentType<IconProps>;
  title: string;
  /** El número protagonista. Va grande: es lo que se lee de reojo. */
  value: string;
  /** Sufijo del número o contexto corto: "días", "de 5 sesiones", "cm". */
  detail?: string | null;
  status?: { label: string; tone: ScoreTone } | null;
  tint?: string;
  onPress?: () => void;
  /**
   * Una línea más de contexto, para la variante detallada del Resumen. Va
   * abajo del detalle y en el mismo tono: es contexto, no un segundo dato.
   */
  extra?: string;
  /**
   * Los últimos valores, para dibujar una tendencia mínima. Del más viejo al
   * más nuevo. Sin al menos dos puntos no se pinta nada: una línea de un solo
   * punto sugiere una tendencia que no existe.
   */
  serie?: number[];
};

/**
 * Mosaico de resumen: media pantalla de ancho, un dato por cuadro.
 *
 * Es el hermano corto de `ScoreCard`. La diferencia no es estética: una
 * tarjeta de ancho completo se lee en columna, una tras otra, y en una
 * pantalla que existe para dar el panorama eso obliga a hacer scroll para
 * saber cómo vas. En mosaico caben seis rubros en una pantalla y el ojo los
 * compara de un golpe.
 *
 * Por eso el mosaico NO despliega: lleva a su detalle. Un acordeón dentro de
 * un cuadro de media pantalla empuja a los vecinos y rompe la retícula.
 */
export function ScoreTile({
  icon: Icon,
  title,
  value,
  detail = null,
  status = null,
  tint,
  onPress,
  extra,
  serie,
}: ScoreTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = tint ?? colors.champan;

  const toneColor: Record<ScoreTone, string> = {
    ok: colors.champan,
    warn: colors.paloRosa,
    alto: colors.error,
    neutral: colors.paloRosaLight,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <View style={styles.head}>
        <View style={[styles.ring, { backgroundColor: withAlpha(color, 0.18) }]}>
          <Icon size={18} color={color} strokeWidth={2} />
        </View>
        {onPress && <ChevronRight size={18} color={colors.paloRosa} strokeWidth={2} />}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>

      {detail && (
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
      )}

      {extra && (
        <Text style={styles.extra} numberOfLines={2}>
          {extra}
        </Text>
      )}

      {serie && serie.length >= 2 && <Sparkline valores={serie} color={color} />}

      {status && (
        <View style={[styles.chip, { backgroundColor: withAlpha(toneColor[status.tone], 0.18) }]}>
          <Text style={[styles.chipText, { color: toneColor[status.tone] }]}>
            {status.label.toUpperCase()}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Tendencia mínima: una línea de barras, sin ejes ni etiquetas.
 *
 * No es una gráfica —para eso está el detalle de la métrica—: es la forma de
 * los últimos días, para saber si el número de arriba viene subiendo o
 * bajando sin cambiar de pantalla. Se dibuja con vistas y no con SVG a
 * propósito: en un cuadro de media pantalla, un SVG por tile multiplica el
 * costo de pintar el Resumen y ya nos costó una caída.
 */
function Sparkline({ valores, color }: { valores: number[]; color: string }) {
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = max - min || 1;

  return (
    <View style={sparkStyles.wrap}>
      {valores.map((valor, index) => (
        <View
          key={`${index}-${valor}`}
          style={[
            sparkStyles.barra,
            {
              backgroundColor: withAlpha(color, index === valores.length - 1 ? 1 : 0.45),
              height: 4 + ((valor - min) / rango) * 18,
            },
          ]}
        />
      ))}
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 24, marginTop: 6 },
  barra: { flex: 1, borderRadius: 2, minWidth: 3 },
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  extra: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
    marginTop: 2,
  },
  tile: {
    // Dos por renglón con el gap de en medio. `flexGrow` deja que el último
    // cuadro impar ocupe la fila completa en vez de quedar a la mitad.
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 150,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    padding: spacing.lg,
    gap: 2,
    ...shadow.card,
  },
  pressed: {
    opacity: 0.85,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  ring: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    letterSpacing: 0.8,
    color: colors.paloRosa,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
  },
  detail: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
  },
  chip: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  chipText: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 0.8,
  },
});
