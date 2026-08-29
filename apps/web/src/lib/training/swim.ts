/**
 * Prescripción de natación (Fase 7) — la primera disciplina fuera de las pesas.
 *
 * Es puro y determinista, como el generador de pesas: misma semana, mismo
 * nivel, misma sesión. Nada aquí lee el reloj.
 *
 * Dos decisiones que conviene no re-litigar:
 *
 * - **El volumen se prescribe en metros, no en tiempos.** Un tiempo objetivo
 *   ("100 m en 1:45") solo significa algo contra la marca de quien nada, y de
 *   eso no hay dato todavía. El esfuerzo va como sensación —suave, firme,
 *   fuerte—, que es lo que un entrenador dice en la orilla.
 * - **La técnica no es opcional.** En natación la mejora viene más de la
 *   técnica que del volumen, así que todas las sesiones traen su bloque de
 *   ejercicios de técnica, incluso las de resistencia.
 *
 * Esto no reemplaza a un entrenador de natación en el agua: prescribe volumen
 * y estructura, no corrige un brazo que entra cruzado.
 */

import type { SwimLevel } from "@/lib/training/types";

export type { SwimLevel };

export type SwimBlock = {
  /** "Calentamiento", "Técnica", "Principal", "Vuelta a la calma". */
  title: string;
  /** Cómo se lee la serie: "4 × 50 m". */
  detail: string;
  /** Metros totales del bloque. */
  meters: number;
  /** Descanso entre repeticiones, en segundos. `null` = continuo. */
  restSeconds: number | null;
  /** Qué se busca, en una línea. */
  note: string;
};

export type SwimPlan = {
  level: SwimLevel;
  /** "Resistencia" o "Velocidad y técnica". */
  focus: string;
  totalMeters: number;
  minutes: number;
  blocks: SwimBlock[];
  /** Semana de descarga del ciclo de cuatro. */
  deload: boolean;
  notes: string[];
};

/** Volumen base por nivel, en metros de sesión completa. */
const BASE_METERS: Record<SwimLevel, number> = {
  PRINCIPIANTE: 600,
  INTERMEDIO: 1400,
  AVANZADO: 2200,
};

/** Descanso entre repeticiones por nivel: quien empieza necesita más. */
const REST_SECONDS: Record<SwimLevel, number> = {
  PRINCIPIANTE: 45,
  INTERMEDIO: 30,
  AVANZADO: 20,
};

/**
 * Ciclo de cuatro semanas: tres de progresión y una de descarga.
 *
 * El mismo principio del glidepath — el escalón sale de donde estás, no de
 * donde deberías estar—: la descarga existe para poder sostener el ciclo
 * siguiente, no como premio.
 */
function volumeFactor(isoWeek: number): { factor: number; deload: boolean } {
  const position = isoWeek % 4;
  if (position === 0) return { factor: 0.8, deload: true };
  return { factor: 1 + 0.05 * (position - 1), deload: false };
}

/** Redondea a múltiplos de 25 m: nadie nada 137 metros. */
function toPoolUnits(meters: number): number {
  return Math.max(25, Math.round(meters / 25) * 25);
}

function principianteBlocks(total: number, rest: number): SwimBlock[] {
  const drill = toPoolUnits(total * 0.35);
  const main = toPoolUnits(total * 0.4);

  return [
    {
      title: "Calentamiento",
      detail: `${toPoolUnits(total * 0.15)} m suaves, parando en cada orilla`,
      meters: toPoolUnits(total * 0.15),
      restSeconds: null,
      note: "Suelta hombros y respira largo. Si te falta aire, párate: no es una prueba.",
    },
    {
      title: "Técnica",
      detail: `${Math.max(4, Math.round(drill / 25))} × 25 m de ejercicio`,
      meters: drill,
      restSeconds: rest,
      note: "Alterna patada con tabla, brazo solo y respiración de tres. La técnica es lo que hace que nadar canse menos.",
    },
    {
      title: "Principal",
      detail: `${Math.max(4, Math.round(main / 50))} × 50 m a ritmo cómodo`,
      meters: main,
      restSeconds: rest,
      note: "Ritmo de conversación. Terminar entero vale más que terminar rápido.",
    },
    {
      title: "Vuelta a la calma",
      detail: `${toPoolUnits(total * 0.1)} m muy suaves`,
      meters: toPoolUnits(total * 0.1),
      restSeconds: null,
      note: "Espalda o pecho lento, para bajar pulsaciones.",
    },
  ];
}

function resistenciaBlocks(total: number, rest: number): SwimBlock[] {
  const main = toPoolUnits(total * 0.55);
  const reps = Math.max(3, Math.round(main / 200));

  return [
    {
      title: "Calentamiento",
      detail: `${toPoolUnits(total * 0.15)} m continuos`,
      meters: toPoolUnits(total * 0.15),
      restSeconds: null,
      note: "De menos a más, sin prisa.",
    },
    {
      title: "Técnica",
      detail: `${Math.max(4, Math.round((total * 0.15) / 50))} × 50 m de ejercicio`,
      meters: toPoolUnits(total * 0.15),
      restSeconds: rest,
      note: "Punta de dedo al agua, codo alto, patada corta. Un ejercicio por serie.",
    },
    {
      title: "Principal",
      detail: `${reps} × ${toPoolUnits(main / reps)} m a ritmo firme`,
      meters: main,
      restSeconds: rest,
      note: "Firme es el ritmo que podrías sostener 20 minutos: cansa, no ahoga.",
    },
    {
      title: "Vuelta a la calma",
      detail: `${toPoolUnits(total * 0.15)} m suaves`,
      meters: toPoolUnits(total * 0.15),
      restSeconds: null,
      note: "Suelta hombros; el día de pierna de mañana lo agradece.",
    },
  ];
}

function velocidadBlocks(total: number, rest: number): SwimBlock[] {
  const main = toPoolUnits(total * 0.45);
  const reps = Math.max(6, Math.round(main / 50));

  return [
    {
      title: "Calentamiento",
      detail: `${toPoolUnits(total * 0.2)} m progresivos`,
      meters: toPoolUnits(total * 0.2),
      restSeconds: null,
      note: "Los últimos 50 m ya con ritmo.",
    },
    {
      title: "Técnica",
      detail: `${Math.max(4, Math.round((total * 0.2) / 50))} × 50 m de ejercicio`,
      meters: toPoolUnits(total * 0.2),
      restSeconds: rest,
      note: "Ejercicios de agarre y de rotación: es donde se gana velocidad sin gastar más.",
    },
    {
      title: "Principal",
      detail: `${reps} × ${toPoolUnits(main / reps)} m fuertes`,
      meters: main,
      restSeconds: rest + 15,
      note: "Fuerte de verdad, con el descanso completo. Si el último sale igual que el primero, el descanso está bien.",
    },
    {
      title: "Vuelta a la calma",
      detail: `${toPoolUnits(total * 0.15)} m muy suaves`,
      meters: toPoolUnits(total * 0.15),
      restSeconds: null,
      note: "Nada de terminar en seco después de series fuertes.",
    },
  ];
}

/**
 * La sesión de natación de la semana.
 *
 * `ordinal` es qué sesión de natación es dentro de la semana (1ª, 2ª...): con
 * dos a la semana, la primera es de resistencia y la segunda de velocidad y
 * técnica, para no repetir el mismo estímulo dos veces.
 */
export function swimSessionFor(input: {
  level: SwimLevel;
  isoWeek: number;
  ordinal: number;
  minutes: number;
}): SwimPlan {
  const { level, isoWeek, ordinal, minutes } = input;
  const { factor, deload } = volumeFactor(isoWeek);
  const total = toPoolUnits(BASE_METERS[level] * factor);
  const rest = REST_SECONDS[level];

  const velocidad = level !== "PRINCIPIANTE" && ordinal % 2 === 0;
  const blocks =
    level === "PRINCIPIANTE"
      ? principianteBlocks(total, rest)
      : velocidad
        ? velocidadBlocks(total, rest)
        : resistenciaBlocks(total, rest);

  const notes: string[] = [
    "Los metros son la guía; si un día no salen, se corta el bloque principal y se conserva la técnica.",
  ];
  if (deload) {
    notes.push("Semana de descarga: menos volumen a propósito, para poder subir la siguiente.");
  }
  if (level === "PRINCIPIANTE") {
    notes.push("Si todavía no nadas 25 m seguidos, haz la sesión con tabla y descansos largos: cuenta igual.");
  }

  return {
    level,
    focus: level === "PRINCIPIANTE" ? "Técnica y familiaridad" : velocidad ? "Velocidad y técnica" : "Resistencia",
    totalMeters: blocks.reduce((sum, block) => sum + block.meters, 0),
    minutes,
    blocks,
    deload,
    notes,
  };
}
