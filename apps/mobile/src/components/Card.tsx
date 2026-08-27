import type { ReactNode } from "react";
import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/context/theme";
import { radius, spacing, type Palette } from "@/lib/theme";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Card destacada: gradiente guinda → guindaDark, para lo que quiere resaltar. */
  highlighted?: boolean;
};

export function Card({ children, style, highlighted = false }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (highlighted) {
    return (
      <LinearGradient
        colors={[colors.guinda, colors.guindaDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  return <View style={[styles.card, styles.plain, style]}>{children}</View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  plain: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
