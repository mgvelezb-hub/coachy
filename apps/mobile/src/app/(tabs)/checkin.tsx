import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { PercentStepper } from "@/components/PercentStepper";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { Slider15 } from "@/components/Slider15";
import { Stepper } from "@/components/Stepper";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getMe,
  postCheckin,
  SYMPTOMS,
  SYMPTOM_LABELS,
  type Symptom,
} from "@/lib/api";
import { fonts, spacing, type Palette, type as typeScale } from "@/lib/theme";

/** yyyy-MM-dd de hoy, en hora local (no UTC: evita cruzar de día cerca de medianoche). */
function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "12,5" o "12.5" → 12.5. Vacío → null. */
function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

export default function CheckinScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Medidas
  const [waistCm, setWaistCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [legLeftCm, setLegLeftCm] = useState("");
  const [legRightCm, setLegRightCm] = useState("");
  const [armLeftCm, setArmLeftCm] = useState("");
  const [armRightCm, setArmRightCm] = useState("");

  // Sensaciones
  const [inflammation, setInflammation] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [satiety, setSatiety] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [strengthRpe, setStrengthRpe] = useState("");

  // Cumplimiento
  const [dietCompliance, setDietCompliance] = useState(80);
  const [trainingCompliance, setTrainingCompliance] = useState(80);
  const [symptoms, setSymptoms] = useState<Set<Symptom>>(new Set());
  const [comment, setComment] = useState("");
  const [periodStarted, setPeriodStarted] = useState(false);

  // El ciclo no se le pregunta a quien no le aplica. Si el perfil no cargó,
  // se asume que NO aplica: preguntar de más es peor que preguntar de menos.
  const [sex, setSex] = useState<"FEMALE" | "MALE" | "OTHER" | null>(null);
  useEffect(() => {
    let vivo = true;
    getMe()
      .then((me) => {
        if (vivo) setSex(me.profile?.sex ?? null);
      })
      .catch(() => {
        // Sin perfil el formulario sigue siendo usable; solo no muestra ciclo.
      });
    return () => {
      vivo = false;
    };
  }, []);
  const preguntaCiclo = sex === "FEMALE" || sex === "OTHER";

  function toggleSymptom(symptom: Symptom) {
    setSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(symptom)) next.delete(symptom);
      else next.add(symptom);
      return next;
    });
  }

  async function handleSubmit() {
    setGeneralError(null);
    setFieldErrors({});

    if (!waistCm.trim()) {
      setFieldErrors({ waistCm: "La cintura es obligatoria" });
      return;
    }
    if (inflammation === null || energy === null || hunger === null || satiety === null || sleep === null) {
      setGeneralError("Completa las 5 escalas de sensaciones antes de enviar");
      return;
    }

    setSubmitting(true);
    try {
      await postCheckin({
        date: todayISO(),
        waistCm: parseDecimal(waistCm) ?? 0,
        weightKg: parseDecimal(weightKg),
        legLeftCm: parseDecimal(legLeftCm),
        legRightCm: parseDecimal(legRightCm),
        armLeftCm: parseDecimal(armLeftCm),
        armRightCm: parseDecimal(armRightCm),
        inflammation,
        energy,
        hunger,
        satiety,
        sleep,
        strengthRpe: strengthRpe.trim() ? Math.round(Number(strengthRpe)) : null,
        dietCompliance,
        trainingCompliance,
        symptoms: [...symptoms],
        comment: comment.trim() || undefined,
        periodStarted,
      });
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.detalles) {
        setFieldErrors(error.detalles);
        setGeneralError("Revisa los campos marcados");
      } else if (error instanceof ApiError && error.status === 403) {
        setGeneralError("Termina tu onboarding antes de enviar un check-in");
      } else {
        setGeneralError(
          error instanceof ApiError ? error.message : "No se pudo enviar. Intenta de nuevo",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={styles.confirmScreen}>
        <Text style={styles.confirmTitle}>Check-in recibido</Text>
        <Text style={styles.confirmMessage}>
          Gracias por tu constancia. Tu coach va a revisar tus números y en un par de días tendrás
          tu siguiente decisión.
        </Text>
        <PrimaryButton label="Volver a Hoy" onPress={() => router.replace("/")} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Check-in semanal</Text>

      <Card>
        <SectionLabel>Medidas</SectionLabel>
        <View style={styles.fieldGroup}>
          <Stepper
            label="Cintura"
            unit="cm"
            required
            value={waistCm}
            onChangeText={setWaistCm}
            error={fieldErrors.waistCm}
          />
          <Stepper
            label="Peso"
            unit="kg"
            value={weightKg}
            onChangeText={setWeightKg}
            error={fieldErrors.weightKg}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Stepper
                label="Pierna izq."
                unit="cm"
                value={legLeftCm}
                onChangeText={setLegLeftCm}
                error={fieldErrors.legLeftCm}
              />
            </View>
            <View style={styles.half}>
              <Stepper
                label="Pierna der."
                unit="cm"
                value={legRightCm}
                onChangeText={setLegRightCm}
                error={fieldErrors.legRightCm}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <Stepper
                label="Brazo izq."
                unit="cm"
                value={armLeftCm}
                onChangeText={setArmLeftCm}
                error={fieldErrors.armLeftCm}
              />
            </View>
            <View style={styles.half}>
              <Stepper
                label="Brazo der."
                unit="cm"
                value={armRightCm}
                onChangeText={setArmRightCm}
                error={fieldErrors.armRightCm}
              />
            </View>
          </View>
        </View>
      </Card>

      <Card>
        <SectionLabel>Sensaciones</SectionLabel>
        <View style={styles.fieldGroup}>
          <ScaleField label="Inflamación" value={inflammation} onChange={setInflammation} error={fieldErrors.inflammation} />
          <ScaleField label="Energía" value={energy} onChange={setEnergy} error={fieldErrors.energy} />
          <ScaleField label="Hambre" value={hunger} onChange={setHunger} error={fieldErrors.hunger} />
          <ScaleField label="Saciedad" value={satiety} onChange={setSatiety} error={fieldErrors.satiety} />
          <ScaleField label="Sueño" value={sleep} onChange={setSleep} error={fieldErrors.sleep} />
          <Stepper
            label="Qué tan pesado se sintió"
            unit="/ 10"
            keyboardType="number-pad"
            value={strengthRpe}
            onChangeText={setStrengthRpe}
            error={fieldErrors.strengthRpe}
          />
          <Text style={styles.rpeHint}>
            Del 1 al 10, qué tan exigente sentiste tu entrenamiento esta semana: 1 es
            &quot;me sobró&quot; y 10 es &quot;no podía con una más&quot;. Si no estás
            seguro, déjalo vacío.
          </Text>
        </View>
      </Card>

      <Card>
        <SectionLabel>Cumplimiento</SectionLabel>
        <View style={styles.fieldGroup}>
          <PercentStepper label="Dieta" value={dietCompliance} onChange={setDietCompliance} />
          <PercentStepper label="Entreno" value={trainingCompliance} onChange={setTrainingCompliance} />
        </View>
      </Card>

      <Card>
        <SectionLabel>Síntomas</SectionLabel>
        <View style={styles.chipsRow}>
          {SYMPTOMS.map((symptom) => (
            <Chip
              key={symptom}
              label={SYMPTOM_LABELS[symptom]}
              selected={symptoms.has(symptom)}
              onPress={() => toggleSymptom(symptom)}
            />
          ))}
        </View>

        <View style={styles.commentField}>
          <Text style={styles.commentLabel}>COMENTARIO</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Cómo te sentiste esta semana..."
            placeholderTextColor={colors.paloRosaLight}
            multiline
            style={styles.commentInput}
          />
          <Text style={styles.commentHint}>
            Las fotos del check-in llegan en una fase posterior: suben directo a Storage.
          </Text>
        </View>

        {preguntaCiclo && (
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>Esta semana empezó mi periodo</Text>
          <Switch
            value={periodStarted}
            onValueChange={setPeriodStarted}
            trackColor={{ true: colors.guinda, false: colors.cardBorder }}
            thumbColor={colors.marfil}
          />
        </View>
        )}
      </Card>

      {generalError && <Text style={styles.generalError}>{generalError}</Text>}

      <PrimaryButton label="Enviar check-in" onPress={handleSubmit} loading={submitting} />
    </ScrollView>
  );
}

function ScaleField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.scaleField}>
      <Text style={styles.scaleLabel}>{label.toUpperCase()}</Text>
      <Slider15 value={value} onChange={onChange} lowLabel="Nada" highLabel="Mucho" />
      {error && <Text style={styles.scaleError}>{error}</Text>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  title: {
    fontFamily: fonts.display,
    ...typeScale.heading,
    color: colors.marfil,
  },
  fieldGroup: {
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  scaleField: {
    gap: spacing.xs,
  },
  scaleLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  scaleError: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.error,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  commentField: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  commentLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  commentInput: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 80,
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
    textAlignVertical: "top",
  },
  commentHint: {
    fontFamily: fonts.serifItalic,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  rpeHint: {
    fontFamily: fonts.serifItalic,
    ...typeScale.body,
    color: colors.paloRosaLight,
    marginTop: spacing.xs,
  },
  periodRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  periodLabel: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
    flex: 1,
    marginRight: spacing.md,
  },
  generalError: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.error,
    textAlign: "center",
  },
  confirmScreen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.xl,
  },
  confirmTitle: {
    fontFamily: fonts.display,
    ...typeScale.title,
    color: colors.champan,
    textAlign: "center",
  },
  confirmMessage: {
    fontFamily: fonts.serifItalic,
    ...typeScale.subheading,
    color: colors.marfil,
    textAlign: "center",
    lineHeight: 24,
  },
});
