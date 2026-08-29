import type { DayKind, DisciplineLoad, MuscleGroup, TrainingProfile } from "@/lib/training/types";

/**
 * El split del coach (metodología §3): pierna/glúteo 2-3×, hombro+trapecio 1×,
 * pecho+espalda 1×, bíceps+tríceps 1×. Cuando hay menos días se comprime hacia
 * arriba — nunca se pausa, se adapta.
 */
const SPLIT_BY_DAYS: Record<number, DayKind[]> = {
  0: [],
  1: ["PIERNA_CUADRICEPS"],
  2: ["PIERNA_CUADRICEPS", "TORSO"],
  3: ["PIERNA_CUADRICEPS", "TORSO", "PIERNA_FEMORAL"],
  4: ["PIERNA_CUADRICEPS", "PECHO_ESPALDA", "PIERNA_FEMORAL", "HOMBRO_BRAZO"],
  5: ["PIERNA_CUADRICEPS", "HOMBRO", "PECHO_ESPALDA", "PIERNA_FEMORAL", "BRAZO"],
  6: ["PIERNA_CUADRICEPS", "HOMBRO", "PECHO_ESPALDA", "PIERNA_FEMORAL", "BRAZO", "PIERNA_GLUTEO"],
  7: [
    "PIERNA_CUADRICEPS",
    "HOMBRO",
    "PECHO_ESPALDA",
    "PIERNA_FEMORAL",
    "BRAZO",
    "PIERNA_GLUTEO",
    "PECHO_ESPALDA",
  ],
};

export const DAY_LABELS: Record<DayKind, string> = {
  PIERNA_CUADRICEPS: "Pierna · cuádriceps",
  PIERNA_FEMORAL: "Pierna · femoral y glúteo",
  PIERNA_GLUTEO: "Glúteo",
  HOMBRO: "Hombro y trapecio",
  PECHO_ESPALDA: "Pecho y espalda",
  BRAZO: "Bíceps y tríceps",
  HOMBRO_BRAZO: "Hombro y brazo",
  TORSO: "Torso completo",
};

/** Grupos que toca cada tipo de día. Sirve para el protocolo de lesión. */
export const DAY_GROUPS: Record<DayKind, MuscleGroup[]> = {
  PIERNA_CUADRICEPS: ["PIERNA"],
  PIERNA_FEMORAL: ["PIERNA"],
  PIERNA_GLUTEO: ["PIERNA"],
  HOMBRO: ["HOMBRO", "ABDOMEN"],
  PECHO_ESPALDA: ["PECHO", "ESPALDA"],
  BRAZO: ["BICEP", "TRICEP"],
  HOMBRO_BRAZO: ["HOMBRO", "BICEP", "TRICEP"],
  TORSO: ["PECHO", "ESPALDA", "HOMBRO"],
};

/** Días de la semana en el orden del calendario, empezando en lunes. */
export const WEEK_DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/**
 * Lesión activa declarada en el perfil.
 *
 * `conditions` admite etiquetas libres: `lesion_activa` (sin zona) o
 * `lesion_<zona>` (`lesion_rodilla`, `lesion_hombro`, ...). Sin zona sabemos que
 * hay lesión pero no dónde: se suspende el impacto y no se toca el split.
 */
export type InjuryState = { active: boolean; zones: MuscleGroup[] };

const ZONE_ALIASES: Record<string, MuscleGroup> = {
  pierna: "PIERNA",
  rodilla: "PIERNA",
  tobillo: "PIERNA",
  cadera: "PIERNA",
  gluteo: "PIERNA",
  femoral: "PIERNA",
  hombro: "HOMBRO",
  manguito: "HOMBRO",
  pecho: "PECHO",
  espalda: "ESPALDA",
  lumbar: "ESPALDA",
  dorsal: "ESPALDA",
  codo: "BICEP",
  biceps: "BICEP",
  muneca: "TRICEP",
  triceps: "TRICEP",
  abdomen: "ABDOMEN",
};

export function parseInjuries(conditions: string[]): InjuryState {
  let active = false;
  const zones: MuscleGroup[] = [];

  for (const raw of conditions) {
    const tag = raw.trim().toLowerCase();
    if (!tag.startsWith("lesion")) continue;
    active = true;

    const suffix = tag.replace(/^lesion[_:-]?/, "");
    if (!suffix || suffix === "activa") continue;

    const zone = ZONE_ALIASES[suffix];
    if (zone && !zones.includes(zone)) zones.push(zone);
  }

  return { active, zones };
}

/** Kinds de reemplazo cuando hay que sacar días de la zona lesionada. */
const FALLBACK_ORDER: DayKind[] = ["PECHO_ESPALDA", "HOMBRO", "BRAZO", "TORSO"];

function touchesInjuredZone(kind: DayKind, zones: MuscleGroup[]): boolean {
  return DAY_GROUPS[kind].some((group) => zones.includes(group));
}

/**
 * Cuántas sesiones de la semana se van en otras disciplinas.
 *
 * Una disciplina declarada sin sesiones no gasta nada: está activa para el
 * registro, no para la planeación.
 */
export function sessionsSpentOutsideGym(otherDisciplines: DisciplineLoad[]): number {
  return otherDisciplines.reduce(
    (total, load) => total + Math.max(0, Math.trunc(load.sessionsPerWeek)),
    0,
  );
}

/**
 * Días de pesas que quedan después de pagar las otras disciplinas.
 *
 * La regla del modelo: **el presupuesto semanal no se estira**. Agregar
 * natación dos veces por semana no suma dos sesiones encima de las que ya
 * había — se las quita al gimnasio. Un cuerpo que recupera de cinco sesiones
 * no recupera de siete porque el calendario tenga huecos.
 *
 * El piso es 1 mientras las pesas sean la primaria: la disciplina que arma el
 * esqueleto nunca se queda sin semana. Si mañana la primaria es otra, este
 * piso desaparece y el gimnasio pasa a caer en los huecos.
 */
export function liftingDaysWithinBudget(
  profile: Pick<TrainingProfile, "liftingDays" | "primaryDiscipline" | "otherDisciplines">,
): number {
  const budget = Math.max(0, Math.min(7, Math.trunc(profile.liftingDays)));
  if (budget === 0) return 0;

  const spent = sessionsSpentOutsideGym(profile.otherDisciplines);
  const floor = profile.primaryDiscipline === "PESAS" ? 1 : 0;

  return Math.max(floor, budget - spent);
}

/**
 * Deja una sola aparición de los grupos que la persona pidió no repetir.
 *
 * Es la misma sustitución del protocolo de lesión, por otra razón: quien pide
 * no repetir pierna no quiere que el resto de la semana se encoja, quiere que
 * esos días entrenen otra cosa.
 */
function collapseRepeats(kinds: DayKind[], groups: MuscleGroup[]): DayKind[] {
  if (groups.length === 0) return kinds;

  const result: DayKind[] = [];
  const used = new Set<MuscleGroup>();

  /** Marca como vistos los grupos restringidos que toca este día. */
  function remember(kind: DayKind): void {
    for (const group of DAY_GROUPS[kind]) {
      if (groups.includes(group)) used.add(group);
    }
  }

  kinds.forEach((kind, position) => {
    const repeats = DAY_GROUPS[kind].some((group) => groups.includes(group) && used.has(group));

    if (!repeats) {
      remember(kind);
      result.push(kind);
      return;
    }

    const planned = new Set<DayKind>([...result, ...kinds.slice(position + 1)]);
    const usable = FALLBACK_ORDER.filter(
      (candidate) => !DAY_GROUPS[candidate].some((group) => used.has(group) && groups.includes(group)),
    );
    const replacement = usable.find((candidate) => !planned.has(candidate)) ?? usable[0];

    if (replacement) {
      remember(replacement);
      result.push(replacement);
    }
  });

  return result;
}

/**
 * Split de la semana según días disponibles, lesiones y lo que se pidió no
 * repetir.
 *
 * Protocolo de lesión (metodología §3): la zona afectada se entrena **una vez
 * por semana**, con reps altas y peso bajo. Los días extra de esa zona se
 * reemplazan por trabajo del resto del cuerpo, que sigue normal.
 */
export function buildSplit(
  profile: Pick<TrainingProfile, "liftingDays" | "conditions"> &
    Partial<Pick<TrainingProfile, "avoidRepeatGroups">>,
): {
  kinds: DayKind[];
  /** Índices (dentro de `kinds`) que van con protocolo de rehabilitación. */
  rehabIndexes: number[];
  injury: InjuryState;
} {
  const days = Math.max(0, Math.min(7, Math.trunc(profile.liftingDays)));
  const avoidRepeat = profile.avoidRepeatGroups ?? [];
  const base = collapseRepeats([...(SPLIT_BY_DAYS[days] ?? [])], avoidRepeat);
  const injury = parseInjuries(profile.conditions);

  if (injury.zones.length === 0) {
    return { kinds: base, rehabIndexes: [], injury };
  }

  const kinds: DayKind[] = [];
  const rehabIndexes: number[] = [];
  let injuredDaysUsed = 0;

  base.forEach((kind, position) => {
    if (!touchesInjuredZone(kind, injury.zones)) {
      kinds.push(kind);
      return;
    }

    if (injuredDaysUsed === 0) {
      injuredDaysUsed += 1;
      rehabIndexes.push(kinds.length);
      kinds.push(kind);
      return;
    }

    // Ya hubo el único día de la zona: este se reemplaza por trabajo del resto
    // del cuerpo, buscando un tipo de día que no esté ya en la semana.
    const planned = new Set<DayKind>([...kinds, ...base.slice(position + 1)]);
    const usable = FALLBACK_ORDER.filter((candidate) => !touchesInjuredZone(candidate, injury.zones));
    const replacement = usable.find((candidate) => !planned.has(candidate)) ?? usable[0];

    if (replacement) kinds.push(replacement);
  });

  return { kinds, rehabIndexes, injury };
}

/**
 * Qué días del calendario toca entrenar.
 *
 * Con `trainingSchedule` manda el horario declarado: los días marcados como
 * DESCANSO no reciben sesión. Sin él se reparten los días de pesas de lunes en
 * adelante, dejando el domingo (el del check-in) libre.
 */
export function trainingDaysOf(
  profile: Pick<TrainingProfile, "liftingDays" | "trainingSchedule">,
): WeekDay[] {
  const schedule = profile.trainingSchedule;

  if (schedule) {
    const scheduled = WEEK_DAYS.filter((day) => {
      const slot = schedule[day];
      return typeof slot === "string" && slot !== "DESCANSO";
    });
    if (scheduled.length > 0) return scheduled;
  }

  const days = Math.max(0, Math.min(7, Math.trunc(profile.liftingDays)));
  return WEEK_DAYS.slice(0, days);
}
