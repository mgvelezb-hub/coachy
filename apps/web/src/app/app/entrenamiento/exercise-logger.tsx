"use client";

import { useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Trophy, VideoOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RestTimer } from "@/app/app/entrenamiento/rest-timer";
import type { SetEntry } from "@/app/app/entrenamiento/use-session-draft";
import type { SessionExerciseView } from "@/lib/training/view";

/** El peso sube de 2.5 en 2.5: es el disco más chico de cualquier gimnasio. */
const WEIGHT_STEP = 2.5;

function Stepper({
  label,
  value,
  step,
  min,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (next: number) => void;
  suffix?: string;
}): React.JSX.Element {
  return (
    <div className="flex-1 space-y-1">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center justify-between gap-1 rounded-lg border bg-background p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Bajar ${label}`}
          onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        >
          <Minus />
        </Button>
        <span className="min-w-12 text-center text-lg font-bold tabular-nums">
          {value}
          {suffix ? <span className="text-xs font-normal text-muted-foreground">{suffix}</span> : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Subir ${label}`}
          onClick={() => onChange(Number((value + step).toFixed(2)))}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

/**
 * Captura de un ejercicio: peso y reps en dos taps.
 *
 * Cada serie llega prellenada con el peso que sugiere la progresión (o el
 * último que registró). Si coincide, es un solo tap en la palomita; si no,
 * los ± son botones de 44 px porque esto se usa con las manos sudadas.
 */
export function ExerciseLogger({
  exercise,
  index,
  entries,
  rpe,
  notes,
  onMarkSet,
  onRpe,
  onNotes,
  onBack,
  onNext,
  isLast,
}: {
  exercise: SessionExerciseView;
  index: number;
  entries: Record<string, SetEntry>;
  rpe: number | null;
  notes: string;
  onMarkSet: (setIndex: number, entry: SetEntry | null) => void;
  onRpe: (value: number) => void;
  onNotes: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<number, { reps: number; weightKg: number }>>(() => {
    const initial: Record<number, { reps: number; weightKg: number }> = {};
    exercise.sets.forEach((set, setIndex) => {
      const saved = entries[`${index}:${setIndex}`];
      initial[setIndex] = {
        reps: saved?.reps ?? set.reps,
        weightKg: saved?.weightKg ?? (set.weightKg ?? exercise.lastWeightKg ?? 0),
      };
    });
    return initial;
  });

  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);

  const done = exercise.sets.filter((_, setIndex) => entries[`${index}:${setIndex}`]).length;
  const allDone = done === exercise.sets.length;

  function setDraft(setIndex: number, patch: Partial<{ reps: number; weightKg: number }>): void {
    setDrafts((current) => ({
      ...current,
      [setIndex]: { ...(current[setIndex] ?? { reps: 0, weightKg: 0 }), ...patch },
    }));
  }

  function mark(setIndex: number): void {
    const saved = entries[`${index}:${setIndex}`];
    if (saved) {
      onMarkSet(setIndex, null);
      return;
    }
    const draft = drafts[setIndex] ?? { reps: 0, weightKg: 0 };
    onMarkSet(setIndex, {
      reps: draft.reps,
      weightKg: draft.weightKg > 0 ? draft.weightKg : null,
      performedAt: new Date().toISOString(),
    });
    setRestStartedAt(Date.now());
  }

  const beatsRecord =
    exercise.bestWeightKg !== null &&
    Object.entries(entries).some(
      ([key, entry]) =>
        key.startsWith(`${index}:`) && (entry.weightKg ?? 0) > (exercise.bestWeightKg ?? 0),
    );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Ejercicios
      </button>

      <header className="space-y-1">
        <h2 className="text-xl font-bold leading-tight">{exercise.name}</h2>
        <p className="text-sm text-muted-foreground">{exercise.schemeLabel}</p>
        {exercise.note ? <p className="text-sm text-primary">{exercise.note}</p> : null}
      </header>

      {exercise.videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={exercise.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-lg border bg-black"
        />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <VideoOff className="size-4 shrink-0" />
          {exercise.videoPath
            ? "El video no cargó (sin conexión). El esquema y las series siguen aquí."
            : "Este ejercicio todavía no tiene video."}
        </div>
      )}

      {beatsRecord ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/10 p-3 text-sm font-medium">
          <Trophy className="size-4 text-primary" /> ¡Récord! Nunca habías levantado tanto aquí.
        </div>
      ) : null}

      {restStartedAt !== null ? (
        <RestTimer
          startedAt={restStartedAt}
          seconds={exercise.restSeconds}
          onDismiss={() => setRestStartedAt(null)}
        />
      ) : null}

      <div className="space-y-2">
        {exercise.sets.map((target, setIndex) => {
          const saved = entries[`${index}:${setIndex}`];
          const draft = drafts[setIndex] ?? { reps: target.reps, weightKg: 0 };

          return (
            <Card key={setIndex} className={saved ? "border-primary/50 bg-primary/5" : undefined}>
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {target.warmup ? "Calentamiento" : `Serie ${setIndex + 1 - warmupsBefore(exercise, setIndex)}`}
                  </span>
                  <Badge variant="secondary">objetivo {target.reps} reps</Badge>
                </div>

                <div className="flex items-end gap-2">
                  <Stepper
                    label="Peso"
                    value={saved ? (saved.weightKg ?? 0) : draft.weightKg}
                    step={WEIGHT_STEP}
                    min={0}
                    suffix=" kg"
                    onChange={(next) => setDraft(setIndex, { weightKg: next })}
                  />
                  <Stepper
                    label="Reps"
                    value={saved ? saved.reps : draft.reps}
                    step={1}
                    min={0}
                    onChange={(next) => setDraft(setIndex, { reps: next })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant={saved ? "default" : "outline"}
                    className="size-12 shrink-0"
                    aria-label={saved ? "Desmarcar serie" : "Marcar serie"}
                    onClick={() => mark(setIndex)}
                  >
                    <Check />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-semibold">¿Qué tan pesado se sintió? (RPE)</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
            <Button
              key={value}
              type="button"
              variant={rpe === value ? "default" : "outline"}
              className="h-11"
              onClick={() => onRpe(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <Textarea
          placeholder="Notas (opcional): molestias, cambios de máquina, lo que sea."
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          rows={2}
        />
      </div>

      <Button type="button" size="lg" className="w-full" onClick={onNext} disabled={!allDone}>
        {allDone ? (isLast ? "Terminar sesión" : "Siguiente ejercicio") : `Faltan ${exercise.sets.length - done} series`}
      </Button>
    </div>
  );
}

/** Las series de calentamiento no cuentan para la numeración de las efectivas. */
function warmupsBefore(exercise: SessionExerciseView, setIndex: number): number {
  return exercise.sets.slice(0, setIndex + 1).filter((set) => set.warmup).length;
}
