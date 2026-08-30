import { ChevronDown, ChevronRight } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, shadow, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

export type ScoreTone = "ok" | "warn" | "alto" | "neutral";

type ScoreCardProps = {
  /** Ícono de lucide sin instanciar: `icon={Dumbbell}`. */
  icon: ComponentType<IconProps>;
  title: string;
  /**
   * El dato duro que se lee SIN abrir la tarjeta: "5 días · 2 hechos · hoy
   * bíceps". No es un subtítulo decorativo — si aquí no hay un número, la
   * tarjeta cerrada no sirve y conviene replantear qué resume.
   */
  summary: string;
  /** Estado de un vistazo. Opcional: no todo tiene semáforo. */
  status?: { label: string; tone: ScoreTone } | null;
  /** Color del rubro. El mismo dato usa el mismo tinte en toda la app. */
  tint?: string;
  /** El detalle. Si no hay, la tarjeta no abre y se comporta como fila. */
  children?: ReactNode;
  /** Abrir de entrada. Por defecto NO: la app arranca cerrada y limpia. */
  defaultOpen?: boolean;
  /** Cuando la tarjeta lleva a otra pantalla en vez de desplegar. */
  onPress?: () => void;
};

/**
 * Tarjeta-resumen colapsable.
 *
 * La regla que la hace útil: **cerrada ya contesta**. Ícono con su tinte,
 * título, un dato duro y —cuando aplica— un estado. Abrir es para el detalle,
 * nunca para enterarte de si te interesa; una tarjeta cerrada que solo dice
 * "Alimentación ›" obliga a abrirlas todas para encontrar algo, que es
 * exactamente lo que se quería evitar al colapsarlas.
 */
export function ScoreCard({
  icon: Icon,
  title,
  summary,
  status = null,
  tint,
  children,
  defaultOpen = false,
  onPress,
}: ScoreCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(defaultOpen);

  const color = tint ?? colors.champan;
  const expandible = children !== undefined && onPress === undefined;

  const toneColor: Record<ScoreTone, string> = {
    ok: colors.champan,
    warn: colors.paloRosa,
    alto: colors.error,
    neutral: colors.paloRosaLight,
  };

  function handlePress() {
    if (onPress) return onPress();
    if (expandible) setOpen((value) => !value);
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={handlePress}
        disabled={!expandible && !onPress}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={expandible ? { expanded: open } : undefined}
      >
        <View style={[styles.ring, { backgroundColor: withAlpha(color, 0.18) }]}>
          <Icon size={22} color={color} strokeWidth={2} />
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.summary}>{summary}</Text>

          {/* La etiqueta va DEBAJO del resumen, no a su derecha.
              Compartiendo renglón le robaba el ancho al texto y lo partía en
              tres o cuatro líneas cortas; el dato quedaba estrangulado para
              que cupiera una palabra en mayúsculas. Abajo, el resumen usa
              todo el ancho y la etiqueta se lee igual de bien. */}
          {status && (
            <View style={styles.chipRow}>
              <View
                style={[styles.chip, { backgroundColor: withAlpha(toneColor[status.tone], 0.18) }]}
              >
                <Text style={[styles.chipText, { color: toneColor[status.tone] }]}>
                  {status.label.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        </View>

        {expandible ? (
          open ? (
            <ChevronDown size={20} color={colors.paloRosa} strokeWidth={2} />
          ) : (
            <ChevronRight size={20} color={colors.paloRosa} strokeWidth={2} />
          )
        ) : onPress ? (
          <ChevronRight size={20} color={colors.paloRosa} strokeWidth={2} />
        ) : null}
      </Pressable>

      {expandible && open && <View style={styles.detalle}>{children}</View>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    overflow: "hidden",
    ...shadow.card,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  ring: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  chipRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.subheading,
    color: colors.marfil,
  },
  summary: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  chipText: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 0.8,
  },
  detalle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
});
