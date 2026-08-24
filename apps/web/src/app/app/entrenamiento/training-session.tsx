"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, CloudOff, Dumbbell, RefreshCw, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExerciseLogger } from "@/app/app/entrenamiento/exercise-logger";
import { useSessionDraft, type SetEntry } from "@/app/app/entrenamiento/use-session-draft";
import { cacheWeek, enqueue, flushQueue, listQueue, readCachedWeek } from "@/lib/training/offline";
import type { SessionView, WeekView } from "@/lib/training/view";

/** Fecha de hoy en el teléfono. Sin red la del servidor puede venir de ayer. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type SyncPayload = {
  sessions: Array<{
    workoutId: string;
    completedAt: string | null;
    notes: string | null;
    sets: Array<Record<string, unknown>>;
  }>;
};

export function TrainingSession({
  week: serverWeek,
  serverToday,
}: {
  week: WeekView | null;
  serverToday: string;
}): React.JSX.Element {
  const [week, setWeek] = useState<WeekView | null>(serverWeek);
  const [today, setToday] = useState(serverToday);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const session = useMemo(
    () => week?.sessions.find((entry) => entry.date === today) ?? null,
    [week, today],
  );

  const { draft, update, clear } = useSessionDraft(session?.workoutId ?? null);

  const flush = useCallback(async () => {
    const result = await flushQueue();
    setPending(result.pending);
  }, []);

  // La semana se guarda en el teléfono en cuanto llega con red, y se recupera
  // de ahí cuando el service worker sirvió una página vieja.
  useEffect(() => {
    setToday(todayISO());
    if (serverWeek) {
      void cacheWeek(serverWeek.weekStart, serverWeek);
      return;
    }
    void (async () => {
      const stored = (await readCachedWeek(currentMonday())) as WeekView | null;
      if (stored) setWeek(stored);
    })();
  }, [serverWeek]);

  useEffect(() => {
    function sync(): void {
      setOnline(navigator.onLine);
      if (navigator.onLine) void flush();
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const id = window.setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(id);
    };
  }, [flush]);

  const queuePayload = useCallback(
    async (current: typeof draft, completed: boolean) => {
      if (!session) return;

      const sets = session.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.sets.flatMap((target, setIndex) => {
          const entry = current.entries[`${exerciseIndex}:${setIndex}`];
          if (!entry) return [];
          return [
            {
              clientId: `${session.workoutId}:${exerciseIndex}:${setIndex}`,
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.name,
              setIndex,
              targetReps: target.reps,
              reps: entry.reps,
              weightKg: entry.weightKg,
              rpe: current.rpe[String(exerciseIndex)] ?? null,
              warmup: target.warmup,
              performedAt: entry.performedAt,
            },
          ];
        }),
      );

      if (sets.length === 0) return;

      const payload: SyncPayload = {
        sessions: [
          {
            workoutId: session.workoutId,
            completedAt: completed ? new Date().toISOString() : null,
            notes: current.notes.trim() ? current.notes.trim() : null,
            sets,
          },
        ],
      };

      await enqueue(`session:${session.workoutId}`, payload);
      setPending((await listQueue()).length);
      void flush();
    },
    [session, flush],
  );

  function handleMarkSet(exerciseIndex: number, setIndex: number, entry: SetEntry | null): void {
    const key = `${exerciseIndex}:${setIndex}`;
    const entries = { ...draft.entries };
    if (entry) entries[key] = entry;
    else delete entries[key];

    const next = update({ entries });
    void queuePayload(next, false);
  }

  const totals = useMemo(() => {
    if (!session) return { volume: 0, sets: 0, prs: [] as string[] };
    let volume = 0;
    let sets = 0;
    const prs: string[] = [];

    session.exercises.forEach((exercise, exerciseIndex) => {
      let bestToday = 0;
      exercise.sets.forEach((target, setIndex) => {
        const entry = draft.entries[`${exerciseIndex}:${setIndex}`];
        if (!entry || target.warmup) return;
        sets += 1;
        volume += (entry.weightKg ?? 0) * entry.reps;
        if ((entry.weightKg ?? 0) > bestToday) bestToday = entry.weightKg ?? 0;
      });
      if (bestToday > 0 && bestToday > (exercise.bestWeightKg ?? 0)) prs.push(exercise.name);
    });

    return { volume: Math.round(volume), sets, prs };
  }, [session, draft]);

  if (!session) {
    return <RestDay week={week} today={today} />;
  }

  const exercisesDone = session.exercises.filter((exercise, exerciseIndex) =>
    exercise.sets.every((_, setIndex) => draft.entries[`${exerciseIndex}:${setIndex}`]),
  ).length;

  return (
    <div className="space-y-4">
      <ConnectionBadge online={online} pending={pending} onRetry={() => void flush()} />

      {openIndex === null ? (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold">{session.muscleGroup}</h1>
            <p className="text-sm text-muted-foreground">
              {session.schemeLabel} · {session.exercises.length} ejercicios
              {session.cardioMinutes ? ` · ${session.cardioMinutes} min de cardio al final` : ""}
            </p>
          </header>

          <div className="space-y-2">
            {session.exercises.map((exercise, index) => {
              const done = exercise.sets.filter(
                (_, setIndex) => draft.entries[`${index}:${setIndex}`],
              ).length;
              const complete = done === exercise.sets.length;

              return (
                <button
                  key={`${exercise.name}-${index}`}
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {complete ? (
                      <CheckCircle2 className="size-5 text-primary" />
                    ) : (
                      <Dumbbell className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {exercise.schemeLabel} · {done}/{exercise.sets.length} series
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={totals.sets === 0}
            onClick={() => setSummaryOpen(true)}
          >
            Terminar sesión ({exercisesDone}/{session.exercises.length})
          </Button>
        </>
      ) : (
        <ExerciseLogger
          // La llave fuerza el remonte al cambiar de ejercicio: los steppers
          // arrancan del peso sugerido del nuevo, no del anterior.
          key={openIndex}
          exercise={session.exercises[openIndex] as SessionView["exercises"][number]}
          index={openIndex}
          entries={draft.entries}
          rpe={draft.rpe[String(openIndex)] ?? null}
          notes={draft.notes}
          onMarkSet={(setIndex, entry) => handleMarkSet(openIndex, setIndex, entry)}
          onRpe={(value) => {
            const next = update({ rpe: { ...draft.rpe, [String(openIndex)]: value } });
            void queuePayload(next, false);
          }}
          onNotes={(value) => update({ notes: value })}
          onBack={() => setOpenIndex(null)}
          onNext={() => {
            if (openIndex + 1 < session.exercises.length) setOpenIndex(openIndex + 1);
            else {
              setOpenIndex(null);
              setSummaryOpen(true);
            }
          }}
          isLast={openIndex + 1 === session.exercises.length}
        />
      )}

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sesión terminada</DialogTitle>
            <DialogDescription>{session.muscleGroup}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Volumen</p>
                <p className="text-xl font-bold">{totals.volume.toLocaleString("es-MX")} kg</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
                <p className="text-xl font-bold">{totals.sets}</p>
              </div>
            </div>

            {totals.prs.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-primary bg-primary/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="size-4 text-primary" />
                  {totals.prs.length === 1 ? "¡Récord personal!" : "¡Récords personales!"}
                </p>
                <p className="text-sm">{totals.prs.join(" · ")}</p>
                <p className="text-xs text-muted-foreground">
                  La fuerza subiendo es la señal de que el músculo se queda.
                </p>
              </div>
            ) : null}

            {!online ? (
              <p className="text-xs text-muted-foreground">
                Sin conexión: quedó guardado en el teléfono y se sube solo cuando vuelva la red.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                const next = update({ completedAt: new Date().toISOString() });
                void queuePayload(next, true);
                setSummaryOpen(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {draft.completedAt ? (
        <Button type="button" variant="ghost" className="w-full" onClick={clear}>
          Empezar de nuevo
        </Button>
      ) : null}
    </div>
  );
}

function currentMonday(): string {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - (day - 1));
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

function ConnectionBadge({
  online,
  pending,
  onRetry,
}: {
  online: boolean;
  pending: number;
  onRetry: () => void;
}): React.JSX.Element | null {
  if (online && pending === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted px-3 py-2 text-xs">
      <span className="flex items-center gap-2">
        <CloudOff className="size-4 shrink-0 text-muted-foreground" />
        {online
          ? `${pending} ${pending === 1 ? "sesión pendiente" : "sesiones pendientes"} de subir`
          : "Sin conexión — todo se guarda en el teléfono"}
      </span>
      {online ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3" /> Reintentar
        </Button>
      ) : null}
    </div>
  );
}

function RestDay({ week, today }: { week: WeekView | null; today: string }): React.JSX.Element {
  const next = week?.sessions.find((session) => session.date > today) ?? null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hoy toca descanso</h1>
        <p className="text-sm text-muted-foreground">
          {week
            ? "El descanso es parte del plan: el músculo se construye fuera del gimnasio."
            : "Todavía no hay rutina cargada para esta semana."}
        </p>
      </header>

      {next ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lo que sigue</CardTitle>
            <CardDescription>{next.muscleGroup}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {next.exercises.slice(0, 6).map((exercise) => (
                <Badge key={exercise.name} variant="secondary">
                  {exercise.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Button asChild variant="outline" className="w-full">
        <Link href="/app">Volver</Link>
      </Button>
    </div>
  );
}
