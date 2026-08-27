import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius, spacing } from "@/lib/theme";

type Slider15Props = {
  value: number | null;
  onChange: (value: number) => void;
  /** Etiquetas opcionales bajo 1 y 5 (p. ej. "Nada" / "Mucho"). */
  lowLabel?: string;
  highLabel?: string;
};

const OPTIONS = [1, 2, 3, 4, 5];

/**
 * Selector 1-5 con botones grandes en vez de slider nativo: es para tocarse
 * con los dedos en el gym, no para arrastrar con precisión.
 */
export function Slider15({ value, onChange, lowLabel, highLabel }: Slider15Props) {
  return (
    <View>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[styles.button, selected && styles.buttonSelected]}
            >
              <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {(lowLabel || highLabel) && (
        <View style={styles.labelsRow}>
          <Text style={styles.hint}>{lowLabel ?? ""}</Text>
          <Text style={styles.hint}>{highLabel ?? ""}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSelected: {
    backgroundColor: colors.guinda,
    borderColor: colors.guindaLight,
  },
  buttonText: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.paloRosa,
  },
  buttonTextSelected: {
    color: colors.marfil,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
});
