import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ChartBoundary } from "@/components/ChartBoundary";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { LineChart } from "@/components/LineChart";
import { ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import { ApiError, getExerciseProgress, type ExerciseProgress } from "@/lib/api";
import { fonts, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La tendencia de un ejercicio: peso tope y volumen, semana a semana.
 *
 * Por SEMANA y no por sesión: la pregunta es si se está subiendo, y un día
 * malo no contesta eso — el ruido de una sesión ahoga la señal del mes.
 */
export default function ProgresoDeEjercicioScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [progreso, setProgreso] = useState<ExerciseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setProgreso(await getExerciseProgress(exerciseId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu progreso");
    }
  }, [exerciseId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Las últimas doce semanas: más atrás la línea deja de leerse y la pregunta
  // ("¿estoy subiendo?") ya está contestada.
  const semanas = (progreso?.semanas ?? []).slice(-12);
  const peso = semanas.map((semana) => ({ date: semana.weekStart, value: semana.topWeightKg }));
  const volumen = semanas.map((semana) => ({ date: semana.weekStart, value: semana.volumeKg }));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        {!progreso && !error && <LoadingState label="Cargando tu progreso..." />}
        {!progreso && error && <ErrorState message={error} onRetry={() => void cargar()} />}

        {progreso && (
          <>
            <Text style={styles.title}>{progreso.name}</Text>
            {progreso.record && (
              <Text style={styles.record}>
                Tu récord: {progreso.record.weightKg} kg × {progreso.record.reps} ·{" "}
                {progreso.record.date}
              </Text>
            )}

            <Card>
              <View style={styles.cabecera}>
                <SectionLabel>Peso tope por semana</SectionLabel>
                <InfoTip titulo="Qué mide">
                  <TextoInfo>
                    El kilo más alto que levantaste esa semana en este ejercicio. Es la mitad de la
                    progresión: la otra es hacer más repeticiones con el mismo peso.
                  </TextoInfo>
                </InfoTip>
              </View>
              <View style={styles.grafica}>
                <ChartBoundary>
                  <LineChart
                    points={peso}
                    color={colors.champan}
                    format={(valor) => `${valor} kg`}
                  />
                </ChartBoundary>
              </View>
            </Card>

            <Card>
              <View style={styles.cabecera}>
                <SectionLabel>Volumen por semana</SectionLabel>
                <InfoTip titulo="Qué mide">
                  <TextoInfo>
                    Peso por repeticiones, sumado. Sube si levantas más pesado o si haces más
                    series: es cuánto trabajo total le metiste al músculo esa semana.
                  </TextoInfo>
                </InfoTip>
              </View>
              <View style={styles.grafica}>
                <ChartBoundary>
                  <LineChart
                    points={volumen}
                    color={colors.paloRosa}
                    format={(valor) => `${Math.round(valor).toLocaleString("es-MX")} kg`}
                  />
                </ChartBoundary>
              </View>
            </Card>

            <Card>
              <SectionLabel>Semana a semana</SectionLabel>
              <View style={styles.lista}>
                {[...semanas].reverse().map((semana) => (
                  <View key={semana.weekStart} style={styles.fila}>
                    <Text style={styles.filaEtiqueta}>{semana.weekStart}</Text>
                    <Text style={styles.filaValor}>
                      {semana.topWeightKg} kg · {semana.volumeKg.toLocaleString("es-MX")} kg ·{" "}
                      {semana.sets} series
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
    record: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.champan },
    cabecera: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    grafica: { marginTop: spacing.md },
    lista: { marginTop: spacing.md, gap: spacing.xs },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    filaEtiqueta: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.marfil },
    filaValor: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.champan },
  });
