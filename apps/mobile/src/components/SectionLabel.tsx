import { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, type as typeScale, type Palette } from "@/lib/theme";

type SectionLabelProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
};

/**
 * Label de sección: MAYÚSCULAS, letter-spacing amplio, color paloRosa.
 *
 * Iba en Cinzel a 10 px. Cinzel es una romana de capitales con remates finos:
 * a ese tamaño los remates desaparecen y lo que queda es una etiqueta afilada
 * y difícil de leer. Ahora va en Inter semibold a 12 — la marca vive en el
 * wordmark y en los títulos, no en cada etiqueta de la interfaz.
 */
export function SectionLabel({ children, style, color }: SectionLabelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={[styles.label, { color: color ?? colors.paloRosa }, style]}>{children.toUpperCase()}</Text>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  label: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1.6,
  },
});
