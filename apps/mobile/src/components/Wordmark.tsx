import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/lib/theme";

type WordmarkProps = {
  size?: "lg" | "md";
};

/** Wordmark de texto: "HOLY" Cinzel + "Gains" Cormorant itálica, versión dark. */
export function Wordmark({ size = "md" }: WordmarkProps) {
  const holySize = size === "lg" ? 34 : 22;
  const gainsSize = size === "lg" ? 26 : 18;

  return (
    <View style={styles.container}>
      <Text style={[styles.holy, { fontSize: holySize, letterSpacing: 14 }]}>HOLY</Text>
      <Text style={[styles.gains, { fontSize: gainsSize }]}>Gains</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
