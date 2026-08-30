import { DAY_GROUPS, WEEK_DAYS, type WeekDay } from "@/lib/training/split";
import {
  prescribirSesion,
  type NivelDisciplina,
  type ObjetivoAtleta,
  type SesionDisciplina,
} from "@/lib/training/disciplinas";
import type { DayKind, Discipline, DisciplineLoad } from "@/lib/training/types";

/**
 * Cómo conviven las disciplinas en una semana (Fase 7).
 *
 * Es puro: recibe la semana de pesas ya decidida y reparte lo demás. El
 * modelo son cuatro reglas, y las cuatro están escritas aquí salvo la primera,
 * que vive en `split.ts` porque decide cuántos días quedan:
 *
 * 1. **Presupuesto semanal, no lista de deseos** — `liftingDaysWithinBudget`.
 * 2. **Una primaria manda**: la primaria arma el esqueleto y las secundarias
 *    caen en los huecos que deja.
 * 3. **Interferencia por vecindad**: el alto impacto no va la víspera de
 *    pierna; la natación cae bien el día después.
 * 4. **El volumen se ajusta solo**: un día de gimnasio que comparte fecha con
 *    una sesión secundaria pierde un accesorio.
 *
 * Lo que NO hace: inventar sesiones de disciplinas que no sabemos prescribir.
 * Las que tienen prescriptor traen su plan (`lib/training/disciplinas/`); el
 * resto reserva el día y dice para qué es. Cada disciplina entró con su propia
 * investigación —niveles, estructura y riesgos—, que es la razón de haberlas
 * hecho una por una en vez de las siete de golpe.
 */

/** Disciplinas de alto impacto: pisan fuerte y compiten con la pierna. */
const HIGH_IMPACT: Discipline[] = ["BOX", "SQUASH", "CROSSFIT", "FUNCIONAL"];

/** Minutos por defecto de una sesión secundaria, por disciplina. */
const DEFAULT_MINUTES: Record<Discipline, number> = {
  PESAS: 60,
  FUNCIONAL: 45,
  CROSSFIT: 45,
  NATACION: 45,
  BOX: 60,
  SQUASH: 60,
  CARDIO: 30,
  OTRO: 45,
};

export type OtherSession = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  weekday: WeekDay;
  discipline: Discipline;
  minutes: number;
  /**
   * El plan de la sesión, si la disciplina ya tiene prescriptor. `null` en las
   * que solo reservan el día: decirlo es más honesto que inventar un circuito
   * que nadie diseñó para esa disciplina.
   */
  sesion: SesionDisciplina | null;
  /** Por qué cayó en ese día. La regla se dice, no se adivina. */
  note: string;
  /** Comparte día con una sesión de pesas: ese día de gimnasio se recorta. */
  sharesDayWithGym: boolean;
};

export type DisciplinePlan = {
  sessions: OtherSession[];
  /** Fechas de gimnasio que pierden un accesorio por compartir día. */
  crowdedDates: string[];
};

function isLegDay(kind: DayKind): boolean {
  return DAY_GROUPS[kind].includes("PIERNA");
}

function dateOf(weekStart: Date, weekday: WeekDay): string {
  const copy = new Date(weekStart);
  copy.setDate(copy.getDate() + WEEK_DAYS.indexOf(weekday));
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

/**
 * Qué tan bien le cae a una disciplina caer en cierto día.
 *
 * Más alto es mejor. El orden importa más que los números: lo que se está
 * codificando es "primero los huecos, y dentro de los huecos el que menos
 * interfiere", no una métrica fisiológica.
 */
function scoreDay(
  discipline: Discipline,
  weekday: WeekDay,
  gym: Map<WeekDay, DayKind>,
): number {
  const index = WEEK_DAYS.indexOf(weekday);
  const previous = WEEK_DAYS[index - 1];
  const next = WEEK_DAYS[index + 1];

  const kindToday = gym.get(weekday);
  const kindTomorrow = next ? gym.get(next) : undefined;
  const kindYesterday = previous ? gym.get(previous) : undefined;

  // Un hueco siempre vale más que compartir día: el descanso también es parte
  // del plan, pero encimar dos sesiones es peor que ocupar un día libre.
  let score = kindToday ? 0 : 100;

  if (HIGH_IMPACT.includes(discipline)) {
    // Regla 3: nada de alto impacto la víspera de pierna pesada.
    if (kindTomorrow && isLegDay(kindTomorrow)) score -= 60;
    if (kindToday && isLegDay(kindToday)) score -= 30;
  }

  if (discipline === "NATACION") {
    // Bajo impacto y tren superior: cae bien el día después de pierna.
    if (kindYesterday && isLegDay(kindYesterday)) score += 20;
  }

  return score;
}

/**
 * Reparte las sesiones de las disciplinas secundarias en la semana.
 *
 * `gymByDay` es la semana de pesas ya decidida: qué se entrena cada día. Sin
 * ella no se puede aplicar la vecindad, que es la regla que evita el clásico
 * "box el martes, pierna el miércoles" que arruina las dos sesiones.
 */
export function planDisciplines(input: {
  weekStart: Date;
  otherDisciplines: DisciplineLoad[];
  gymByDay: Map<WeekDay, DayKind>;
  /** El nivel declarado de cada disciplina. Lo que falte arranca en principiante. */
  niveles: Partial<Record<Discipline, NivelDisciplina>>;
  /** El objetivo del perfil: modula el volumen, no la técnica. */
  objetivo: ObjetivoAtleta;
  isoWeek: number;
}): DisciplinePlan {
  const { weekStart, otherDisciplines, gymByDay, niveles, objetivo, isoWeek } = input;

  // Las de alto impacto se colocan primero: son las que tienen restricciones
  // duras. Si se colocan al final, se quedan con los días que nadie quiso.
  const queue = otherDisciplines
    .flatMap((load) =>
      Array.from({ length: Math.max(0, Math.min(7, Math.trunc(load.sessionsPerWeek))) }, () => load.discipline),
    )
    .sort((a, b) => Number(HIGH_IMPACT.includes(b)) - Number(HIGH_IMPACT.includes(a)));

  const taken = new Set<WeekDay>();
  const sessions: OtherSession[] = [];
  const cuenta = new Map<Discipline, number>();

  for (const discipline of queue) {
    const candidates = WEEK_DAYS.filter((day) => !taken.has(day)).sort(
      (a, b) =>
        scoreDay(discipline, b, gymByDay) - scoreDay(discipline, a, gymByDay) ||
        WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b),
    );

    const weekday = candidates[0];
    if (!weekday) break; // Más sesiones que días: la semana no da para más.

    taken.add(weekday);
    const sharesDayWithGym = gymByDay.has(weekday);
    const ordinal = (cuenta.get(discipline) ?? 0) + 1;
    cuenta.set(discipline, ordinal);

    sessions.push({
      date: dateOf(weekStart, weekday),
      weekday,
      discipline,
      minutes: DEFAULT_MINUTES[discipline],
      sesion: prescribirSesion({
        discipline,
        nivel: niveles[discipline] ?? "PRINCIPIANTE",
        isoWeek,
        ordinal,
        minutes: DEFAULT_MINUTES[discipline],
        objetivo,
      }),
      note: noteFor(discipline, weekday, gymByDay, sharesDayWithGym),
      sharesDayWithGym,
    });
  }

  const ordered = sessions.sort((a, b) => a.date.localeCompare(b.date));

  return {
    sessions: ordered,
    crowdedDates: ordered.filter((session) => session.sharesDayWithGym).map((session) => session.date),
  };
}

function noteFor(
  discipline: Discipline,
  weekday: WeekDay,
  gym: Map<WeekDay, DayKind>,
  sharesDayWithGym: boolean,
): string {
  if (sharesDayWithGym) {
    return "Comparte día con el gimnasio: esa sesión de pesas va con un ejercicio menos.";
  }

  const previous = WEEK_DAYS[WEEK_DAYS.indexOf(weekday) - 1];
  const kindYesterday = previous ? gym.get(previous) : undefined;

  if (discipline === "NATACION" && kindYesterday && isLegDay(kindYesterday)) {
    return "Va después de pierna: bajo impacto y tren superior, ayuda a soltar.";
  }
  if (discipline === "CROSSFIT") {
    return "Ocupa el lugar de un día de gimnasio, no se suma: un metcon con sentadilla es un día de pierna con otro nombre.";
  }
  if (HIGH_IMPACT.includes(discipline)) {
    return "Colocada lejos de la víspera de pierna, que es donde más estorba.";
  }
  return "Cae en un día libre de pesas.";
}

export type { NivelDisciplina, SesionDisciplina };
