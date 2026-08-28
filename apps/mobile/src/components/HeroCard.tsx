import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/context/theme";
import { fonts, radius, shadow, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

type HeroCardProps = {
  title: string;
  subtitle?: string | null;
  /** Etiqueta corta arriba del título (fase, estado, "hoy"). */
  eyebrow?: string | null;
  /** Contenido extra debajo del subtítulo (chips, macros, lo que sea). */
  children?: ReactNode;
  onPress?: () => void;
  /** Gradiente de la tarjeta. Por defecto guinda → guindaDark (el acento de marca). */
  colorsOverride?: [string, string];
  style?: StyleProp<ViewStyle>;
};

/**
 * Tarjeta protagonista: degradado a sangre y el título grande. Es la que abre
 * cada bloque de la pantalla.
 *
 * Sin marca de agua: se probó con las ondas del monograma de fondo y competían
 * con el texto en vez de acompañarlo. El degradado solo ya distingue esta
 * tarjeta de las demás, que es todo lo que tenía que hacer.
 */
export function HeroCard({
  title,
  subtitle,
  eyebrow,
  children,
  onPress,
  colorsOverride,
  style,
}: HeroCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const gradient = colorsOverride ?? [colors.guinda, colors.guindaDark];

  const content = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, style]}
    >
      <View style={styles.body}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>

      {onPress ? (
        <View style={styles.chevron}>
          <ChevronRight size={26} color={colors.pergamino} strokeWidth={2} />
        </View>
      ) : null}
    </LinearGradient>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {content}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    padding: spacing.xl,
    minHeight: 150,
    justifyContent: "flex-end",
    overflow: "hidden",
    ...shadow.hero,
  },
  pressed: {
    opacity: 0.9,
  },
  body: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1.6,
    color: colors.pergaminoSoft,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.pergamino,
  },
  subtitle: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: withAlpha(colors.pergamino, 0.82),
  },
  chevron: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.xl,
  },
});
