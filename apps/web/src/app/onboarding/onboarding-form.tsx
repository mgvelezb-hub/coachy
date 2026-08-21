"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  EMPTY_ONBOARDING_STATE,
  submitOnboarding,
  type OnboardingState,
} from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BUDGETS,
  CONDITION_LABELS,
  CONDITIONS,
  GOAL_LABELS,
  GOALS,
  SEXES,
  TRAINING_TIMES,
  WORK_SCHEDULES,
} from "@/lib/validation/onboarding";

const SEX_LABELS: Record<(typeof SEXES)[number], string> = {
  FEMALE: "Mujer",
  MALE: "Hombre",
  OTHER: "Otro",
};

const WORK_LABELS: Record<(typeof WORK_SCHEDULES)[number], string> = {
  SEDENTARIO: "Sentada la mayor parte del día",
  ACTIVO: "De pie o moviéndome todo el día",
};

const TIME_LABELS: Record<(typeof TRAINING_TIMES)[number], string> = {
  MANANA: "Mañana",
  MEDIODIA: "Mediodía",
  TARDE: "Tarde",
  NOCHE: "Noche",
};

const BUDGET_LABELS: Record<(typeof BUDGETS)[number], string> = {
  BAJO: "Ajustado",
  MEDIO: "Normal",
  ALTO: "Holgado",
};

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

function RadioRow<T extends string>({
  name,
  options,
  labels,
  defaultValue,
}: {
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  defaultValue?: T;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option}
          className="cursor-pointer rounded-full border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
        >
          <input
            type="radio"
            name={name}
            value={option}
            defaultChecked={defaultValue === option}
            className="sr-only"
          />
          {labels[option]}
        </label>
      ))}
    </div>
  );
}

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Guardando…" : "Empezar"}
    </Button>
  );
}

export function OnboardingForm({ email }: { email: string }): React.JSX.Element {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    submitOnboarding,
    EMPTY_ONBOARDING_STATE,
  );
  const [consent, setConsent] = useState(false);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="space-y-5 pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Quién eres</CardTitle>
          <CardDescription>Con esto calculamos tu gasto y tu punto de partida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">¿Cómo te decimos?</Label>
            <Input id="displayName" name="displayName" required placeholder="Tu nombre" />
            <FieldError message={errors.displayName} />
          </div>

          <div className="space-y-2">
            <Label>Sexo biológico</Label>
            <RadioRow name="sex" options={SEXES} labels={SEX_LABELS} defaultValue="FEMALE" />
            <p className="text-xs text-muted-foreground">
              Cambia la fórmula del metabolismo basal, nada más.
            </p>
            <FieldError message={errors.sex} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthDate">Fecha de nacimiento</Label>
            <Input id="birthDate" name="birthDate" type="date" required />
            <FieldError message={errors.birthDate} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="heightCm">Estatura (cm)</Label>
              <Input
                id="heightCm"
                name="heightCm"
                type="number"
                inputMode="decimal"
                step="0.5"
                required
                placeholder="162"
              />
              <FieldError message={errors.heightCm} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weightKg">Peso (kg)</Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                inputMode="decimal"
                step="0.1"
                required
                placeholder="70.0"
              />
              <FieldError message={errors.weightKg} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leanMassKg">Masa magra (kg) — opcional</Label>
            <Input
              id="leanMassKg"
              name="leanMassKg"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Si tienes un InBody reciente"
            />
            <FieldError message={errors.leanMassKg} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo entrenas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="liftingDays">Días de pesas por semana</Label>
              <Input
                id="liftingDays"
                name="liftingDays"
                type="number"
                inputMode="numeric"
                min={0}
                max={7}
                required
                defaultValue={4}
              />
              <FieldError message={errors.liftingDays} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cardioMinWk">Cardio (min/semana)</Label>
              <Input
                id="cardioMinWk"
                name="cardioMinWk"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={0}
              />
              <FieldError message={errors.cardioMinWk} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>¿A qué hora entrenas?</Label>
            <RadioRow
              name="trainingTime"
              options={TRAINING_TIMES}
              labels={TIME_LABELS}
              defaultValue="MANANA"
            />
          </div>

          <div className="space-y-2">
            <Label>Tu día fuera del gym</Label>
            <RadioRow
              name="work"
              options={WORK_SCHEDULES}
              labels={WORK_LABELS}
              defaultValue="SEDENTARIO"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo comes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mealsPerDay">Comidas al día</Label>
            <Input
              id="mealsPerDay"
              name="mealsPerDay"
              type="number"
              inputMode="numeric"
              min={3}
              max={5}
              required
              defaultValue={4}
            />
            <FieldError message={errors.mealsPerDay} />
          </div>

          <div className="space-y-2">
            <Label>Presupuesto para el súper</Label>
            <RadioRow name="budget" options={BUDGETS} labels={BUDGET_LABELS} defaultValue="MEDIO" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="favoriteFoods">Lo que sí te gusta</Label>
            <Textarea
              id="favoriteFoods"
              name="favoriteFoods"
              placeholder="pollo, avena, camote, fresas — separa con comas"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="excludedFoods">Lo que no comes</Label>
            <Textarea
              id="excludedFoods"
              name="excludedFoods"
              placeholder="hígado, brócoli — separa con comas"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="allergies">Alergias</Label>
            <Textarea id="allergies" name="allergies" placeholder="lactosa, nuez — separa con comas" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contexto y objetivo</CardTitle>
          <CardDescription>
            Nada de esto es un diagnóstico. Solo ajusta las reglas del plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>¿Algo de esto aplica?</Label>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((condition) => (
                <label
                  key={condition}
                  className="cursor-pointer rounded-full border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
                >
                  <input
                    type="checkbox"
                    name="conditions"
                    value={condition}
                    className="sr-only"
                  />
                  {CONDITION_LABELS[condition]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tu objetivo</Label>
            <div className="flex flex-col gap-2">
              {GOALS.map((goal) => (
                <label
                  key={goal}
                  className="cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
                >
                  <input
                    type="radio"
                    name="goal"
                    value={goal}
                    defaultChecked={goal === "RECOMPOSICION"}
                    className="sr-only"
                  />
                  {GOAL_LABELS[goal]}
                </label>
              ))}
            </div>
            <FieldError message={errors.goal} />
          </div>
        </CardContent>
      </Card>

      <Card className={cn(consent && "border-primary")}>
        <CardHeader>
          <CardTitle>Fotos de progreso</CardTitle>
          <CardDescription>
            Tus fotos se guardan cifradas y privadas. Solo tú y tu coach las ven.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="photoConsent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--primary)]"
            />
            <span>
              Autorizo que Coachy analice mis fotos con inteligencia artificial para comparar los
              cambios semana a semana. Puedo quitar este permiso cuando quiera; sin él, las fotos
              nunca salen del almacenamiento privado.
            </span>
          </label>
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <SubmitButton />
        <p className="text-center text-xs text-muted-foreground">Cuenta: {email}</p>
      </div>
    </form>
  );
}
