import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts, radius, spacing } from "@/lib/theme";

type StepperProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  unit?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  /** Teclado decimal para medidas en cm/kg con un decimal. */
  keyboardType?: "decimal-pad" | "number-pad";
};

/** Input numérico con teclado decimal: para medidas del check-in. */
export function Stepper({
  label,
  value,
  onChangeText,
  unit,
  placeholder = "0.0",
  required = false,
  error,
  keyboardType = "decimal-pad",
}: StepperProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      <View style={[styles.inputRow, error && styles.inputRowError]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.paloRosaLight}
          keyboardType={keyboardType}
          style={styles.input}
        />
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inputRowError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 18,
    color: colors.marfil,
    paddingVertical: spacing.md,
  },
  unit: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.paloRosaLight,
    marginLeft: spacing.sm,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.error,
  },
});
