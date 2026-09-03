import { intensityForReps, roundWeight } from "@/lib/training/progression";
import type {
  ExerciseOption,
  SchemeId,
  SchemePreference,
  TargetSet,
  Tempo,
  UnilateralMode,
} from "@/lib/training/types";

/**
 * Lo que el esquema no sabe decir: tempo, fallo, dropset y lados.
 *
 * `Scheme` describe reps y descanso, y con eso alcanzaba mientras la
 * prescripción fuera "3 series de 12". El coach de Irma no prescribe así: dice
 * a qué tempo se baja, cuál serie va al fallo y que la búlgara son tres del
 * derecho y tres del izquierdo. Esa capa vive aquí, encima de
 * `buildTargetSets` (`progression.ts`, que no se toca: la progresión doble
 * sigue siendo suya).
 */

/**
 * Tempo de referencia del coach: 3 segundos bajando, 1 de pausa, 1 subiendo.
 *
 * El control de la excéntrica es lo que separa una serie de 12 hecha de una
 * de 12 aventada, y además es la mitad de la cuenta de minutos (ver
 * `duracion.ts`): la misma serie a 3-1-1 dura casi el doble.
 */
export const TEMPO_COACH: Tempo = { ecc: 3, pause: 1, con: 1 };

/** Se escribe "3-1-1", que es como se dice en el gimnasio. */
export function formatoTempo(tempo: Tempo): string {
  return `${tempo.ecc}-${tempo.pause}-${tempo.con}`;
}

/** El dropset se hace con ~20 % menos peso, pegado a la serie anterior. */
export const FACTOR_DROPSET = 0.8;

/**
 * Ejercicios que se hacen un lado a la vez.
 *
 * NO es columna de la base: `exercises` no tiene `unilateral` y el schema está
 * congelado en esta fase, así que sale del catálogo por nombre y rol. Es una
 * heurística, sí, pero sobre un catálogo cerrado de 106 ejercicios que se
 * revisa a mano — y equivocarse aquí cuesta una etiqueta de lado en la
 * pantalla, no una lesión. Cuando el schema se pueda tocar, esto se vuelve una
 * columna y esta función se queda solo como semilla del backfill.
 */
const NOMBRES_UNILATERALES = [
  "búlgara",
  "bulgara",
  "concentrado",
  "una pierna",
  "una mano",
  "un brazo",
  "remo con mancuerna",
  "patada",
  "desplante",
  "zancada",
  "elevación lateral en polea",
  "elevacion lateral en polea",
];

export function esUnilateral(exercise: Pick<ExerciseOption, "name" | "poolRole">): boolean {
  if (exercise.poolRole === "unilateral") return true;
  const nombre = exercise.name.toLowerCase();
  return NOMBRES_UNILATERALES.some((pista) => nombre.includes(pista));
}

/**
 * Los pesos del piramidal de peso, derivados de la tabla de intensidad
 * relativa por repeticiones.
 *
 * La rampa lineal de `buildTargetSets` (65 % → 100 %) es una aproximación que
 * no depende de las reps: en 15-12-10-8 diría que la primera serie va al 65 %
 * del peso de 8, y la tabla de Brzycki dice ~81 %. Cuatro discos de
 * diferencia en la serie con la que se arranca no es un detalle de redondeo.
 *
 * El ancla es la serie más pesada (la de menos reps), que es la que trae el
 * peso de trabajo sugerido por la progresión.
 */
export function pesosPorIntensidad(sets: TargetSet[], topWeightKg: number | null): TargetSet[] {
  if (topWeightKg === null) return sets;

  const efectivas = sets.filter((set) => !set.warmup);
  if (efectivas.length === 0) return sets;

  const repsTope = Math.min(...efectivas.map((set) => set.reps));
  const intensidadTope = intensityForReps(repsTope);

  return sets.map((set) => {
    if (set.warmup) return set;
    const factor = intensityForReps(set.reps) / intensidadTope;
    return { ...set, weightKg: roundWeight(topWeightKg * factor) };
  });
}

/**
 * Reparte las series por lado.
 *
 * `SEGUIDO` (default) hace todas las del derecho y luego todas las del
 * izquierdo — es como se entrena una búlgara sin montar y desmontar el banco
 * seis veces. `ALTERNADO` va cambiando serie a serie, que descansa más cada
 * pierna a costa de más transiciones.
 *
 * El número de series se DUPLICA, y eso es correcto: una sesión con
 * unilaterales dura más, y esconderlo era parte de por qué la cuenta de
 * minutos no cuadraba. El recorte por minutos ya sabe qué hacer con eso.
 */
export function seriesPorLado(sets: TargetSet[], modo: UnilateralMode): TargetSet[] {
  const derecho = sets.map((set): TargetSet => ({ ...set, side: "DER" }));
  const izquierdo = sets.map((set): TargetSet => ({ ...set, side: "IZQ" }));

  if (modo === "SEGUIDO") return [...derecho, ...izquierdo];

  return derecho.flatMap((set, index) => [set, izquierdo[index]!]);
}

/**
 * La capa del coach sobre las series que ya armó la progresión.
 *
 * Se aplica en este orden y por una razón: primero los pesos (que dependen
 * solo de las reps), luego el tempo y el fallo (que dependen del papel del
 * ejercicio en la sesión) y al final los lados, que duplican la lista — así el
 * fallo cae en la última serie de CADA lado, que es donde va.
 */
export function aplicaEsquemaDeCoach(
  sets: TargetSet[],
  opciones: {
    scheme: SchemeId;
    preference: SchemePreference;
    topWeightKg: number | null;
    /** Accesorio: prioridad 3 o 4 de la receta. Es donde va el fallo. */
    accesorio: boolean;
    unilateral: boolean;
    unilateralMode: UnilateralMode;
  },
): TargetSet[] {
  let resultado = sets;

  if (opciones.scheme === "PIRAMIDAL_PESO") {
    resultado = pesosPorIntensidad(resultado, opciones.topWeightKg);
  }

  if (opciones.preference === "COACH") {
    const ultimaEfectiva = resultado.reduce(
      (indice, set, posicion) => (set.warmup ? indice : posicion),
      -1,
    );

    resultado = resultado.map((set, posicion) => {
      if (set.warmup) return set;
      // El tempo va en todas las efectivas; el fallo SOLO en la última del
      // accesorio. Llevar un básico pesado al fallo cada semana es como se
      // acumula la fatiga que después no deja entrenar.
      const conTempo: TargetSet = { ...set, tempo: TEMPO_COACH };
      return opciones.accesorio && posicion === ultimaEfectiva
        ? { ...conTempo, intensity: "fallo" }
        : conTempo;
    });
  }

  if (opciones.unilateral) {
    resultado = seriesPorLado(resultado, opciones.unilateralMode);
  }

  return resultado;
}
