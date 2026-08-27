import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, type Palette } from "@/lib/theme";

type WordmarkProps = {
  size?: "lg" | "md";
};

/** Wordmark de texto: "HOLY" Cinzel + "Gains" Cormorant itálica, color de texto del tema activo. */
export function Wordmark({ size = "md" }: WordmarkProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const holySize = size === "lg" ? 34 : 22;
  const gainsSize = size === "lg" ? 26 : 18;

  return (
    <View style={styles.container}>
      <Text style={[styles.holy, { fontSize: holySize, letterSpacing: 14 }]}>HOLY</Text>
      <Text style={[styles.gains, { fontSize: gainsSize }]}>Gains</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { alignItems: "center" },
  holy: {
    fontFamily: fonts.display,
    color: colors.marfil,
  },
  gains: {
    fontFamily: fonts.serifItalic,
    color: colors.marfil,
    marginTop: -2,
  },
});
