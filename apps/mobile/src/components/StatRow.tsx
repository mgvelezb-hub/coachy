import { ChevronRight } from "lucide-react-native";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, shadow, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

type StatRowProps = {
  /** Ícono de lucide, sin instanciar: `icon={Footprints}`. */
  icon: ComponentType<IconProps>;
  label: string;
  /** El dato. Va grande — es lo único que se lee de reojo. */
  value: string;
  /** Sufijo pequeño pegado al dato: "pasos", "/ 100", "kg". */
  unit?: string | null;
  /** Color del acento de la fila (ícono + tinte del degradado). */
  tint: string;
  onPress?: () => void;
};

/**
 * Fila-dato: ícono con su tinte, etiqueta grande y el número protagonista.
 *
 * Es la pieza que rompe la pantalla plana. Cada fila trae su propio color y un
 * degradado que va de transparente a un velo de ese color hacia la derecha, así
 * que la lista se lee como tarjetas distintas y no como renglones de una tabla.
 * El tinte es del ROL del dato (movimiento, descanso, medidas), no decoración
 * suelta: el mismo dato usa el mismo color en toda la app.
 */
export function StatRow({ icon: Icon, label, value, unit, tint, onPress }: StatRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <View style={[styles.row, { backgroundColor: withAlpha(tint, 0.12) }]}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(tint, 0.18) }]}>
          <Icon size={24} color={tint} strokeWidth={2} />
        </View>

        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>

        <View style={styles.valueWrap}>
          <Text style={styles.value}>{value}</Text>
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>

        {onPress ? <ChevronRight size={22} color={colors.paloRosa} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    ...shadow.card,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    ...typeScale.subheading,
    color: colors.marfil,
  },
  valueWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
  },
  unit: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
});
