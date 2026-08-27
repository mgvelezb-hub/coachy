import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { colors, fonts } from "@/lib/theme";

type SectionLabelProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
};

/** Label de sección: Cinzel, MAYÚSCULAS, letter-spacing amplio, color paloRosa. */
export function SectionLabel({ children, style, color = colors.paloRosa }: SectionLabelProps) {
  return <Text style={[styles.label, { color }, style]}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2.5,
  },
});
