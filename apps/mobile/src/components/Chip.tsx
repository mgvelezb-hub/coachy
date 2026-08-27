import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette } from "@/lib/theme";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: "default" | "champan";
};

/** Pill/badge: Cinzel 9-10px, letter-spacing 2-3, color paloRosa (o champan). */
export function Chip({ label, selected = false, onPress, tone = "default" }: ChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activeColor = tone === "champan" ? colors.champan : colors.guindaLight;
  // pergamino: rol "texto sobre fondo de acento" — el chip seleccionado pinta
  // su fondo con activeColor (guindaLight/champan), así que el texto no puede
  // ser marfil (ese es el rol "texto principal", pensado para el fondo de la
  // pantalla, no para encima de un acento).
  const textColor = selected ? colors.pergamino : tone === "champan" ? colors.champan : colors.paloRosa;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        selected && { backgroundColor: activeColor, borderColor: activeColor },
      ]}
    >
      <Text style={[styles.label, { color: textColor }]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 9,
    letterSpacing: 2,
  },
});
