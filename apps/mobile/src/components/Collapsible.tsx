import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, spacing, type Palette, type as typeScale } from "@/lib/theme";

type CollapsibleProps = {
  title: string;
  children: ReactNode;
  /** Empieza abierto. Útil para el primer elemento de un acordeón. */
  defaultOpen?: boolean;
  subtitle?: string;
  /** Va montado sobre una tarjeta de acento: el texto invierte a `pergamino`. */
  onAccent?: boolean;
  /**
   * Qué tan adentro está en un acordeón anidado: 0 es el primer nivel.
   *
   * La biblioteca llega a tres —zona, nivel, ejercicio— y sin diferencia
   * visual los tres se ven igual: no se sabe qué contiene qué. Cada escalón
   * mete sangría y baja un punto la jerarquía del título.
   */
  depth?: number;
};

/** Acordeón simple: título tocable que muestra/oculta su contenido. */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  subtitle,
  onAccent = false,
  depth = 0,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, depth > 0 && { paddingLeft: spacing.md }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.title,
              depth === 1 && styles.titleNested,
              depth >= 2 && styles.titleDeep,
              onAccent && { color: colors.pergamino },
            ]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, onAccent && { color: colors.pergaminoSoft }]}>{subtitle}</Text>
          )}
        </View>
        <Text style={[styles.chevron, onAccent && { color: colors.pergaminoSoft }]}>{open ? "−" : "+"}</Text>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  // El segundo escalón baja de peso y de tono; el tercero además reduce el
  // espacio vertical, porque a esa profundidad hay muchas filas seguidas.
  titleNested: { fontFamily: fonts.sansMedium, color: colors.paloRosa },
  titleDeep: { fontFamily: fonts.sans, color: colors.paloRosa },
  title: {
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.marfil,
  },
  subtitle: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  chevron: {
    fontFamily: fonts.display,
    ...typeScale.heading,
    color: colors.paloRosa,
    marginLeft: spacing.md,
  },
  body: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
});
