import { useMemo } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette, type as typeScale } from "@/lib/theme";

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
  // "—" y no "0.0": un cero placeholder se lee como valor capturado.
  placeholder = "—",
  required = false,
  error,
  keyboardType = "decimal-pad",
}: StepperProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
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
    ...typeScale.heading,
    color: colors.marfil,
    paddingVertical: spacing.md,
  },
  unit: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginLeft: spacing.sm,
  },
  error: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.error,
  },
});
