import type { PlannedExercise, TargetSet, Tempo } from "@/lib/training/types";

/**
 * Cuánto dura de verdad una sesión.
 *
 * EL PROBLEMA: la duración nunca se estimó. `exerciseCountFor` traduce
 * minutos → número de ejercicios con una tabla ("45 min ⇒ 5, 60+ ⇒ 6-8"), y
 * esa tabla no sabe nada del esquema del día: seis ejercicios de 5×6 con un
 * minuto de descanso no duran lo mismo que seis de 9×20. El resultado es el
 * que reportaron Mau e Irma — sesiones de hora y media a dos horas con un
 * perfil de 60 minutos.
 *
 * Aquí la cuenta es explícita y por serie: repeticiones × segundos de
 * ejecución + descanso, más un minuto y medio de transición por ejercicio
 * (llegar a la máquina, ajustarla, cargar los discos). No pretende ser exacta
 * —nadie cronometra el gimnasio— pero es honesta en el orden de magnitud, que
 * es lo que hace falta para no prometer 60 minutos y entregar 110.
 */

/**
 * Segundos por repetición cuando el ejercicio no declara tempo.
 *
 * Tres segundos es lo que sale de contar una repetición controlada completa
 * (bajar, pausa mínima, subir) y es el valor que usan las calculadoras de
 * "time under tension" como default. Con `tempo` declarado manda el tempo.
 */
export const SEGUNDOS_POR_REP = 3;

/**
 * Transición entre ejercicios: caminar a la máquina, ajustar el asiento,
 * cargar los discos, esperar a que se desocupe. Minuto y medio es
 * conservador para un gimnasio con gente.
 */
export const SEGUNDOS_DE_TRANSICION = 90;

export function segundosPorRep(tempo?: Tempo): number {
  if (!tempo) return SEGUNDOS_POR_REP;
  const total = tempo.ecc + tempo.pause + tempo.con;
  return total > 0 ? total : SEGUNDOS_POR_REP;
}

/** Segundos de pura ejecución de una serie. */
export function segundosDeSerie(set: TargetSet): number {
  return Math.max(0, set.reps) * segundosPorRep(set.tempo);
}

/**
 * Minutos que se lleva un ejercicio: ejecución + descansos + la transición.
 *
 * El descanso se cobra en TODAS las series, incluida la última: así lo hace
 * la sesión en vivo desde que se corrigió el supuesto de que el traslado a la
 * otra máquina ya era descanso suficiente (ver `cerrarSerie` en
 * `apps/mobile/src/lib/sesion-viva.ts`). Un dropset no descansa — esa es su
 * definición — y por eso no suma descanso.
 */
export function minutosDeEjercicio(sets: TargetSet[], restSeconds: number): number {
  const segundos = sets.reduce((total, set) => {
    const descanso = set.intensity === "dropset" ? 0 : Math.max(0, restSeconds);
    return total + segundosDeSerie(set) + descanso;
  }, 0);

  return (segundos + SEGUNDOS_DE_TRANSICION) / 60;
}

/**
 * Minutos de la sesión completa: el calentamiento dinámico previo (6-8 min)
 * cuenta. Es tiempo dentro del gimnasio, y esconderlo era parte de por qué la
 * cuenta no cuadraba.
 */
export function minutosDeSesion(
  exercises: Array<Pick<PlannedExercise, "estimatedMin">>,
  warmupSeg: number,
): number {
  const suma = exercises.reduce((total, exercise) => total + (exercise.estimatedMin ?? 0), 0);
  return redondeaMinutos(suma + Math.max(0, warmupSeg) / 60);
}

/** Los minutos se enseñan enteros: "≈ 58 min", no "57.83". */
export function redondeaMinutos(valor: number): number {
  return Math.round(valor);
}

/**
 * Suelta lo de prioridad más baja hasta que quepa.
 *
 * Es LA regla de recorte de la app, en un solo lugar: cuando falta tiempo se
 * cae primero el accesorio (prioridad 4) y nunca el básico (prioridad 1); a
 * igualdad de prioridad se suelta lo que va más tarde en la sesión, porque el
 * orden de la receta ya es el orden en que importa. La usan tanto la
 * selección de huecos del generador como el recorte por minutos, y "Hoy tengo
 * menos tiempo" (`trim.ts`) la hereda al volver a correr el generador con
 * otros minutos.
 *
 * `minimo` es el piso de elementos: una sesión de dos ejercicios no es una
 * sesión recortada, es no haber entrenado.
 */
export function recortarPorPrioridad<T>(
  items: T[],
  prioridad: (item: T) => number,
  cabe: (candidatos: T[]) => boolean,
  minimo = 0,
): T[] {
  const conIndice = items.map((item, index) => ({ item, index }));
  let quedan = conIndice;

  while (!cabe(quedan.map((entrada) => entrada.item)) && quedan.length > minimo) {
    // El peor: la prioridad más alta (4 = accesorio) y, en empate, el que va
    // más tarde en la sesión.
    const peor = quedan.reduce((worst, entrada) =>
      prioridad(entrada.item) > prioridad(worst.item) ||
      (prioridad(entrada.item) === prioridad(worst.item) && entrada.index > worst.index)
        ? entrada
        : worst,
    );
    quedan = quedan.filter((entrada) => entrada !== peor);
  }

  return quedan.sort((a, b) => a.index - b.index).map((entrada) => entrada.item);
}
