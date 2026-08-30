import type { ReactNode } from "react";
import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/context/theme";
import { radius, shadow, spacing, type Palette } from "@/lib/theme";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Card destacada: guinda sólido, para lo que quiere resaltar. */
  highlighted?: boolean;
};

export function Card({ children, style, highlighted = false }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (highlighted) {
    return (
      <View style={[styles.card, { backgroundColor: colors.guinda }, style]}>{children}</View>
    );
  }

  return <View style={[styles.card, styles.plain, style]}>{children}</View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    // Radio grande + sombra: es lo que separa una tarjeta del fondo. Con
    // radius.lg y sin sombra, tres tarjetas seguidas se leían como una sola
    // columna de rectángulos.
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  plain: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
