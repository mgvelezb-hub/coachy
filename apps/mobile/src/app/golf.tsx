import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  GOLF_PRACTICE_KINDS,
  getGolf,
  postGolfPractica,
  postGolfRonda,
  type GolfAgregados,
  type GolfPracticeKind,
} from "@/lib/api-golf";
import { ApiError } from "@/lib/api";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { NumberStepper } from "@/components/NumberStepper";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * Registrar golf: rondas y práctica, a nivel competencia.
 *
 * Dos registros distintos a propósito, no un solo formulario con todo
 * opcional: una RONDA es lo que pasó en la cancha (score, GIR, putts,
 * castigos — de ahí sale dónde se fuga el score, ver `lib/golf.ts` en el
 * servidor). Una PRÁCTICA es tiempo fuera de la cancha, con su TIPO
 * (range/juego corto/putting) porque el balance entre esos tres es la
 * mitad del entregable: el juego corto y el putting concentran ~60% de los
 * golpes de una ronda amateur y suelen recibir una fracción de las horas de
 * práctica frente al range.
 */

const KIND_LABELS: Record<GolfPracticeKind, string> = {
  RANGE: "Range",
  JUEGO_CORTO: "Juego corto",
  PUTTING: "Putting",
};

const HOLES_OPTIONS = [9, 18] as const;

/** yyyy-MM-dd de hoy (+offset días), en hora local del teléfono. */
function todayISO(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "hoy" / "ayer" / "martes" — etiqueta corta para los últimos 7 días. */
function dayLabel(offsetDays: number): string {
  if (offsetDays === 0) return "Hoy";
  if (offsetDays === -1) return "Ayer";
  const date = new Date(`${todayISO(offsetDays)}T12:00:00.000Z`);
  const label = WEEKDAYS[date.getUTCDay()] ?? "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function textoTendencia(tendencia: GolfAgregados["tendencia"]): string {
  if (tendencia === "MEJORANDO") return "Mejorando";
  if (tendencia === "EMPEORANDO") return "Empeorando";
  if (tendencia === "ESTABLE") return "Estable";
  return "—";
}

export default function GolfScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [agregados, setAgregados] = useState<GolfAgregados | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [modo, setModo] = useState<"RONDA" | "PRACTICA">("RONDA");

  // --- Ronda ---------------------------------------------------------------
  const [holes, setHoles] = useState<(typeof HOLES_OPTIONS)[number]>(18);
  const [score, setScore] = useState(90);
  const [par, setPar] = useState<number | null>(72);
  const [putts, setPutts] = useState<number | null>(32);
  const [fairwaysHit, setFairwaysHit] = useState<number | null>(7);
  const [fairwaysTotal, setFairwaysTotal] = useState<number | null>(14);
  const [girHit, setGirHit] = useState<number | null>(9);
  const [penalties, setPenalties] = useState<number | null>(2);
  const [course, setCourse] = useState("");
  const [dayOffsetRonda, setDayOffsetRonda] = useState(0);

  // --- Práctica --------------------------------------------------------------
  const [kind, setKind] = useState<GolfPracticeKind>("RANGE");
  const [minutes, setMinutes] = useState(30);
  const [balls, setBalls] = useState<number | null>(50);
  const [dayOffsetPractica, setDayOffsetPractica] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getGolf();
      setAgregados(data.agregados);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "No se pudo cargar tu historial de golf");
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

  async function guardarRonda() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await postGolfRonda({
        date: todayISO(dayOffsetRonda),
        holes,
        score,
        par,
        putts,
        fairwaysHit,
        fairwaysTotal,
        girHit,
        penalties,
        course: course.trim() ? course.trim() : null,
      });
      setCourse("");
      await load();
      router.back();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "No se pudo guardar tu ronda");
    } finally {
      setSaving(false);
    }
  }

  async function guardarPractica() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await postGolfPractica({
        date: todayISO(dayOffsetPractica),
        kind,
        minutes,
        balls,
      });
      await load();
      router.back();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "No se pudo guardar tu práctica");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
            <Text style={styles.backText}>Atrás</Text>
          </Pressable>
          <Text style={styles.title}>Golf</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
          }
        >
          {loadError ? (
            <ErrorState message={loadError} onRetry={load} />
          ) : agregados === null ? (
            <LoadingState label="Cargando tu historial..." />
          ) : (
            <AgregadosCard agregados={agregados} colors={colors} styles={styles} />
          )}

          <View style={styles.tabs}>
            <Pressable
              onPress={() => setModo("RONDA")}
              style={[styles.tab, modo === "RONDA" && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, modo === "RONDA" && styles.tabLabelActive]}>Ronda</Text>
            </Pressable>
            <Pressable
              onPress={() => setModo("PRACTICA")}
              style={[styles.tab, modo === "PRACTICA" && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, modo === "PRACTICA" && styles.tabLabelActive]}>Práctica</Text>
            </Pressable>
          </View>

          {modo === "RONDA" ? (
            <>
              <View style={styles.block}>
                <SectionLabel>Hoyos</SectionLabel>
                <View style={styles.quickRow}>
                  {HOLES_OPTIONS.map((opcion) => (
                    <Pressable
                      key={opcion}
                      onPress={() => setHoles(opcion)}
                      style={[styles.quick, holes === opcion && styles.quickSelected]}
                    >
                      <Text style={[styles.quickLabel, holes === opcion && styles.quickLabelSelected]}>
                        {opcion} hoyos
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <NumberStepper
                  label="Score"
                  value={score}
                  onChange={(v) => setScore(Math.min(180, Math.max(18, v)))}
                  step={1}
                  min={18}
                />
              </View>

              <View style={styles.block}>
                <SectionLabel>Qué día</SectionLabel>
                <View style={styles.quickRow}>
                  {[0, -1, -2, -3, -4, -5, -6].map((offset) => (
                    <Pressable
                      key={offset}
                      onPress={() => setDayOffsetRonda(offset)}
                      style={[styles.quick, dayOffsetRonda === offset && styles.quickSelected]}
                    >
                      <Text
                        style={[styles.quickLabel, dayOffsetRonda === offset && styles.quickLabelSelected]}
                      >
                        {dayLabel(offset)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <SectionLabel>Detalle (opcional)</SectionLabel>
                <OptionalStepper label="Par del campo" value={par} onChange={setPar} step={1} min={27} max={90} default={72} />
                <OptionalStepper label="Putts" value={putts} onChange={setPutts} step={1} min={0} max={99} default={32} />
                <View style={styles.fairwaysRow}>
                  <View style={styles.fairwaysHalf}>
                    <OptionalStepper
                      label="Fairways embocados"
                      value={fairwaysHit}
                      onChange={setFairwaysHit}
                      step={1}
                      min={0}
                      max={18}
                      default={7}
                    />
                  </View>
                  <View style={styles.fairwaysHalf}>
                    <OptionalStepper
                      label="Fairways con oportunidad"
                      value={fairwaysTotal}
                      onChange={setFairwaysTotal}
                      step={1}
                      min={0}
                      max={18}
                      default={14}
                    />
                  </View>
                </View>
                <OptionalStepper
                  label="GIR (greens en regulación)"
                  value={girHit}
                  onChange={setGirHit}
                  step={1}
                  min={0}
                  max={holes}
                  default={Math.round(holes / 2)}
                />
                <OptionalStepper
                  label="Castigos"
                  value={penalties}
                  onChange={setPenalties}
                  step={1}
                  min={0}
                  max={30}
                  default={1}
                />
              </View>

              <View style={styles.block}>
                <SectionLabel>Campo (opcional)</SectionLabel>
                <TextInput
                  value={course}
                  onChangeText={setCourse}
                  placeholder="Dónde jugaste"
                  placeholderTextColor={withAlpha(colors.paloRosa, 0.6)}
                  style={styles.input}
                  maxLength={200}
                />
              </View>

              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

              <PrimaryButton label="Guardar ronda" onPress={guardarRonda} loading={saving} />
            </>
          ) : (
            <>
              <View style={styles.block}>
                <SectionLabel>Tipo de práctica</SectionLabel>
                <View style={styles.quickRow}>
                  {GOLF_PRACTICE_KINDS.map((opcion) => (
                    <Pressable
                      key={opcion}
                      onPress={() => setKind(opcion)}
                      style={[styles.quick, kind === opcion && styles.quickSelected]}
                    >
                      <Text style={[styles.quickLabel, kind === opcion && styles.quickLabelSelected]}>
                        {KIND_LABELS[opcion]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <NumberStepper
                  label="Minutos"
                  value={minutes}
                  onChange={(v) => setMinutes(Math.min(300, Math.max(5, v)))}
                  step={5}
                  min={5}
                  suffix=" min"
                />
              </View>

              <View style={styles.block}>
                <SectionLabel>Qué día</SectionLabel>
                <View style={styles.quickRow}>
                  {[0, -1, -2, -3, -4, -5, -6].map((offset) => (
                    <Pressable
                      key={offset}
                      onPress={() => setDayOffsetPractica(offset)}
                      style={[styles.quick, dayOffsetPractica === offset && styles.quickSelected]}
                    >
                      <Text
                        style={[
                          styles.quickLabel,
                          dayOffsetPractica === offset && styles.quickLabelSelected,
                        ]}
                      >
                        {dayLabel(offset)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <SectionLabel>Detalle (opcional)</SectionLabel>
                <OptionalStepper label="Bolas pegadas" value={balls} onChange={setBalls} step={10} min={0} max={2000} default={50} />
              </View>

              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

              <PrimaryButton label="Guardar práctica" onPress={guardarPractica} loading={saving} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Tarjeta compacta de agregados: score prom., GIR%, putts, tendencia. */
function AgregadosCard({
  agregados,
  colors,
  styles,
}: {
  agregados: GolfAgregados;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (agregados.rondas === 0) {
    return (
      <EmptyState message="Registra tu primera ronda y aquí vas a ver de dónde se fuga tu score." />
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SectionLabel color={colors.pergaminoSoft}>Tus números</SectionLabel>
        <InfoTip titulo="¿Qué es GIR?">
          <TextoInfo>
            GIR (greens en regulación) es llegar al green en par-2 golpes o menos. De todo lo que se
            mide en una ronda, es lo que mejor predice el score promedio: dice si el juego largo
            sostuvo la ronda.
          </TextoInfo>
          <TextoInfo>
            Los putts cuentan la otra mitad: se puede llegar bien al green y aun así regalar la ronda
            ahí.
          </TextoInfo>
        </InfoTip>
      </View>
      <View style={styles.statsRow}>
        <Stat
          label="Score (últ. 5)"
          value={agregados.scoreVsPar.ultimas5 === null ? "—" : `${agregados.scoreVsPar.ultimas5 > 0 ? "+" : ""}${agregados.scoreVsPar.ultimas5}`}
          styles={styles}
        />
        <Stat label="GIR" value={agregados.girPct === null ? "—" : `${agregados.girPct}%`} styles={styles} />
        <Stat
          label="Putts"
          value={agregados.puttsPromedio === null ? "—" : `${agregados.puttsPromedio}`}
          styles={styles}
        />
        <Stat label="Tendencia" value={textoTendencia(agregados.tendencia)} styles={styles} />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Un `NumberStepper` con un estado "sin dato" — toca "+ agregar" para
 * empezar a capturarlo, y "quitar" para volver a `null`. Existe porque los
 * campos de detalle de la ronda (par, putts, fairways, GIR, castigos) son
 * opcionales de verdad: la persona que solo apunta el score no debería tener
 * que inventar un putt count.
 */
function OptionalStepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  default: valorDefault,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min: number;
  max: number;
  default: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (value === null) {
    return (
      <Pressable onPress={() => onChange(valorDefault)} style={styles.addDetalle} hitSlop={8}>
        <Text style={styles.addDetalleLabel}>+ {label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.optionalRow}>
      <NumberStepper
        label={label}
        value={value}
        onChange={(v) => onChange(Math.min(max, Math.max(min, v)))}
        step={step}
        min={min}
      />
      <Pressable onPress={() => onChange(null)} hitSlop={8} style={styles.quitar}>
        <Text style={styles.quitarLabel}>Quitar</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    back: { flexDirection: "row", alignItems: "center", gap: 2 },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    title: {
      fontFamily: fonts.sansBold,
      ...typeScale.title,
      color: colors.marfil,
      marginLeft: spacing.sm,
    },
    content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl },
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    stat: { flexGrow: 1, minWidth: 70, alignItems: "center", gap: 2 },
    statValue: { fontFamily: fonts.display, ...typeScale.heading, color: colors.marfil },
    statLabel: {
      fontFamily: fonts.sansMedium,
      ...typeScale.label,
      color: colors.paloRosa,
      textAlign: "center",
    },
    tabs: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: colors.cardBg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 4,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    tabActive: { backgroundColor: colors.guinda },
    tabLabel: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.paloRosa },
    tabLabelActive: { color: colors.pergamino },
    block: { gap: spacing.md },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    quick: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
    },
    quickSelected: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    quickLabel: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    quickLabelSelected: { color: colors.pergamino },
    fairwaysRow: { flexDirection: "row", gap: spacing.md },
    fairwaysHalf: { flex: 1 },
    addDetalle: {
      alignSelf: "flex-start",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    addDetalleLabel: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    optionalRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    quitar: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
    quitarLabel: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosaLight },
    input: {
      minHeight: 48,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      paddingHorizontal: spacing.lg,
      fontFamily: fonts.sans,
      ...typeScale.body,
      color: colors.marfil,
    },
    error: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.error },
  });
