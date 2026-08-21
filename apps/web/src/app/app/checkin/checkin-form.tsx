"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import {
  submitCheckIn,
  type CheckInState,
} from "@/app/app/checkin/actions";
import { EMPTY_CHECKIN_STATE } from "@/app/app/checkin/state";
import { PhotoInput } from "@/app/app/checkin/photo-input";
import { useCheckInDraft } from "@/app/app/checkin/use-checkin-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CYCLE_PHASES,
  STRENGTH_TRENDS,
  SYMPTOM_LABELS,
  SYMPTOMS,
  complianceStepSchema,
  measurementsStepSchema,
  sensationsStepSchema,
} from "@/lib/validation/checkin";

const STEPS = ["Medidas", "Fotos", "Cómo te sentiste", "Cumplimiento"] as const;

const SENSATIONS = [
  { name: "inflammation", label: "Inflamación", low: "Nada", high: "Muchísima" },
  { name: "energy", label: "Energía", low: "En el piso", high: "A tope" },
  { name: "hunger", label: "Hambre", low: "Ninguna", high: "Todo el día" },
  { name: "satiety", label: "Saciedad", low: "Nunca llena", high: "Muy llena" },
  { name: "sleep", label: "Sueño", low: "Pésimo", high: "Excelente" },
] as const;

const TREND_LABELS: Record<(typeof STRENGTH_TRENDS)[number], string> = {
  SUBE: "Subiendo",
  IGUAL: "Igual",
  BAJA: "Bajando",
};

const CYCLE_LABELS: Record<(typeof CYCLE_PHASES)[number], string> = {
  FOLICULAR: "Folicular",
  OVULACION: "Ovulación",
  LUTEA: "Lútea",
  MENSTRUACION: "Menstruación",
  NA: "No aplica",
};

export interface PreviousPhoto {
  view: string;
  url: string;
}

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Mandando…" : "Mandar mi check-in"}
    </Button>
  );
}

/** Campo numérico con teclado decimal — nada de spinners diminutos en móvil. */
function NumberField({
  name,
  label,
  hint,
  value,
  onChange,
  error,
  step = "0.1",
  placeholder,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  step?: string;
  placeholder?: string;
  required?: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError message={error} />
    </div>
  );
}

export function CheckInForm({
  date,
  previousPhotos,
  previousWaistCm,
  cycleTracking,
}: {
  date: string;
  previousPhotos: PreviousPhoto[];
  previousWaistCm: number | null;
  cycleTracking: boolean;
}): React.JSX.Element {
  const [state, formAction] = useActionState<CheckInState, FormData>(
    submitCheckIn,
    EMPTY_CHECKIN_STATE,
  );
  const { draft, loaded, setValue, clear } = useCheckInDraft(date);
  const [step, setStep] = useState(0);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const get = (key: string, fallback = ""): string => {
    const value = draft[key];
    return typeof value === "string" ? value : fallback;
  };
  const symptoms = Array.isArray(draft.symptoms) ? draft.symptoms : [];

  const previousByView = useMemo(() => {
    const map: Record<string, string> = {};
    for (const photo of previousPhotos) map[photo.view] = photo.url;
    return map;
  }, [previousPhotos]);

  useEffect(() => {
    if (state.status === "success") {
      clear();
      toast.success(state.message ?? "Check-in guardado");
      for (const warning of state.warnings) toast.warning(warning);
    }
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state, clear]);

  if (!loaded) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  }

  if (state.status === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Listo por esta semana</CardTitle>
          <CardDescription>
            Coachy ya tiene tus números. En cuanto revise la semana te avisa qué sigue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.warnings.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {state.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <a href="/app/historial">Ver mi historial</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  /** Valida solo el paso actual: avanzar no debe exigir lo que aún no se llena. */
  function validateStep(): boolean {
    const num = (key: string): number | null => {
      const value = get(key);
      if (value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    if (step === 0) {
      const result = measurementsStepSchema.safeParse({
        date,
        waistCm: num("waistCm"),
        weightKg: num("weightKg"),
        legLeftCm: num("legLeftCm"),
        legRightCm: num("legRightCm"),
        armLeftCm: num("armLeftCm"),
        armRightCm: num("armRightCm"),
      });
      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !errors[key]) errors[key] = issue.message;
        }
        setLocalErrors(errors);
        return false;
      }
    }

    if (step === 2) {
      const result = sensationsStepSchema.safeParse({
        inflammation: num("inflammation") ?? 3,
        energy: num("energy") ?? 3,
        hunger: num("hunger") ?? 3,
        satiety: num("satiety") ?? 3,
        sleep: num("sleep") ?? 3,
        strengthRpe: num("strengthRpe"),
        strengthTrend: get("strengthTrend") || null,
      });
      if (!result.success) {
        setLocalErrors({ sensations: "Revisa los deslizadores" });
        return false;
      }
    }

    if (step === 3) {
      const result = complianceStepSchema.safeParse({
        dietCompliance: num("dietCompliance") ?? 100,
        trainingCompliance: num("trainingCompliance") ?? 100,
        symptoms,
        otherSymptom: get("otherSymptom") || undefined,
        cyclePhase: get("cyclePhase") || null,
        comment: get("comment") || undefined,
      });
      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !errors[key]) errors[key] = issue.message;
        }
        setLocalErrors(errors);
        return false;
      }
    }

    setLocalErrors({});
    return true;
  }

  function next(): void {
    if (validateStep()) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  const errors = { ...localErrors, ...state.fieldErrors };
  const waist = Number(get("waistCm"));
  const waistDelta =
    previousWaistCm !== null && Number.isFinite(waist) && get("waistCm") !== ""
      ? waist - previousWaistCm
      : null;

  return (
    <form action={formAction} className="space-y-5 pb-6">
      <input type="hidden" name="date" value={date} />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{STEPS[step]}</span>
          <span className="text-muted-foreground">
            Paso {step + 1} de {STEPS.length}
          </span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} />
      </div>

      {/* Paso 1 — Medidas */}
      <div className={cn("space-y-4", step !== 0 && "hidden")}>
        <Card>
          <CardHeader>
            <CardTitle>Tus medidas</CardTitle>
            <CardDescription>
              En la mañana, en ayunas. Cintura a la altura del ombligo; piernas en la parte más
              ancha; brazos en contracción.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NumberField
              name="waistCm"
              label="Cintura (cm)"
              hint="La cinta manda. Es la medida que más nos dice."
              required
              value={get("waistCm")}
              onChange={(value) => setValue("waistCm", value)}
              error={errors.waistCm}
              placeholder="90.0"
            />
            {waistDelta !== null ? (
              <Badge variant={waistDelta <= -0.5 ? "success" : "secondary"}>
                {waistDelta > 0 ? "+" : ""}
                {waistDelta.toFixed(1)} cm vs la semana pasada
              </Badge>
            ) : null}

            <NumberField
              name="weightKg"
              label="Peso (kg) — opcional"
              value={get("weightKg")}
              onChange={(value) => setValue("weightKg", value)}
              error={errors.weightKg}
              placeholder="75.0"
            />

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                name="legLeftCm"
                label="Pierna izq."
                value={get("legLeftCm")}
                onChange={(value) => setValue("legLeftCm", value)}
                error={errors.legLeftCm}
              />
              <NumberField
                name="legRightCm"
                label="Pierna der."
                value={get("legRightCm")}
                onChange={(value) => setValue("legRightCm", value)}
                error={errors.legRightCm}
              />
              <NumberField
                name="armLeftCm"
                label="Brazo izq."
                value={get("armLeftCm")}
                onChange={(value) => setValue("armLeftCm", value)}
                error={errors.armLeftCm}
              />
              <NumberField
                name="armRightCm"
                label="Brazo der."
                value={get("armRightCm")}
                onChange={(value) => setValue("armRightCm", value)}
                error={errors.armRightCm}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Paso 2 — Fotos */}
      <div className={cn("space-y-4", step !== 1 && "hidden")}>
        <Card>
          <CardHeader>
            <CardTitle>Tres fotos</CardTitle>
            <CardDescription>
              Misma luz y misma hora que la semana pasada. Si no te da tiempo, puedes saltarlas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <PhotoInput view="FRENTE" label="Frente" previousUrl={previousByView.FRENTE ?? null} />
            <PhotoInput view="PERFIL" label="Perfil" previousUrl={previousByView.PERFIL ?? null} />
            <PhotoInput
              view="ESPALDA"
              label="Espalda"
              previousUrl={previousByView.ESPALDA ?? null}
            />
          </CardContent>
        </Card>
      </div>

      {/* Paso 3 — Sensaciones */}
      <div className={cn("space-y-4", step !== 2 && "hidden")}>
        <Card>
          <CardHeader>
            <CardTitle>Cómo te sentiste</CardTitle>
            <CardDescription>Del 1 al 5. Sin pensarlo mucho.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {SENSATIONS.map((sensation) => {
              const value = Number(get(sensation.name, "3"));
              return (
                <div key={sensation.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{sensation.label}</Label>
                    <span className="text-sm font-semibold text-primary">{value}</span>
                  </div>
                  <Slider
                    min={1}
                    max={5}
                    step={1}
                    value={[value]}
                    onValueChange={([next]) => setValue(sensation.name, String(next ?? 3))}
                    aria-label={sensation.label}
                  />
                  <input type="hidden" name={sensation.name} value={value} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{sensation.low}</span>
                    <span>{sensation.high}</span>
                  </div>
                </div>
              );
            })}

            <div className="space-y-2">
              <Label htmlFor="strengthRpe">Esfuerzo en el gym (RPE 1-10) — opcional</Label>
              <Input
                id="strengthRpe"
                name="strengthRpe"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                value={get("strengthRpe")}
                onChange={(event) => setValue("strengthRpe", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tu fuerza esta semana</Label>
              <div className="flex gap-2">
                {STRENGTH_TRENDS.map((trend) => (
                  <label
                    key={trend}
                    className="flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
                  >
                    <input
                      type="radio"
                      name="strengthTrend"
                      value={trend}
                      checked={get("strengthTrend") === trend}
                      onChange={() => setValue("strengthTrend", trend)}
                      className="sr-only"
                    />
                    {TREND_LABELS[trend]}
                  </label>
                ))}
              </div>
            </div>
            <FieldError message={errors.sensations} />
          </CardContent>
        </Card>
      </div>

      {/* Paso 4 — Cumplimiento, síntomas, comentario */}
      <div className={cn("space-y-4", step !== 3 && "hidden")}>
        <Card>
          <CardHeader>
            <CardTitle>Qué tanto se cumplió</CardTitle>
            <CardDescription>
              Con honestidad. Si fue 60%, el plan cambia distinto que si fue 95%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(
              [
                { name: "dietCompliance", label: "Dieta" },
                { name: "trainingCompliance", label: "Entrenamiento" },
              ] as const
            ).map((field) => {
              const value = Number(get(field.name, "90"));
              return (
                <div key={field.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{field.label}</Label>
                    <span className="text-sm font-semibold text-primary">{value}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[value]}
                    onValueChange={([next]) => setValue(field.name, String(next ?? 90))}
                    aria-label={field.label}
                  />
                  <input type="hidden" name={field.name} value={value} />
                </div>
              );
            })}

            <div className="space-y-2">
              <Label>¿Algún síntoma?</Label>
              <div className="flex flex-wrap gap-2">
                {SYMPTOMS.map((symptom) => {
                  const checked = symptoms.includes(symptom);
                  return (
                    <label
                      key={symptom}
                      className="cursor-pointer rounded-full border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
                    >
                      <input
                        type="checkbox"
                        name="symptoms"
                        value={symptom}
                        checked={checked}
                        onChange={(event) =>
                          setValue(
                            "symptoms",
                            event.target.checked
                              ? [...symptoms, symptom]
                              : symptoms.filter((item) => item !== symptom),
                          )
                        }
                        className="sr-only"
                      />
                      {SYMPTOM_LABELS[symptom]}
                    </label>
                  );
                })}
              </div>
            </div>

            {symptoms.includes("otro") ? (
              <div className="space-y-2">
                <Label htmlFor="otherSymptom">¿Cuál?</Label>
                <Input
                  id="otherSymptom"
                  name="otherSymptom"
                  value={get("otherSymptom")}
                  onChange={(event) => setValue("otherSymptom", event.target.value)}
                />
              </div>
            ) : null}

            {cycleTracking ? (
              <div className="space-y-2">
                <Label>Fase del ciclo</Label>
                <div className="flex flex-wrap gap-2">
                  {CYCLE_PHASES.map((phase) => (
                    <label
                      key={phase}
                      className="cursor-pointer rounded-full border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
                    >
                      <input
                        type="radio"
                        name="cyclePhase"
                        value={phase}
                        checked={get("cyclePhase") === phase}
                        onChange={() => setValue("cyclePhase", phase)}
                        className="sr-only"
                      />
                      {CYCLE_LABELS[phase]}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="comment">¿Algo que deba saber?</Label>
              <Textarea
                id="comment"
                name="comment"
                rows={4}
                placeholder="Viajé, me lesioné el tobillo, dormí fatal…"
                value={get("comment")}
                onChange={(event) => setValue("comment", event.target.value)}
              />
              <FieldError message={errors.comment} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Atrás
          </Button>
        ) : null}

        {step < STEPS.length - 1 ? (
          <Button type="button" size="lg" className="flex-1" onClick={next}>
            Seguir <ArrowRight />
          </Button>
        ) : (
          <div className="flex-1">
            <SubmitButton />
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Lo que escribes se guarda en este teléfono mientras terminas.
      </p>
    </form>
  );
}
