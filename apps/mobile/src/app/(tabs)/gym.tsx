import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ExerciseCapture } from "@/components/ExerciseCapture";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import {
  ApiError,
  getTrainingWeek,
  type ExerciseAlternative,
  type SessionSyncInput,
  type SessionView,
  type WeekView,
  type WorkoutSetInput,
} from "@/lib/api";
import { colors, fonts, radius, spacing } from "@/lib/theme";
import {
  getCachedWeek,
  getPendingSession,
  saveWeek,
  upsertPendingSession,
} from "@/lib/training-db";
import { exercisePrefix } from "@/lib/training-client-id";
import { refreshPendingCount, subscribePendingCount, syncAndNotify } from "@/lib/training-sync";

/**
 * Modo gimnasio (Fase N4) — offline-first.
 *
 * La semana ya tiene que estar en el teléfono antes de entrar al sótano: se
 * intenta traer fresca de red al abrir la pestaña y, si no hay señal, se cae
 * al cache de SQLite (`apps/mobile/src/lib/training-db.ts`). Cada serie que la
 * atleta marca se guarda ahí **primero**, local, y `training-sync.ts` la sube
 * sola cuando puede — la pantalla nunca espera al servidor para pintar lo que
 * ya se capturó.
 */

/** Fecha de hoy en el teléfono. Sin red la del servidor puede venir de ayer. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Lunes de esta semana, ISO. Misma cuenta que `currentMonday()` en
 * apps/web/src/app/app/entrenamiento/training-session.tsx: es la llave del
 * cache cuando no hay red para preguntarle al servidor cuál semana toca. */
function mondayISO(): string {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - (day - 1));
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptySessionInput(workoutId: string): SessionSyncInput {
  return { workoutId, completedAt: null, notes: null, sets: [], substitutions: [] };
}

function upsertByClientId(sets: WorkoutSetInput[], next: WorkoutSetInput): WorkoutSetInput[] {
  const filtered = sets.filter((set) => set.clientId !== next.clientId);
  return [...filtered, next];
}

function upsertSubstitution(
  substitutions: SessionSyncInput["substitutions"],
  exerciseIndex: number,
  exerciseId: string,
): SessionSyncInput["substitutions"] {
  return [...substitutions.filter((s) => s.exerciseIndex !== exerciseIndex), { exerciseIndex, exerciseId }];
}

/**
 * Cambia un ejercicio dentro de la semana que ya está en la mano.
 *
 * Espejo de `weekWithSubstitute()` en training-session.tsx: se aplica primero
 * en el teléfono, con las series de ese lugar vacías (la carga de la prensa
 * no es la del hack squat) y sin historial propio, porque el que había era
 * del ejercicio que se fue.
 */
function weekWithSubstitute(
  week: WeekView,
  workoutId: string,
  exerciseIndex: number,
  alternative: ExerciseAlternative,
): WeekView {
  return {
    ...week,
    sessions: week.sessions.map((session) => {
      if (session.workoutId !== workoutId) return session;
      return {
        ...session,
        exercises: session.exercises.map((exercise, index) => {
          if (index !== exerciseIndex) return exercise;
          return {
            ...exercise,
            exerciseId: alternative.exerciseId,
            name: alternative.name,
            videoPath: alternative.videoPath,
            // Sin backend de firma disponible offline: la descarga/firma de
            // video de un sustituto queda fuera de esta fase.
            videoUrl: null,
            lastWeightKg: null,
            bestWeightKg: null,
            record: null,
            sets: exercise.sets.map((set) => ({ ...set, weightKg: null })),
            alternatives: exercise.alternatives.filter(
              (option) => option.exerciseId !== alternative.exerciseId,
            ),
          };
        }),
      };
    }),
  };
}

export default function GymScreen() {
  const [week, setWeek] = useState<WeekView | null>(null);
  const [today, setToday] = useState(todayISO());
  const [phase, setPhase] = useState<"loading" | "onboarding" | "empty" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [draft, setDraft] = useState<SessionSyncInput | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const session = useMemo<SessionView | null>(
    () => week?.sessions.find((entry) => entry.date === today) ?? null,
    [week, today],
  );

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      const fresh = await getTrainingWeek();
      setWeek(fresh);
      setToday(fresh.today);
      await saveWeek(fresh.weekStart, fresh);
      setPhase("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setPhase("onboarding");
        return;
      }
      const cached = await getCachedWeek(mondayISO());
      if (cached) {
        setWeek(cached);
        setToday(todayISO());
        setPhase("ready");
      } else {
        setLoadError(
          error instanceof ApiError ? error.message : "Sin conexión y sin rutina guardada todavía",
        );
        setPhase("empty");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Indicador de red propio de esta pantalla (el badge de "sin conexión"); el
  // trigger real de la cola vive en training-sync.ts y corre aparte.
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePendingCount(setPendingCount);
    void refreshPendingCount();
    return unsubscribe;
  }, []);

  // La sesión de hoy trae su propio borrador pendiente, si ya se capturó algo.
  useEffect(() => {
    if (!session) {
      setDraft(null);
      return;
    }
    void (async () => {
      const pending = await getPendingSession(session.workoutId);
      setDraft(pending?.payload ?? emptySessionInput(session.workoutId));
    })();
  }, [session?.workoutId]);

  const persist = useCallback(async (next: SessionSyncInput) => {
    setDraft(next);
    // Local primero, siempre: la escritura en SQLite nunca espera a la red.
    await upsertPendingSession(next.workoutId, next);
    await refreshPendingCount();
    void syncAndNotify();
  }, []);

  const handleMarkSet = useCallback(
    (exerciseIndex: number, setIndex: number, values: { reps: number; weightKg: number | null } | null) => {
      if (!session || !draft) return;
      const exercise = session.exercises[exerciseIndex];
      const target = exercise?.sets[setIndex];
      if (!exercise || !target) return;

      const id = `${session.workoutId}:${exerciseIndex}:${setIndex}`;
      const nextSets =
        values === null
          ? draft.sets.filter((set) => set.clientId !== id)
          : upsertByClientId(draft.sets, {
              clientId: id,
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.name,
              setIndex,
              targetReps: target.reps,
              reps: values.reps,
              weightKg: values.weightKg,
              rpe: null,
              warmup: target.warmup,
              performedAt: new Date().toISOString(),
            });

      void persist({ ...draft, sets: nextSets });
    },
    [session, draft, persist],
  );

  const handleSubstitute = useCallback(
    (exerciseIndex: number, alternative: ExerciseAlternative) => {
      if (!week || !session || !draft) return;

      const nextWeek = weekWithSubstitute(week, session.workoutId, exerciseIndex, alternative);
      setWeek(nextWeek);
      void saveWeek(nextWeek.weekStart, nextWeek);

      // Lo capturado en ese lugar era de la otra máquina: se va con ella.
      const prefix = exercisePrefix(session.workoutId, exerciseIndex);
      const nextSets = draft.sets.filter((set) => !set.clientId.startsWith(prefix));
      const nextSubstitutions = upsertSubstitution(draft.substitutions, exerciseIndex, alternative.exerciseId);

      void persist({ ...draft, sets: nextSets, substitutions: nextSubstitutions });
    },
    [week, session, draft, persist],
  );

  const totals = useMemo(() => {
    if (!session || !draft) return { volume: 0, sets: 0, prs: [] as string[] };
    let volume = 0;
    let sets = 0;
    const prs: string[] = [];

    session.exercises.forEach((exercise, exerciseIndex) => {
      let bestToday = 0;
      exercise.sets.forEach((target, setIndex) => {
        const id = `${session.workoutId}:${exerciseIndex}:${setIndex}`;
        const entry = draft.sets.find((set) => set.clientId === id);
        if (!entry || target.warmup) return;
        sets += 1;
        volume += (entry.weightKg ?? 0) * entry.reps;
        if ((entry.weightKg ?? 0) > bestToday) bestToday = entry.weightKg ?? 0;
      });
      if (bestToday > 0 && bestToday > (exercise.bestWeightKg ?? 0)) prs.push(exercise.name);
    });

    return { volume: Math.round(volume), sets, prs };
  }, [session, draft]);

  async function completeSession() {
    if (!draft) return;
    await persist({ ...draft, completedAt: new Date().toISOString() });
    setSummaryOpen(false);
    setOpenIndex(null);
  }

  if (phase === "loading") return <LoadingState label="Cargando tu semana..." />;

  if (phase === "onboarding") {
    return (
      <View style={styles.center}>
        <EmptyState message="Tu coach todavía está preparando tu plan de entrenamiento." />
      </View>
    );
  }

  if (phase === "empty") {
    return <ErrorState message={loadError ?? "No se pudo cargar tu rutina"} onRetry={load} />;
  }

  const exercisesDone = session
    ? session.exercises.filter((exercise, exerciseIndex) =>
        exercise.sets.every((_, setIndex) =>
          draft?.sets.some((set) => set.clientId === `${session.workoutId}:${exerciseIndex}:${setIndex}`),
        ),
      ).length
    : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ConnectionBadge online={online} pendingCount={pendingCount} onRetry={() => void syncAndNotify()} />

      {!session ? (
        <RestDay week={week} today={today} />
      ) : openIndex === null || !draft ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{session.muscleGroup}</Text>
            <Text style={styles.meta}>
              {session.schemeLabel} · {session.exercises.length} ejercicios
              {session.cardioMinutes ? ` · ${session.cardioMinutes} min de cardio al final` : ""}
            </Text>
            {session.cycleNote && <Text style={styles.note}>{session.cycleNote}</Text>}
            {session.readinessNote && <Text style={styles.note}>🌙 {session.readinessNote}</Text>}
          </View>

          <View style={styles.list}>
            {session.exercises.map((exercise, index) => {
              const done = exercise.sets.filter((_, setIndex) =>
                draft?.sets.some((set) => set.clientId === `${session.workoutId}:${index}:${setIndex}`),
              ).length;
              const complete = done === exercise.sets.length;

              return (
                <Pressable
                  key={`${exercise.name}-${index}`}
                  onPress={() => setOpenIndex(index)}
                  style={styles.exerciseRow}
                >
                  <View style={[styles.exerciseDot, complete && styles.exerciseDotDone]}>
                    <Text style={styles.exerciseDotText}>{complete ? "✓" : "○"}</Text>
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.exerciseMeta}>
                      {exercise.schemeLabel} · {done}/{exercise.sets.length} series
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setSummaryOpen(true)}
            disabled={totals.sets === 0}
            style={[styles.finishButton, totals.sets === 0 && styles.finishButtonDisabled]}
          >
            <Text style={styles.finishButtonText}>
              TERMINAR SESIÓN ({exercisesDone}/{session.exercises.length})
            </Text>
          </Pressable>
        </>
      ) : (
        <ExerciseCapture
          key={`${openIndex}:${session.exercises[openIndex]?.name ?? ""}`}
          exercise={session.exercises[openIndex]!}
          exerciseIndex={openIndex}
          workoutId={session.workoutId}
          savedSets={draft.sets}
          online={online}
          onMarkSet={(setIndex, values) => handleMarkSet(openIndex, setIndex, values)}
          onSubstitute={(alternative) => handleSubstitute(openIndex, alternative)}
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

      {session && (
        <SummaryModal
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          muscleGroup={session.muscleGroup}
          totals={totals}
          online={online}
          onConfirm={() => void completeSession()}
        />
      )}
    </ScrollView>
  );
}

function ConnectionBadge({
  online,
  pendingCount,
  onRetry,
}: {
  online: boolean;
  pendingCount: number;
  onRetry: () => void;
}) {
  if (online && pendingCount === 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {online
          ? `${pendingCount} ${pendingCount === 1 ? "sesión pendiente" : "sesiones pendientes"} de subir`
          : "Sin conexión — trabajando de local"}
      </Text>
      {online && (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.badgeRetry}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

function RestDay({ week, today }: { week: WeekView | null; today: string }) {
  const next = week?.sessions.find((entry) => entry.date > today) ?? null;

  return (
    <View style={styles.restDay}>
      <Text style={styles.title}>Hoy toca descanso</Text>
      <Text style={styles.restMessage}>
        El descanso es parte del plan: el músculo se construye fuera del gimnasio.
      </Text>

      {next && (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Lo que sigue</Text>
          <Text style={styles.nextGroup}>{next.muscleGroup}</Text>
          <View style={styles.nextChips}>
            {next.exercises.slice(0, 6).map((exercise) => (
              <View key={exercise.name} style={styles.nextChip}>
                <Text style={styles.nextChipText}>{exercise.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function SummaryModal({
  open,
  onClose,
  muscleGroup,
  totals,
  online,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  muscleGroup: string;
  totals: { volume: number; sets: number; prs: string[] };
  online: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Sesión terminada</Text>
          <Text style={styles.modalSubtitle}>{muscleGroup}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Volumen</Text>
              <Text style={styles.statValue}>{totals.volume.toLocaleString("es-MX")} kg</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Series</Text>
              <Text style={styles.statValue}>{totals.sets}</Text>
            </View>
          </View>

          {totals.prs.length > 0 && (
            <View style={styles.prSummary}>
              <Text style={styles.prSummaryTitle}>
                {totals.prs.length === 1 ? "¡Récord personal!" : "¡Récords personales!"}
              </Text>
              <Text style={styles.prSummaryText}>{totals.prs.join(" · ")}</Text>
            </View>
          )}

          {!online && (
            <Text style={styles.modalSubtitle}>
              Sin conexión: quedó guardado en el teléfono y se sube solo cuando vuelva la red.
            </Text>
          )}

          <Pressable onPress={onConfirm} style={styles.confirmButton}>
            <Text style={styles.confirmButtonText}>GUARDAR</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>SEGUIR CAPTURANDO</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.obsidiana },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.huge },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.paloRosaLight },
  badgeRetry: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 1.5, color: colors.champan },
  header: { gap: spacing.xs },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.marfil },
  meta: { fontFamily: fonts.sans, fontSize: 13, color: colors.paloRosaLight },
  note: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.paloRosaLight,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  list: { gap: spacing.sm },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  exerciseDot: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseDotDone: { backgroundColor: colors.guinda },
  exerciseDotText: { fontFamily: fonts.display, fontSize: 14, color: colors.marfil },
  exerciseInfo: { flex: 1, gap: 2 },
  exerciseName: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.marfil },
  exerciseMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.paloRosaLight },
  chevron: { fontFamily: fonts.sans, fontSize: 20, color: colors.paloRosaLight },
  finishButton: {
    backgroundColor: colors.guinda,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  finishButtonDisabled: { opacity: 0.5 },
  finishButtonText: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 3, color: colors.marfil },
  restDay: { gap: spacing.lg, alignItems: "flex-start" },
  restMessage: { fontFamily: fonts.serifItalic, fontSize: 16, color: colors.paloRosaLight },
  nextCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nextLabel: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 2, color: colors.paloRosa },
  nextGroup: { fontFamily: fonts.display, fontSize: 16, color: colors.marfil },
  nextChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  nextChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  nextChipText: { fontFamily: fonts.sans, fontSize: 12, color: colors.paloRosaLight },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalSheet: {
    width: "100%",
    backgroundColor: colors.obsidiana,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.marfil },
  modalSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.paloRosaLight },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.cardBg, borderRadius: radius.md, padding: spacing.md },
  statLabel: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 1.5, color: colors.paloRosa },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.marfil, marginTop: 4 },
  prSummary: {
    borderWidth: 1,
    borderColor: colors.champan,
    backgroundColor: "rgba(201,169,97,0.12)",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  prSummaryTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.champan },
  prSummaryText: { fontFamily: fonts.sans, fontSize: 13, color: colors.marfil },
  confirmButton: {
    backgroundColor: colors.guinda,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  confirmButtonText: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 3, color: colors.marfil },
  modalClose: { alignItems: "center", paddingVertical: spacing.sm },
  modalCloseText: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 2, color: colors.paloRosa },
});
