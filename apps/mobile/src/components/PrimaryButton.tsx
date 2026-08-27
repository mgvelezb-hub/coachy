import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius, spacing } from "@/lib/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** CTA full-width: bg guinda, radius 16, texto Cinzel letter-spacing 4. */
export function PrimaryButton({ label, onPress, loading = false, disabled = false }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.marfil} />
      ) : (
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.guinda,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  pressed: {
    backgroundColor: colors.guindaDark,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.display,
    color: colors.marfil,
    fontSize: 13,
    letterSpacing: 4,
  },
});
