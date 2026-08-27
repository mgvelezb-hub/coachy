import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette } from "@/lib/theme";

type NumberStepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
};

/**
 * Selector numérico +/- de paso libre, hermano de `PercentStepper` pero sin el
 * tope de 0-100%: para peso (kg, paso 2.5) y reps (paso 1) en el modo
 * gimnasio. Botones de 44px — se usa con las manos sudadas.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
}: NumberStepperProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dec = () => onChange(Math.max(min, Number((value - step).toFixed(2))));
  const inc = () => onChange(Number((value + step).toFixed(2)));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        <Pressable onPress={dec} style={styles.button} hitSlop={8}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        <View style={styles.valueBox}>
          <Text style={styles.value}>
            {value}
            {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
          </Text>
        </View>
        <Pressable onPress={inc} style={styles.button} hitSlop={8}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.paloRosa,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.marfil,
  },
  valueBox: {
    flex: 1,
    alignItems: "center",
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.marfil,
  },
  suffix: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
});
