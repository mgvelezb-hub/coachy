import { shiftISODate } from "@/lib/format";

/**
 * Planeado contra real: lo que el plan pidió y lo que de verdad salió.
 *
 * EL PROBLEMA: el historial decía "5 series · 4,200 kg" y ahí terminaba. Con
 * eso no se puede contestar la única pregunta que importa después de una
 * sesión —"¿cumplí lo que decía el plan?"— ni ver si la caída fue en la última
 * serie de todo o justo en el ejercicio que se está peleando. Los datos ya
 * estaban en `WorkoutSet` (`targetReps` junto a `reps`): lo que faltaba era
 * ponerlos uno al lado del otro.
 *
 * Todo aquí es puro: recibe filas y devuelve filas. La lectura de la base vive
 * en `db.ts` y la pantalla en la app.
 */

/** Una serie del historial, con su objetivo al lado. */
export type SerieComparada = {
  exerciseName: string;
  setIndex: number;
  /** Reps que pedía el plan. */
  targetReps: number;
  /** Kilos que sugería el plan. `null` si el plan iba en blanco. */
  targetWeightKg: number | null;
  reps: number;
  weightKg: number | null;
  rpe: number | null;
  warmup: boolean;
  /** `IZQ` / `DER` en unilaterales, tal como lo pidió el plan. */
  side: string | null;
  /** `fallo` / `dropset` si el plan lo prescribió. */
  intensity: string | null;
};

/**
 * "Serie 2 · plan 12 × 40 kg · real 10 × 40 kg".
 *
 * Una línea por serie y en ese orden: primero dónde va, luego qué se pidió,
 * luego qué pasó. Sin peso planeado se dice "sin peso" en vez de un cero, que
 * mentiría — el plan iba en blanco a propósito, esperando el número de ella.
 */
export function lineaDeSerie(serie: SerieComparada): string {
  const plan = `plan ${serie.targetReps} × ${pesoTexto(serie.targetWeightKg)}`;
  const real = `real ${serie.reps} × ${pesoTexto(serie.weightKg)}`;
  return `Serie ${serie.setIndex + 1} · ${plan} · ${real}`;
}

function pesoTexto(kg: number | null): string {
  return kg === null ? "sin peso" : `${kg} kg`;
}

/** ¿La serie cumplió lo que pedía el plan? El calentamiento no se juzga. */
export function cumplio(serie: SerieComparada): boolean {
  return serie.warmup || serie.reps >= serie.targetReps;
}

/** Una semana de un ejercicio: el tope que se levantó y el volumen que se hizo. */
export type SemanaDeEjercicio = {
  /** Lunes ISO de la semana, `YYYY-MM-DD`. */
  weekStart: string;
  /** El peso más alto de una serie efectiva esa semana. */
  topWeightKg: number;
  /** Σ peso × reps de las series efectivas. */
  volumeKg: number;
  sets: number;
};

/** Lunes de la semana de una fecha ISO, sin tocar `Date` ni la zona horaria. */
export function lunesDe(fechaISO: string): string {
  const [year, month, day] = fechaISO.split("-").map(Number);
  // `Date.UTC` y no el constructor local: la semana de una fecha no puede
  // depender de en qué zona corra el servidor (en Vercel, UTC).
  const dow = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() || 7;
  return shiftISODate(fechaISO, -(dow - 1));
}

/**
 * La tendencia semanal de un ejercicio: peso tope y volumen, semana a semana.
 *
 * Por SEMANA y no por sesión porque la pregunta real es si se está subiendo, y
 * una sesión suelta con mal día no contesta eso — el ruido de un día ahoga la
 * señal del mes. Las series de calentamiento y las que se quedaron sin peso no
 * cuentan: no son trabajo y sumarlas infla el número justo cuando se compara.
 */
export function tendenciaSemanal(
  sets: Array<{ date: string; reps: number; weightKg: number | null; warmup: boolean }>,
): SemanaDeEjercicio[] {
  const porSemana = new Map<string, SemanaDeEjercicio>();

  for (const set of sets) {
    if (set.warmup || set.weightKg === null || set.weightKg <= 0 || set.reps <= 0) continue;

    const weekStart = lunesDe(set.date);
    const semana = porSemana.get(weekStart) ?? { weekStart, topWeightKg: 0, volumeKg: 0, sets: 0 };

    semana.topWeightKg = Math.max(semana.topWeightKg, set.weightKg);
    semana.volumeKg += set.weightKg * set.reps;
    semana.sets += 1;
    porSemana.set(weekStart, semana);
  }

  return [...porSemana.values()]
    .map((semana) => ({ ...semana, volumeKg: Math.round(semana.volumeKg) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
