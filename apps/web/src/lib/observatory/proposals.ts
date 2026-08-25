/**
 * Propuestas de mejora (Fase 3).
 *
 * Lista determinista, sin IA. No son decisiones ni se aplican solas: son cosas
 * que se pueden ver contando, y que el admin decide si vale la pena atender.
 *
 * Módulo puro.
 */

export type ProposalId =
  | "EJERCICIO_SIN_PROGRESION"
  | "VISTA_DE_FOTO_FALTANTE"
  | "HIDRATACION_MENCIONADA";

export interface Proposal {
  id: ProposalId;
  /** Distingue dos propuestas del mismo tipo (un ejercicio, una vista). */
  key: string;
  title: string;
  detail: string;
}

/** Sesiones consecutivas con el mismo peso tope antes de proponer un cambio. */
export const SESSIONS_WITHOUT_PROGRESSION = 3;
/** De cuántos check-ins recientes se mira la vista faltante. */
export const PHOTO_WINDOW = 4;
/** Cuántas veces debe faltar una vista en esa ventana para proponerlo. */
export const PHOTO_MISSES_TO_FLAG = 3;

export interface ExerciseSessionTop {
  exerciseName: string;
  /** ISO de la sesión. */
  date: string;
  /** Peso tope de la serie efectiva (sin calentamiento). */
  topWeightKg: number;
}

export interface PhotoWeek {
  date: string;
  views: string[];
}

export interface ProposalInput {
  /** Series tope por ejercicio y sesión, en cualquier orden. */
  tops: ExerciseSessionTop[];
  /** Check-ins recientes con las vistas de foto que sí llegaron. */
  photoWeeks: PhotoWeek[];
  /** Comentarios recientes del check-in, del más nuevo al más viejo. */
  comments: Array<{ date: string; text: string }>;
}

const ALL_VIEWS = ["FRENTE", "PERFIL", "ESPALDA"] as const;
const VIEW_LABELS: Record<string, string> = {
  FRENTE: "frente",
  PERFIL: "perfil",
  ESPALDA: "espalda",
};

/**
 * Menciones de agua o hidratación en el comentario. Sin acentos ni mayúsculas
 * y con límites de palabra donde importa, para no cazar "aguantar".
 */
const WATER_PATTERNS = [
  /\bagua\b/,
  /hidrat/,
  /deshidrat/,
  /\bsed\b/,
  /\bliquidos?\b/,
  /electrolit/,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Ejercicios cuyo peso tope no sube en las últimas N sesiones registradas. */
export function stalledExercises(tops: ExerciseSessionTop[]): Proposal[] {
  const byExercise = new Map<string, ExerciseSessionTop[]>();
  for (const top of tops) {
    if (!Number.isFinite(top.topWeightKg)) continue;
    const list = byExercise.get(top.exerciseName) ?? [];
    list.push(top);
    byExercise.set(top.exerciseName, list);
  }

  const proposals: Proposal[] = [];

  for (const [name, sessions] of byExercise) {
    const ordered = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
    const window = ordered.slice(-SESSIONS_WITHOUT_PROGRESSION);
    if (window.length < SESSIONS_WITHOUT_PROGRESSION) continue;

    const best = window[0]!.topWeightKg;
    const progressed = window.some((session) => session.topWeightKg > best);
    if (progressed) continue;

    proposals.push({
      id: "EJERCICIO_SIN_PROGRESION",
      key: name,
      title: `${name}: sin subir carga en ${window.length} sesiones`,
      detail: `Lleva ${window.length} sesiones en ${best} kg o menos. Vale revisar si el esquema le queda corto, si hay que cambiar el ejercicio o si el peso está mal registrado.`,
    });
  }

  return proposals.sort((a, b) => a.key.localeCompare(b.key));
}

/** Vistas de foto que faltan una y otra vez. */
export function missingPhotoViews(weeks: PhotoWeek[]): Proposal[] {
  const window = weeks
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-PHOTO_WINDOW);

  if (window.length < PHOTO_MISSES_TO_FLAG) return [];

  const proposals: Proposal[] = [];

  for (const view of ALL_VIEWS) {
    const misses = window.filter((week) => !week.views.includes(view)).length;
    if (misses < PHOTO_MISSES_TO_FLAG) continue;

    proposals.push({
      id: "VISTA_DE_FOTO_FALTANTE",
      key: view,
      title: `Falta la foto de ${VIEW_LABELS[view] ?? view.toLowerCase()} casi siempre`,
      detail: `No llegó en ${misses} de los últimos ${window.length} check-ins. Sin esa vista la comparación por zonas queda coja; quizá el encuadre es incómodo de tomar sola.`,
    });
  }

  return proposals;
}

/** Agua e hidratación: solo si ella la mencionó. Nada de recordatorios genéricos. */
export function hydrationMentions(
  comments: Array<{ date: string; text: string }>,
): Proposal[] {
  const hits = comments.filter((comment) => {
    const text = normalize(comment.text ?? "");
    return WATER_PATTERNS.some((pattern) => pattern.test(text));
  });

  if (hits.length === 0) return [];

  const latest = hits
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)!;

  return [
    {
      id: "HIDRATACION_MENCIONADA",
      key: "agua",
      title: "Mencionó el agua en su comentario",
      detail: `Lo escribió el ${latest.date}${hits.length > 1 ? ` (y en ${hits.length - 1} check-in más)` : ""}. Es un tema que ella abrió: vale la pena que Holy Gains lo retome en el mensaje de la semana.`,
    },
  ];
}

export function buildProposals(input: ProposalInput): Proposal[] {
  return [
    ...stalledExercises(input.tops),
    ...missingPhotoViews(input.photoWeeks),
    ...hydrationMentions(input.comments),
  ];
}
