import { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, type Palette } from "@/lib/theme";

type SectionLabelProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
};

/** Label de sección: Cinzel, MAYÚSCULAS, letter-spacing amplio, color paloRosa. */
export function SectionLabel({ children, style, color }: SectionLabelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={[styles.label, { color: color ?? colors.paloRosa }, style]}>{children.toUpperCase()}</Text>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2.5,
  },
});
