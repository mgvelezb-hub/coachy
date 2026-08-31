import { Clock } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Explicacion, TextoExplicativo } from "@/components/Explicacion";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getHorariosComida,
  putHorariosComida,
  type TiempoDeComida,
} from "@/lib/api";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * "A qué hora comes" — mover los tiempos de comida del menú.
 *
 * EL PROBLEMA: el motor reparte los macros por tiempo de comida y le pone a
 * cada uno una hora sugerida, sacada de una jornada estándar. Quien entra a
 * trabajar a las 6, come a las 4 o entrena de noche veía horas que no iba a
 * cumplir — y un horario que no se cumple no es un plan: es un recordatorio a
 * deshoras que además hace ver el menú como ajeno.
 *
 * LOS CANDADOS los pone el servidor (`lib/coachy/horarios.ts`), no esta
 * pantalla: el orden de los tiempos, los 90 minutos mínimos entre uno y otro
 * y la ventana del día son reglas de cómo se digiere y se reparte la comida,
 * no de cómo se pinta un formulario. Aquí solo se enseña el motivo cuando el
 * servidor dice que no, con sus palabras.
 *
 * Se ajusta en pasos de 15 minutos con dos botones en vez de un teclado: es
 * un ajuste de minutos, y escribir "14:00" a mano en un teléfono es más
 * trabajo y más formas de equivocarse.
 */
export function SeccionHorariosComida() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tiempos, setTiempos] = useState<TiempoDeComida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    getHorariosComida()
      .then((respuesta) => {
        if (vivo) setTiempos(respuesta.tiempos);
      })
      .catch(() => {
        // Sin menú publicado todavía no hay horarios que mover: la tarjeta lo
        // dice abajo en vez de pintar un error.
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const mover = useCallback(
    async (slot: string, minutos: number) => {
      if (guardando) return;
      const actual = tiempos.find((tiempo) => tiempo.slot === slot);
      if (!actual) return;

      const nueva = sumaMinutos(actual.hora, minutos);
      if (nueva === null) return;

      // Optimista: la hora se mueve en pantalla y si el servidor la rechaza
      // se restaura con lo que él diga. Esperar medio segundo por cada toque
      // de ±15 minutos haría el ajuste insoportable.
      const previos = tiempos;
      setTiempos((lista) =>
        lista.map((tiempo) => (tiempo.slot === slot ? { ...tiempo, hora: nueva, propia: true } : tiempo)),
      );
      setError(null);
      setGuardando(true);
      try {
        const respuesta = await putHorariosComida({ [slot]: nueva });
        setTiempos(respuesta.tiempos);
        setAvisos(respuesta.avisos ?? []);
      } catch (e) {
        setTiempos(previos);
        setError(e instanceof ApiError ? e.message : "No se pudo mover esa hora");
      } finally {
        setGuardando(false);
      }
    },
    [guardando, tiempos],
  );

  const restaurar = useCallback(
    async (slot: string) => {
      if (guardando) return;
      setError(null);
      setGuardando(true);
      try {
        const respuesta = await putHorariosComida({ [slot]: null });
        setTiempos(respuesta.tiempos);
        setAvisos(respuesta.avisos ?? []);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo restaurar esa hora");
      } finally {
        setGuardando(false);
      }
    },
    [guardando],
  );

  return (
    <Card>
      <SectionLabel>A qué hora comes</SectionLabel>
      <Explicacion>
        <TextoExplicativo>
          Las horas que trae tu menú son una sugerencia armada sobre un día estándar. Si entras a
          trabajar temprano, comes tarde o entrenas de noche, muévelas: el recordatorio de cada
          comida sigue la hora que dejes aquí.
        </TextoExplicativo>
        <TextoExplicativo>
          Hay tres cosas que no te va a dejar hacer, y no es capricho: cambiar el orden de tus
          comidas, dejarlas a menos de hora y media una de otra —tan pegadas se vuelven una sola
          del doble de volumen— o programarlas de madrugada.
        </TextoExplicativo>
      </Explicacion>

      {cargando ? (
        <ActivityIndicator size="small" color={colors.champan} style={{ marginTop: spacing.md }} />
      ) : tiempos.length === 0 ? (
        <Text style={styles.vacio}>
          Cuando tengas tu menú publicado vas a poder mover sus horarios desde aquí.
        </Text>
      ) : (
        <View style={styles.lista}>
          {tiempos.map((tiempo) => (
            <View key={tiempo.slot} style={styles.fila}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{tiempo.label}</Text>
                {tiempo.propia && (
                  <Pressable onPress={() => restaurar(tiempo.slot)} disabled={guardando}>
                    <Text style={styles.restaurar}>Volver a la hora sugerida</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={() => mover(tiempo.slot, -15)}
                disabled={guardando}
                style={styles.paso}
              >
                <Text style={styles.pasoTexto}>−15</Text>
              </Pressable>

              <View style={styles.hora}>
                <Clock size={14} color={colors.champan} strokeWidth={2} />
                <Text style={styles.horaTexto}>{tiempo.hora}</Text>
              </View>

              <Pressable
                onPress={() => mover(tiempo.slot, 15)}
                disabled={guardando}
                style={styles.paso}
              >
                <Text style={styles.pasoTexto}>+15</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {avisos.map((aviso) => (
        <Text key={aviso} style={styles.aviso}>
          {aviso}
        </Text>
      ))}
    </Card>
  );
}

/** `"14:00"` más/menos minutos, sin salirse del día. `null` si no es una hora. */
function sumaMinutos(hora: string, minutos: number): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!match) return null;

  const total = Number(match[1]) * 60 + Number(match[2]) + minutos;
  if (total < 0 || total > 23 * 60 + 59) return null;

  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    lista: { gap: spacing.sm, marginTop: spacing.md },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    nombre: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    restaurar: { fontFamily: fonts.sans, ...typeScale.label, color: colors.champan, marginTop: 2 },
    paso: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
    },
    pasoTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    hora: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 68, justifyContent: "center" },
    horaTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    vacio: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.pergaminoSoft, marginTop: spacing.md },
    error: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.error, marginTop: spacing.sm },
    aviso: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosa, marginTop: spacing.sm },
  });
