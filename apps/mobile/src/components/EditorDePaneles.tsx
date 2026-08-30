import { GripVertical, Plus, RotateCcw, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/context/theme";
import {
  ETIQUETA_ANCHO,
  ETIQUETA_VARIANTE,
  MUESTRA_VARIANTE,
  definicionDe,
  layoutPorDefecto,
  moverA,
  panelesDisponibles,
  type Ancho,
  type PanelConfig,
  type Variante,
} from "@/lib/paneles";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/** Alto de cada fila del editor. Fijo, porque de él sale la posición al arrastrar. */
const ALTO_FILA = 96;

/**
 * El editor del Resumen.
 *
 * Se arrastra para reordenar, como cualquier pantalla de widgets: el gesto ya
 * está aprendido y nadie tiene que descubrir un par de flechas. La fila que se
 * levanta sigue al dedo y las demás se recorren; al soltar, el acomodo se
 * guarda.
 *
 * Las filas miden lo mismo a propósito (`ALTO_FILA`): con alturas variables la
 * posición de destino habría que medirla en tiempo real, y el cálculo se
 * vuelve frágil justo mientras el dedo está encima.
 *
 * Abajo, los disponibles van como una lista de nombres y no como tarjetas de
 * muestra: agregar es una decisión de una palabra, y seis previsualizaciones
 * la vuelven una lectura larga.
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
  const [abierto, setAbierto] = useState<string | null>(null);

  function quitar(id: string) {
    onChange(layout.filter((panel) => panel.id !== id));
    if (abierto === id) setAbierto(null);
  }

  function agregar(id: string) {
    const def = definicionDe(id);
    if (!def) return;
    onChange([...layout, { id, variante: def.variantes[0]!, ancho: def.anchos[0]! }]);
    setAbierto(id);
  }

  function aplicar(id: string, cambios: Partial<PanelConfig>) {
    onChange(layout.map((panel) => (panel.id === id ? { ...panel, ...cambios } : panel)));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.raiz}>
        {/* `edges` incluye arriba: sin eso el título y el botón quedaban debajo
            de la hora y la batería, y "Listo" era casi intocable. */}
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Tu resumen</Text>
            <View style={styles.headerBotones}>
              <Pressable
                onPress={() => onChange(layoutPorDefecto())}
                hitSlop={8}
                style={styles.restaurar}
                accessibilityLabel="Restaurar el tablero de siempre"
              >
                <RotateCcw size={16} color={colors.paloRosa} strokeWidth={2} />
                <Text style={styles.restaurarTexto}>Restaurar</Text>
              </Pressable>
              <Pressable onPress={() => onChange([])} hitSlop={8} style={styles.restaurar}>
                <Text style={styles.restaurarTexto}>Limpiar todo</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={10} style={styles.listo}>
                <Text style={styles.listoTexto}>Listo</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.contenido}>
            <Text style={styles.ayuda}>
              Arrastra para acomodar. Toca un panel para elegir su tamaño y cuánto detalle
              muestra. Se guarda en tu cuenta.
            </Text>

            <View style={{ height: layout.length * ALTO_FILA }}>
              {layout.map((panel, index) => (
                <FilaArrastrable
                  key={panel.id}
                  index={index}
                  total={layout.length}
                  panel={panel}
                  abierto={abierto === panel.id}
                  onAbrir={() => setAbierto(abierto === panel.id ? null : panel.id)}
                  onQuitar={() => quitar(panel.id)}
                  onAplicar={(cambios) => aplicar(panel.id, cambios)}
                  onSoltar={(destino) => onChange(moverA(layout, panel.id, destino))}
                />
              ))}
            </View>

            {layout.length === 0 && (
              <Text style={styles.ayuda}>
                Tu resumen quedó vacío. Agrega los paneles que quieras de la lista de abajo.
              </Text>
            )}

            {disponibles.length > 0 && (
              <>
                <Text style={styles.seccion}>Para agregar</Text>
                <View style={styles.disponibles}>
                  {disponibles.map((def) => (
                    <Pressable
                      key={def.id}
                      onPress={() => agregar(def.id)}
                      style={({ pressed }) => [styles.pastilla, pressed && styles.pastillaPresionada]}
                    >
                      <Plus size={14} color={colors.champan} strokeWidth={2.5} />
                      <Text style={styles.pastillaTexto}>{def.nombre}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Una fila del editor: se arrastra, se abre para configurar y se quita.
 *
 * El desplazamiento vive en un `SharedValue` para que el arrastre corra en el
 * hilo de UI; solo al soltar se cruza a JS con `runOnJS`, que es donde vive el
 * acomodo.
 */
function FilaArrastrable({
  index,
  total,
  panel,
  abierto,
  onAbrir,
  onQuitar,
  onAplicar,
  onSoltar,
}: {
  index: number;
  total: number;
  panel: PanelConfig;
  abierto: boolean;
  onAbrir: () => void;
  onQuitar: () => void;
  onAplicar: (cambios: Partial<PanelConfig>) => void;
  onSoltar: (destino: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const def = definicionDe(panel.id);

  const desplazamiento = useSharedValue(0);
  const arrastrando = useSharedValue(false);

  const gesto = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      arrastrando.value = true;
    })
    .onUpdate((evento) => {
      desplazamiento.value = evento.translationY;
    })
    .onEnd(() => {
      const saltos = Math.round(desplazamiento.value / ALTO_FILA);
      const destino = Math.max(0, Math.min(total - 1, index + saltos));
      arrastrando.value = false;
      desplazamiento.value = withTiming(0, { duration: 120 });
      if (destino !== index) runOnJS(onSoltar)(destino);
    });

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateY: desplazamiento.value }, { scale: arrastrando.value ? 1.03 : 1 }],
    zIndex: arrastrando.value ? 10 : 1,
    opacity: arrastrando.value ? 0.95 : 1,
  }));

  if (!def) return null;

  return (
    <Animated.View style={[styles.filaPosicion, { top: index * ALTO_FILA }, estilo]}>
      <View style={styles.fila}>
        <GestureDetector gesture={gesto}>
          <View style={styles.asa} accessibilityLabel={`Arrastrar ${def.nombre}`}>
            <GripVertical size={20} color={colors.paloRosa} strokeWidth={2} />
          </View>
        </GestureDetector>

        <Pressable onPress={onAbrir} style={styles.filaTexto}>
          <Text style={styles.filaNombre} numberOfLines={1}>
            {def.nombre}
          </Text>
          <Text style={styles.filaPregunta} numberOfLines={1}>
            {ETIQUETA_ANCHO[panel.ancho]} · {ETIQUETA_VARIANTE[panel.variante]}
          </Text>
        </Pressable>

        {/* La tacha va arriba a la derecha, como en cualquier pantalla de
            widgets: es el gesto que la gente ya trae aprendido. */}
        <Pressable onPress={onQuitar} hitSlop={8} style={styles.tacha} accessibilityLabel={`Quitar ${def.nombre}`}>
          <X size={14} color={colors.pergamino} strokeWidth={3} />
        </Pressable>
      </View>

      {abierto && (
        <View style={styles.opciones}>
          <Text style={styles.opcionesTitulo}>Tamaño</Text>
          <View style={styles.opcionesFila}>
            {def.anchos.map((ancho: Ancho) => (
              <Pressable
                key={ancho}
                onPress={() => onAplicar({ ancho })}
                style={[styles.opcion, panel.ancho === ancho && styles.opcionActiva]}
              >
                <Text style={[styles.opcionTexto, panel.ancho === ancho && styles.opcionTextoActivo]}>
                  {ETIQUETA_ANCHO[ancho]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.opcionesTitulo}>Qué muestra</Text>
          {def.variantes.map((variante: Variante) => (
            <Pressable
              key={variante}
              onPress={() => onAplicar({ variante })}
              style={[styles.muestra, panel.variante === variante && styles.muestraActiva]}
            >
              <Text
                style={[
                  styles.muestraNombre,
                  panel.variante === variante && styles.opcionTextoActivo,
                ]}
              >
                {ETIQUETA_VARIANTE[variante]}
              </Text>
              {/* La muestra dice qué vas a ver antes de elegir: sin ella hay
                  que salir, mirar y volver a entrar por cada opción. */}
              <Text style={styles.muestraEjemplo}>{MUESTRA_VARIANTE[variante]}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    raiz: { flex: 1, backgroundColor: colors.obsidiana },
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
      gap: spacing.sm,
    },
    titulo: { fontFamily: fonts.sansBold, ...typeScale.heading, color: colors.marfil },
    headerBotones: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    restaurar: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
    restaurarTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    listo: {
      backgroundColor: colors.guinda,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    listoTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.pergamino },
    contenido: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.huge },
    ayuda: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    seccion: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.paloRosa,
      marginTop: spacing.lg,
    },
    filaPosicion: { position: "absolute", left: 0, right: 0 },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      paddingVertical: spacing.md,
      paddingLeft: spacing.xs,
      paddingRight: spacing.lg,
      height: ALTO_FILA - spacing.md,
    },
    asa: { padding: spacing.sm },
    filaTexto: { flex: 1, gap: 2 },
    filaNombre: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    filaPregunta: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    tacha: {
      width: 26,
      height: 26,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.error,
    },
    opciones: {
      marginTop: -spacing.xs,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xl,
      backgroundColor: withAlpha(colors.paloRosa, 0.08),
      gap: spacing.sm,
    },
    opcionesTitulo: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.paloRosa,
    },
    opcionesFila: { flexDirection: "row", gap: spacing.sm },
    opcion: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    opcionActiva: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    opcionTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    opcionTextoActivo: { color: colors.pergamino },
    muestra: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      gap: 2,
    },
    muestraActiva: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    muestraNombre: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.marfil },
    muestraEjemplo: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    disponibles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pastilla: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: withAlpha(colors.champan, 0.45),
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pastillaPresionada: { opacity: 0.7 },
    pastillaTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    editar: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    editarTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.champan },
  });
