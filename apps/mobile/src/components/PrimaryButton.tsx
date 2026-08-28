import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type Palette, type as typeScale } from "@/lib/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** CTA full-width: bg guinda, radius 16, texto Cinzel letter-spacing 4. */
export function PrimaryButton({ label, onPress, loading = false, disabled = false }: PrimaryButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        // pergamino: rol "texto sobre fondo de acento" — el botón siempre
        // pinta su fondo con guinda, así que el spinner/texto usa el mismo
        // rol que el label de abajo, nunca "marfil" (texto principal).
        <ActivityIndicator color={colors.pergamino} />
      ) : (
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    fontFamily: fonts.sansSemiBold,
    color: colors.pergamino,
    ...typeScale.bodySm,
    letterSpacing: 4,
  },
});
