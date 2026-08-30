import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Maximize2, Plus, X } from "lucide-react-native";
import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/context/theme";
import {
  ETIQUETA_ANCHO,
  ETIQUETA_VARIANTE,
  alternarAncho,
  definicionDe,
  mover,
  panelesDisponibles,
  siguienteVariante,
  type PanelConfig,
} from "@/lib/paneles";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * El editor del Resumen.
 *
 * Reordena con flechas y no arrastrando. Arrastrar se ve mejor en un video y
 * es peor aquí: una lista larga obliga a sostener el dedo mientras la pantalla
 * se desplaza sola, y con guantes de gimnasio o el teléfono en una mano
 * simplemente no sale. Dos botones grandes nunca fallan y además funcionan con
 * lector de pantalla.
 *
 * Cada panel se toca en tres cosas y se ven las tres a la vez: dónde va, con
 * cuánto detalle y de qué ancho. Nada de menús escondidos: si algo se puede
 * cambiar, se ve que se puede cambiar.
 */
export function EditorDePaneles({
  visible,
  layout,
  onChange,
  onClose,
}: {
  visible: boolean;
  layout: PanelConfig[];
  onChange: (layout: PanelConfig[]) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const disponibles = useMemo(() => panelesDisponibles(layout), [layout]);

  function quitar(id: string) {
    onChange(layout.filter((panel) => panel.id !== id));
  }

  function agregar(id: string) {
    const def = definicionDe(id);
    if (!def) return;
    onChange([...layout, { id, variante: def.variantes[0]!, ancho: def.anchos[0]! }]);
  }

  function cambiarVariante(id: string) {
    onChange(
      layout.map((panel) => {
        const def = definicionDe(panel.id);
        if (panel.id !== id || !def) return panel;
        return { ...panel, variante: siguienteVariante(def, panel.variante) };
      }),
    );
  }

  function cambiarAncho(id: string) {
    onChange(
      layout.map((panel) => {
        const def = definicionDe(panel.id);
        if (panel.id !== id || !def) return panel;
        return { ...panel, ancho: alternarAncho(def, panel.ancho) };
      }),
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.titulo}>Tu resumen</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.listo}>
            <Check size={18} color={colors.pergamino} strokeWidth={2.5} />
            <Text style={styles.listoTexto}>Listo</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={styles.ayuda}>
            Acomoda tu tablero: mueve los paneles, decide cuánto detalle quieres en cada uno y
            quita los que no mires. Se guarda en tu cuenta, así que sobrevive a un cambio de
            teléfono.
          </Text>

          <Text style={styles.seccion}>En tu resumen</Text>

          {layout.map((panel, index) => {
            const def = definicionDe(panel.id);
            if (!def) return null;

            return (
              <View key={panel.id} style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre}>{def.nombre}</Text>
                  <Text style={styles.filaPregunta}>{def.pregunta}</Text>

                  <View style={styles.opciones}>
                    <Pressable
                      onPress={() => cambiarVariante(panel.id)}
                      disabled={def.variantes.length < 2}
                      style={[styles.opcion, def.variantes.length < 2 && styles.opcionMuda]}
                    >
                      <Eye size={14} color={colors.champan} strokeWidth={2} />
                      <Text style={styles.opcionTexto}>{ETIQUETA_VARIANTE[panel.variante]}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => cambiarAncho(panel.id)}
                      disabled={def.anchos.length < 2}
                      style={[styles.opcion, def.anchos.length < 2 && styles.opcionMuda]}
                    >
                      <Maximize2 size={14} color={colors.champan} strokeWidth={2} />
                      <Text style={styles.opcionTexto}>{ETIQUETA_ANCHO[panel.ancho]}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.controles}>
                  <Pressable
                    onPress={() => onChange(mover(layout, panel.id, -1))}
                    disabled={index === 0}
                    hitSlop={6}
                    style={[styles.boton, index === 0 && styles.botonMudo]}
                    accessibilityLabel={`Subir ${def.nombre}`}
                  >
                    <ArrowUp size={18} color={colors.marfil} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => onChange(mover(layout, panel.id, 1))}
                    disabled={index === layout.length - 1}
                    hitSlop={6}
                    style={[styles.boton, index === layout.length - 1 && styles.botonMudo]}
                    accessibilityLabel={`Bajar ${def.nombre}`}
                  >
                    <ArrowDown size={18} color={colors.marfil} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => quitar(panel.id)}
                    hitSlop={6}
                    style={styles.boton}
                    accessibilityLabel={`Quitar ${def.nombre}`}
                  >
                    <EyeOff size={18} color={colors.paloRosa} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            );
          })}

          {disponibles.length > 0 && (
            <>
              <Text style={styles.seccion}>Para agregar</Text>
              {disponibles.map((def) => (
                <Pressable
                  key={def.id}
                  onPress={() => agregar(def.id)}
                  style={({ pressed }) => [styles.fila, pressed && styles.filaPresionada]}
                >
                  <View style={styles.filaTexto}>
                    <Text style={styles.filaNombre}>{def.nombre}</Text>
                    <Text style={styles.filaPregunta}>{def.pregunta}</Text>
                    <Text style={styles.filaGrupo}>{def.grupo}</Text>
                  </View>
                  <View style={styles.boton}>
                    <Plus size={18} color={colors.champan} strokeWidth={2.5} />
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {layout.length === 0 && (
            <Text style={styles.ayuda}>
              Tu resumen quedó vacío. Agrega al menos un panel o cierra y la app volverá a poner
              el tablero de siempre.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** El botón que abre el editor, para la cabecera del Resumen. */
export function BotonEditar({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.editar} accessibilityLabel="Editar tu resumen">
      <Text style={styles.editarTexto}>Editar</Text>
    </Pressable>
  );
}

/** La X que se pinta encima de un panel mientras el editor está abierto. */
export function QuitarPanel({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.quitar} accessibilityLabel="Quitar panel">
      <X size={14} color={colors.pergamino} strokeWidth={3} />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    titulo: { fontFamily: fonts.sansBold, ...typeScale.heading, color: colors.marfil },
    listo: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.guinda,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    listoTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.pergamino },
    contenido: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.huge },
    ayuda: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    seccion: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.paloRosa,
      marginTop: spacing.lg,
    },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.md,
    },
    filaPresionada: { opacity: 0.85 },
    filaTexto: { flex: 1, gap: 2 },
    filaNombre: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    filaPregunta: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    filaGrupo: {
      fontFamily: fonts.sansMedium,
      ...typeScale.label,
      color: colors.paloRosaLight,
      marginTop: 2,
    },
    opciones: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
    opcion: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: withAlpha(colors.champan, 0.4),
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    opcionMuda: { opacity: 0.4 },
    opcionTexto: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.champan },
    controles: { flexDirection: "row", gap: spacing.xs },
    boton: {
      width: 38,
      height: 38,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(colors.paloRosa, 0.12),
    },
    botonMudo: { opacity: 0.3 },
    editar: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    editarTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.champan },
    quitar: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 26,
      height: 26,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.error,
      zIndex: 2,
    },
  });
