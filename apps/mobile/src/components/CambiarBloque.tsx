import { RefreshCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/theme";
import { ApiError, postCambiarBloque, type Discipline } from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
import { DISCIPLINAS } from "@/lib/entrenamiento";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * "Hoy no pude ir" — cambiar el bloque de hoy por otra cosa.
 *
 * EL CASO REAL: tocaba squash y la cancha estaba ocupada. Antes las salidas
 * eran no entrenar —y que el día contara como falla— o registrar una sesión
 * libre a mano, que deja sin rutina que seguir. Con esto el bloque cambia de
 * disciplina y, si se cambia a pesas, el servidor materializa la sesión de
 * gimnasio completa: split, ejercicios y pesos, igual que cualquier otra.
 *
 * Es una excepción de HOY, no un cambio de plan: mañana la semana vuelve a ser
 * la que se armó. El plan se cambia en Ajustes.
 */
export function CambiarBloque({
  fecha,
  actual,
  onCambiado,
}: {
  /** ISO `YYYY-MM-DD` del día del bloque. */
  fecha: string;
  actual: Discipline;
  onCambiado: () => void | Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState<Discipline | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opciones = DISCIPLINAS.filter((disciplina) => disciplina.valor !== actual);

  async function cambiar(discipline: Discipline) {
    if (guardando) return;
    setError(null);
    setGuardando(discipline);
    try {
      await postCambiarBloque(fecha, discipline);
      setAbierto(false);
      await onCambiado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar tu bloque");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <>
      <Pressable onPress={() => setAbierto(true)} hitSlop={8} style={styles.enlace}>
        <RefreshCw size={14} color={colors.champan} strokeWidth={2} />
        <Text style={styles.enlaceTexto}>No pude ir · cambiar por otra cosa</Text>
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={styles.hoja} onPress={() => {}}>
            <Text style={styles.titulo}>¿Por qué lo cambias?</Text>
            <Text style={styles.nota}>
              Solo cambia hoy. Mañana tu semana sigue como la armaste. Si eliges pesas, te armo la
              sesión completa con tus pesos.
            </Text>

            <View style={styles.lista}>
              {opciones.map((opcion) => {
                const Icono = iconoDe(opcion.valor);
                return (
                  <Pressable
                    key={opcion.valor}
                    onPress={() => cambiar(opcion.valor)}
                    disabled={guardando !== null}
                    style={styles.opcion}
                  >
                    <Icono size={18} color={colors.marfil} strokeWidth={2} />
                    <Text style={styles.opcionTexto}>{opcion.nombre}</Text>
                    {guardando === opcion.valor && (
                      <ActivityIndicator size="small" color={colors.champan} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    enlace: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
    },
    enlaceTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.champan },
    fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
    hoja: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    titulo: { fontFamily: fonts.sansMedium, ...typeScale.subheading, color: colors.marfil },
    nota: { fontFamily: fonts.sans, ...typeScale.label, color: colors.pergaminoSoft },
    lista: { gap: spacing.sm, marginTop: spacing.sm },
    opcion: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    opcionTexto: { flex: 1, fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    error: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.error },
  });
