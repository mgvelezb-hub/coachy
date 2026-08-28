import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";

import { fonts, paletteDark, spacing } from "@/lib/theme";

/**
 * La apertura de la app: "Holy Gains" escribiéndose sobre el guinda, y debajo
 * la cita apareciendo en desvanecido.
 *
 * Cómo está hecho el trazo: el texto SIEMPRE está pintado, y encima corre un
 * bloque del mismo guinda del fondo que se desliza hacia la derecha y lo va
 * destapando. Eso es una traslación pura, así que corre en el hilo nativo y no
 * se entrecorta aunque el JS esté ocupado montando la sesión. Animar el ancho
 * del contenedor daría el mismo efecto visual, pero es una propiedad de layout:
 * la recalcula el JS cuadro por cuadro, y justo en el arranque es cuando menos
 * disponible está.
 *
 * El color es el literal del tema oscuro, no el del tema activo: esta pantalla
 * es la marca, y la marca no cambia de color porque el teléfono esté en claro.
 * Por lo mismo el fondo tiene que ser plano — el bloque que tapa el texto solo
 * puede desaparecer contra un fondo idéntico a él.
 */

const GUINDA = paletteDark.guinda;
const TINTA = paletteDark.marfil;

/** Cuánto tarda el trazo. Más rápido se siente un parpadeo; más lento estorba. */
const WRITE_MS = 1500;
const VERSE_MS = 900;
/** Lo que se queda quieto antes de entrar a la app. */
const HOLD_MS = 550;
const FADE_OUT_MS = 450;

/** Con "reducir movimiento" no se escribe nada: aparece y ya. */
const REDUCED_FADE_MS = 500;
const REDUCED_HOLD_MS = 450;

export function OpeningSequence({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [textWidth, setTextWidth] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  const cover = useRef(new Animated.Value(0)).current;
  const pen = useRef(new Animated.Value(1)).current;
  const verse = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const screen = useRef(new Animated.Value(1)).current;

  // El tamaño sale del ancho de la pantalla: "Holy Gains" tiene que llenar el
  // espacio en un iPhone chico sin salirse en uno grande.
  const fontSize = Math.min(width * 0.16, 64);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    if (textWidth === null || reduceMotion === null) return;

    const salida = Animated.timing(screen, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    if (reduceMotion) {
      cover.setValue(textWidth + spacing.md);
      pen.setValue(0);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(title, { toValue: 1, duration: REDUCED_FADE_MS, useNativeDriver: true }),
          Animated.timing(verse, { toValue: 1, duration: REDUCED_FADE_MS, useNativeDriver: true }),
        ]),
        Animated.delay(REDUCED_HOLD_MS),
        salida,
      ]).start(({ finished }) => finished && onDone());
      return;
    }

    title.setValue(1);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(cover, {
          toValue: textWidth + spacing.md,
          duration: WRITE_MS,
          // Arranca decidido y cierra suave, como termina un trazo a mano.
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        // La pluma se apaga sobre el final del trazo, no de golpe al terminar.
        Animated.timing(pen, {
          toValue: 0,
          duration: WRITE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(verse, {
        toValue: 1,
        duration: VERSE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      salida,
    ]).start(({ finished }) => finished && onDone());
  }, [textWidth, reduceMotion, cover, pen, verse, title, screen, onDone]);

  function measure(event: LayoutChangeEvent) {
    if (textWidth === null) setTextWidth(event.nativeEvent.layout.width);
  }

  return (
    <Animated.View style={[styles.screen, { opacity: screen }]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={{ opacity: title }}>
          <View>
            <Text
              onLayout={measure}
              numberOfLines={1}
              style={[styles.title, { fontSize, lineHeight: fontSize * 1.35 }]}
            >
              Holy Gains
            </Text>

            {textWidth !== null && (
              <>
                <Animated.View
                  style={[
                    styles.cover,
                    { width: textWidth + spacing.md, transform: [{ translateX: cover }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.pen,
                    {
                      height: fontSize * 0.95,
                      opacity: pen,
                      transform: [{ translateX: cover }],
                    },
                  ]}
                />
              </>
            )}
          </View>
        </Animated.View>

        <Animated.View style={[styles.verseRow, { opacity: verse }]}>
          <View style={styles.rule} />
          <Text style={styles.verse}>1 · COR · 16 · 14</Text>
          <View style={styles.rule} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: GUINDA,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  center: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
  },
  title: {
    fontFamily: fonts.serifItalic,
    color: TINTA,
    letterSpacing: 1,
    textAlign: "center",
  },
  cover: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: GUINDA,
  },
  pen: {
    position: "absolute",
    top: "12%",
    left: 0,
    width: 1.5,
    borderRadius: 1,
    backgroundColor: TINTA,
  },
  verseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  rule: {
    width: 44,
    height: StyleSheet.hairlineWidth,
    backgroundColor: TINTA,
    opacity: 0.45,
  },
  verse: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 5,
    color: TINTA,
    opacity: 0.75,
  },
});
