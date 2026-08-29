import { useRouter } from "expo-router";
import { ChevronLeft, Flag, TrendingDown } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ChartBoundary } from "@/components/ChartBoundary";
import { LineChart, type Punto } from "@/components/LineChart";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getHistoryMeasurements,
  getMe,
  type CheckInPoint,
  type MeResponse,
} from "@/lib/api";
import { escalonesDe, glidepathDeCintura, textoDeGlidepath } from "@/lib/glidepath";
import {
  fonts,
  radius,
  spacing,
  type as typeScale,
  withAlpha,
  type Palette,
} from "@/lib/theme";

/**
 * El plan completo hasta el objetivo, mes por mes.
 *
 * Qué es y qué no: es una **proyección al ritmo actual**, no una promesa de
 * fecha. Por eso se dibuja entera y se dice de dónde sale cada número — el
 * destino de la razón cintura-estatura, el corte mensual del déficit
 * sostenible— en vez de enseñar una fecha sola, que se leería como un
 * compromiso que nadie puede firmar.
 */

export default function GlidepathScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [points, setPoints] = useState<CheckInPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [perfil, medidas] = await Promise.all([getMe(), getHistoryMeasurements()]);
      setMe(perfil);
      setPoints(medidas.points);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu plan");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!points && !error) return <LoadingState label="Armando tu plan..." />;
  if (!points && error) return <ErrorState message={error} onRetry={load} />;

  const plan = glidepathDeCintura(points ?? [], me?.profile?.heightCm ?? null);
  const escalones = plan ? escalonesDe(plan, new Date()) : [];

  // La línea junta lo vivido con lo proyectado: primero tus mediciones, luego
  // los escalones. Se ven en el mismo trazo porque son la misma cintura.
  const serie: Punto[] = [
    ...[...(points ?? [])]
      .filter((punto) => punto.waistCm !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((punto) => ({ date: punto.date, value: punto.waistCm })),
    ...escalones.map((escalon) => ({ date: escalon.etiqueta, value: escalon.cintura })),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Tu plan al objetivo</Text>

        {!plan ? (
          <Card>
            <EmptyState message="Con tu primera cintura registrada y tu estatura en el perfil, aquí aparece el plan completo." />
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.destinoRow}>
                <View style={styles.destinoIcon}>
                  <Flag size={22} color={colors.champan} strokeWidth={2} />
                </View>
                <View style={styles.destinoTexto}>
                  <Text style={styles.destinoValor}>
                    {plan.destino} <Text style={styles.destinoUnidad}>cm</Text>
                  </Text>
                  <Text style={styles.destinoNota}>
                    Tu destino: la mitad de tu estatura. Es el corte que se usa para riesgo
                    cardiometabólico y sirve para cualquier complexión, porque se mide contra tu
                    propia altura y no contra una tabla.
                  </Text>
                </View>
              </View>

              <View style={styles.resumenRow}>
                <Dato label="Hoy" valor={`${plan.actual} cm`} />
                <Dato label="Este mes" valor={`${plan.meta} cm`} />
                <Dato
                  label="Faltan"
                  valor={plan.enDestino ? "—" : `${plan.mesesRestantes} meses`}
                />
              </View>

              <Text style={styles.glidepathTexto}>{textoDeGlidepath(plan)}</Text>
            </Card>

            <Card>
              <SectionLabel>De dónde vienes y hacia dónde vas</SectionLabel>
              <View style={{ marginTop: spacing.md }}>
                <ChartBoundary label="La proyección no se pudo dibujar.">
                  <LineChart
                    points={serie}
                    color={colors.champan}
                    goal={plan.destino}
                    format={(v) => `${v.toFixed(1)} cm`}
                    height={160}
                  />
                </ChartBoundary>
              </View>
              <Text style={styles.aviso}>
                La parte proyectada es aritmética del ritmo actual, no una promesa de fecha: si un
                mes rinde más, el plan se acorta solo; si rinde menos, no te cobra la deuda.
              </Text>
            </Card>

            <Card>
              <SectionLabel>Mes por mes</SectionLabel>
              <View style={styles.tabla}>
                {escalones.length === 0 ? (
                  <Text style={styles.aviso}>Ya estás en tu destino. De aquí es sostener.</Text>
                ) : (
                  escalones.map((escalon) => (
                    <View key={escalon.mes} style={styles.fila}>
                      <Text style={styles.filaMes}>{escalon.etiqueta}</Text>
                      <View style={styles.filaRiel}>
                        <View
                          style={[
                            styles.filaBarra,
                            {
                              width: `${Math.round(
                                ((plan.inicio!.valor - escalon.cintura) /
                                  Math.max(0.1, plan.inicio!.valor - plan.destino)) * 100,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.filaValor}>{escalon.cintura} cm</Text>
                    </View>
                  ))
                )}
              </View>
            </Card>

            <Card>
              <SectionLabel>Cómo se recalcula</SectionLabel>
              <Text style={styles.aviso}>
                Cada mes, cuando subes medidas y fotos, el escalón siguiente se calcula desde donde
                estás —no desde donde debías estar—. Y la comparación contra tus fotos de referencia
                dice qué zona lleva la prioridad, que es lo que ajusta tu rutina. Esto es una
                sugerencia de ritmo, no una indicación médica.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.dato}>
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={styles.datoLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.obsidiana },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.sm,
    alignSelf: "flex-start",
  },
  backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
  title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
  destinoRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  destinoIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.champan, 0.18),
  },
  destinoTexto: { flex: 1, gap: spacing.xs },
  destinoValor: { fontFamily: fonts.sansBold, ...typeScale.display, color: colors.marfil },
  destinoUnidad: { fontFamily: fonts.sansMedium, ...typeScale.subheading, color: colors.paloRosa },
  destinoNota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
  resumenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  dato: { flex: 1, gap: 2 },
  datoValor: { fontFamily: fonts.sansBold, ...typeScale.heading, color: colors.marfil },
  datoLabel: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.paloRosa },
  glidepathTexto: {
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.champan,
    marginTop: spacing.lg,
  },
  aviso: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.md,
  },
  tabla: { marginTop: spacing.md, gap: spacing.sm },
  fila: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  filaMes: {
    width: 108,
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  filaRiel: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cardBorder,
  },
  filaBarra: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: withAlpha(colors.champan, 0.6),
  },
  filaValor: {
    width: 62,
    textAlign: "right",
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
});
