import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getSessionDetail,
  type SerieComparada,
  type SessionDetail,
} from "@/lib/api";
import { fonts, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * Una sesión entrenada, serie por serie: lo que pedía el plan al lado de lo
 * que salió.
 *
 * El historial contestaba "5 series · 4,200 kg" y ahí se acababa. Después de
 * entrenar la pregunta es otra —cuál serie se quedó corta y en qué
 * ejercicio— y esa se contesta con los dos números juntos, no con el total.
 *
 * Hoja aparte y no un desplegable dentro del historial: nada se abre hacia
 * abajo, cada zoom abre pantalla nueva.
 */
export default function DetalleDeSesionScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [detalle, setDetalle] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDetalle(await getSessionDetail(workoutId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo abrir esa sesión");
    }
  }, [workoutId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        {!detalle && !error && <LoadingState label="Cargando tu sesión..." />}
        {!detalle && error && <ErrorState message={error} onRetry={() => void cargar()} />}

        {detalle && (
          <>
            <Text style={styles.title}>{detalle.muscleGroup}</Text>
            <Text style={styles.fecha}>
              {detalle.date}
              {detalle.estimatedMin ? ` · plan de ≈ ${detalle.estimatedMin} min` : ""}
            </Text>

            {detalle.ejercicios.map((ejercicio) => (
              <Card key={ejercicio.name}>
                <View style={styles.cabecera}>
                  <SectionLabel>{ejercicio.name}</SectionLabel>
                  <InfoTip titulo="Plan y real">
                    <TextoInfo>
                      A la izquierda lo que pedía el plan, a la derecha lo que hiciste. Quedarse
                      corto no es un error: la semana siguiente el plan arranca en tu número, no en
                      el que no alcanzaste.
                    </TextoInfo>
                  </InfoTip>
                </View>

                <View style={styles.lista}>
                  {ejercicio.series.map((serie) => (
                    <FilaDeSerie key={`${serie.exerciseName}-${serie.setIndex}`} serie={serie} />
                  ))}
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "Serie 2 · plan 12 × 40 kg · real 10 × 40 kg", en una línea. */
function FilaDeSerie({ serie }: { serie: SerieComparada }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const corta = !serie.warmup && serie.reps < serie.targetReps;
  const etiqueta = [
    `Serie ${serie.setIndex + 1}`,
    serie.side === "IZQ" ? "izq" : serie.side === "DER" ? "der" : null,
    serie.warmup ? "calentamiento" : null,
    serie.intensity === "fallo" ? "al fallo" : serie.intensity === "dropset" ? "dropset" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={styles.filaPlan}>
        plan {serie.targetReps} × {serie.targetWeightKg === null ? "—" : `${serie.targetWeightKg} kg`}
      </Text>
      <Text style={[styles.filaReal, corta && styles.filaCorta]}>
        real {serie.reps} × {serie.weightKg === null ? "—" : `${serie.weightKg} kg`}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.huge },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    title: { fontFamily: fonts.display, ...typeScale.heading, color: colors.marfil },
    fecha: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
    cabecera: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    lista: { marginTop: spacing.md, gap: spacing.xs },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    filaEtiqueta: { flex: 1, fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.marfil },
    filaPlan: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
    filaReal: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.champan },
    filaCorta: { color: withAlpha(colors.error, 0.95) },
  });
