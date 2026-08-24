import type { DayKind, MuscleGroup, TrainingProfile } from "@/lib/training/types";

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
 * Split de la semana según días disponibles y lesiones.
 *
 * Protocolo de lesión (metodología §3): la zona afectada se entrena **una vez
 * por semana**, con reps altas y peso bajo. Los días extra de esa zona se
 * reemplazan por trabajo del resto del cuerpo, que sigue normal.
 */
export function buildSplit(profile: Pick<TrainingProfile, "liftingDays" | "conditions">): {
  kinds: DayKind[];
  /** Índices (dentro de `kinds`) que van con protocolo de rehabilitación. */
  rehabIndexes: number[];
  injury: InjuryState;
} {
  const days = Math.max(0, Math.min(7, Math.trunc(profile.liftingDays)));
  const base = [...(SPLIT_BY_DAYS[days] ?? [])];
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
