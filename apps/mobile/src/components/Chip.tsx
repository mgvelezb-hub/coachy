import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius, spacing } from "@/lib/theme";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: "default" | "champan";
};

/** Pill/badge: Cinzel 9-10px, letter-spacing 2-3, color paloRosa (o champan). */
export function Chip({ label, selected = false, onPress, tone = "default" }: ChipProps) {
  const activeColor = tone === "champan" ? colors.champan : colors.guindaLight;
  const textColor = selected ? colors.marfil : tone === "champan" ? colors.champan : colors.paloRosa;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        selected && { backgroundColor: activeColor, borderColor: activeColor },
      ]}
    >
      <Text style={[styles.label, { color: textColor }]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 9,
    letterSpacing: 2,
  },
});
