import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { fonts, spacing, type Palette } from "@/lib/theme";

type CollapsibleProps = {
  title: string;
  children: ReactNode;
  /** Empieza abierto. Útil para el primer elemento de un acordeón. */
  defaultOpen?: boolean;
  subtitle?: string;
};

/** Acordeón simple: título tocable que muestra/oculta su contenido. */
export function Collapsible({ title, children, defaultOpen = false, subtitle }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <Text style={styles.chevron}>{open ? "−" : "+"}</Text>
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
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.marfil,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.paloRosaLight,
  },
  chevron: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.paloRosa,
    marginLeft: spacing.md,
  },
  body: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
});
