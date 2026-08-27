import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette } from "@/lib/theme";

type PercentStepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
};

/** Selector 0-100% con botones +/- de paso grande, para cumplimiento dieta/entreno. */
export function PercentStepper({ label, value, onChange, step = 10 }: PercentStepperProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dec = () => onChange(Math.max(0, value - step));
  const inc = () => onChange(Math.min(100, value + step));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        <Pressable onPress={dec} style={styles.button}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        <View style={styles.valueBox}>
          <Text style={styles.value}>{value}%</Text>
        </View>
        <Pressable onPress={inc} style={styles.button}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
    fontSize: 22,
    color: colors.marfil,
  },
});
