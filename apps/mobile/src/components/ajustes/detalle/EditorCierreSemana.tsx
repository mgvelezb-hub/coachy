import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import { ApiError, patchCheckinSchedule, type MeResponse } from "@/lib/api";
import { DIAS, programarRecordatorio } from "@/lib/recordatorio";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * "Cuándo cierras tu semana" — el editor completo, en su propia hoja.
 *
 * Vivía adentro de la sección "Tu check-in" con sus trece chips a la vista;
 * la sección ahora lo resume en un renglón ("Domingo · 9:00") y el zoom-in
 * abre esta hoja. La lógica es la misma que tenía en `[seccion].tsx`: se
 * guarda en el servidor y el recordatorio local se reprograma con lo elegido.
 */
export function EditorCierreSemana({ me }: { me: MeResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Cierre de semana: el día y la hora que la persona elige, y el
  // recordatorio local que se programa con ellos.
  const [diaCierre, setDiaCierre] = useState<number | null>(null);
  const [horaCierre, setHoraCierre] = useState<number | null>(null);
  const [cierreMsg, setCierreMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setDiaCierre(me.profile.checkinWeekday);
    setHoraCierre(me.profile.checkinHour);
  }, [me]);

  async function guardarCierre(weekday: number | null, hour: number | null) {
    setDiaCierre(weekday);
    setHoraCierre(hour);
    setCierreMsg(null);
    try {
      await patchCheckinSchedule(weekday, hour);
      const programado = await programarRecordatorio(weekday, hour);
      setCierreMsg(
        weekday === null || hour === null
          ? "Sin recordatorio: nadie te va a avisar."
          : programado
            ? `Listo: te aviso los ${DIAS[weekday]} a las ${hour}:00.`
            : "Guardado, pero falta permiso de notificaciones para avisarte.",
      );
    } catch (error) {
      setCierreMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu día de cierre");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>Cuándo cierras tu semana</SectionLabel>
        <InfoTip titulo="Cuándo cierras tu semana">
          <TextoInfo>
            El día que elijas es el que la app espera tu check-in, y a esa hora te manda un
            recordatorio que abre el formulario. El aviso lo programa tu teléfono: funciona
            sin señal y sin servidor.
          </TextoInfo>
        </InfoTip>
      </View>

      <Text style={styles.cierreLabel}>Día</Text>
      <View style={styles.cierreRow}>
        {DIAS.map((dia, indice) => (
          <Pressable
            key={dia}
            onPress={() => guardarCierre(indice, horaCierre ?? 9)}
            style={[styles.cierreChip, diaCierre === indice && styles.cierreChipOn]}
          >
            <Text
              style={[styles.cierreChipText, diaCierre === indice && styles.cierreChipTextOn]}
            >
              {dia.slice(0, 3)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.cierreLabel}>Hora</Text>
      <View style={styles.cierreRow}>
        {[7, 9, 12, 18, 20, 21].map((hora) => (
          <Pressable
            key={hora}
            onPress={() => guardarCierre(diaCierre ?? 0, hora)}
            style={[styles.cierreChip, horaCierre === hora && styles.cierreChipOn]}
          >
            <Text
              style={[styles.cierreChipText, horaCierre === hora && styles.cierreChipTextOn]}
            >
              {hora}:00
            </Text>
          </Pressable>
        ))}
      </View>

      {cierreMsg && <Text style={styles.msg}>{cierreMsg}</Text>}

      {(diaCierre !== null || horaCierre !== null) && (
        <Pressable
          onPress={() => guardarCierre(null, null)}
          hitSlop={8}
          style={{ marginTop: spacing.lg }}
        >
          <Text style={styles.quitar}>Quitar recordatorio</Text>
        </Pressable>
      )}
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    cierreLabel: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1,
      color: colors.paloRosa,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    cierreRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    cierreChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
    },
    cierreChipOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    cierreChipText: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    cierreChipTextOn: { color: colors.pergamino },
    msg: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.champan,
      marginTop: spacing.md,
    },
    quitar: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
  });
