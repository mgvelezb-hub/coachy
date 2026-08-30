import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Natación — la primera disciplina fuera de las pesas.
 *
 * Dos decisiones que se quedan:
 *
 * - **El volumen se prescribe en metros, no en tiempos.** Un tiempo objetivo
 *   ("100 m en 1:45") solo significa algo contra la marca de quien nada, y de
 *   eso no hay dato. El esfuerzo va como sensación, que es lo que un
 *   entrenador dice en la orilla.
 * - **La técnica no es opcional.** En natación la mejora viene más de la
 *   técnica que del volumen, así que todas las sesiones traen su bloque, hasta
 *   las de resistencia.
 */

const BASE_METROS = { PRINCIPIANTE: 600, INTERMEDIO: 1400, AVANZADO: 2200 } as const;
const DESCANSO = { PRINCIPIANTE: 45, INTERMEDIO: 30, AVANZADO: 20 } as const;

/** Redondea a múltiplos de 25 m: nadie nada 137 metros. */
function aLargos(metros: number): number {
  return Math.max(25, Math.round(metros / 25) * 25);
}

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const total = aLargos(BASE_METROS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]);
  const descanso = DESCANSO[nivel];

  const velocidad = nivel !== "PRINCIPIANTE" && ordinal % 2 === 0;

  const blocks =
    nivel === "PRINCIPIANTE"
      ? [
          {
            title: "Calentamiento",
            detail: `${aLargos(total * 0.15)} m suaves, parando en cada orilla`,
            carga: aLargos(total * 0.15),
            restSeconds: null,
            note: "Suelta hombros y respira largo. Si te falta aire, párate: no es una prueba.",
          },
          {
            title: "Técnica",
            detail: `${Math.max(4, Math.round((total * 0.35) / 25))} × 25 m de ejercicio`,
            carga: aLargos(total * 0.35),
            restSeconds: descanso,
            note: "Alterna patada con tabla, brazo solo y respiración de tres. La técnica es lo que hace que nadar canse menos.",
          },
          {
            title: "Principal",
            detail: `${Math.max(4, Math.round((total * 0.4) / 50))} × 50 m a ritmo cómodo`,
            carga: aLargos(total * 0.4),
            restSeconds: descanso,
            note: "Ritmo de conversación. Terminar entero vale más que terminar rápido.",
          },
          {
            title: "Vuelta a la calma",
            detail: `${aLargos(total * 0.1)} m muy suaves`,
            carga: aLargos(total * 0.1),
            restSeconds: null,
            note: "Espalda o pecho lento, para bajar pulsaciones.",
          },
        ]
      : velocidad
        ? [
            {
              title: "Calentamiento",
              detail: `${aLargos(total * 0.2)} m progresivos`,
              carga: aLargos(total * 0.2),
              restSeconds: null,
              note: "Los últimos 50 m ya con ritmo.",
            },
            {
              title: "Técnica",
              detail: `${Math.max(4, Math.round((total * 0.2) / 50))} × 50 m de ejercicio`,
              carga: aLargos(total * 0.2),
              restSeconds: descanso,
              note: "Ejercicios de agarre y rotación: es donde se gana velocidad sin gastar más.",
            },
            {
              title: "Principal",
              detail: `${Math.max(6, Math.round((total * 0.45) / 50))} × 50 m fuertes`,
              carga: aLargos(total * 0.45),
              restSeconds: descanso + 15,
              note: "Fuerte de verdad, con descanso completo. Si el último sale como el primero, el descanso está bien.",
            },
            {
              title: "Vuelta a la calma",
              detail: `${aLargos(total * 0.15)} m muy suaves`,
              carga: aLargos(total * 0.15),
              restSeconds: null,
              note: "Nada de terminar en seco después de series fuertes.",
            },
          ]
        : [
            {
              title: "Calentamiento",
              detail: `${aLargos(total * 0.15)} m continuos`,
              carga: aLargos(total * 0.15),
              restSeconds: null,
              note: "De menos a más, sin prisa.",
            },
            {
              title: "Técnica",
              detail: `${Math.max(4, Math.round((total * 0.15) / 50))} × 50 m de ejercicio`,
              carga: aLargos(total * 0.15),
              restSeconds: descanso,
              note: "Punta de dedo al agua, codo alto, patada corta. Un ejercicio por serie.",
            },
            {
              title: "Principal",
              detail: `${Math.max(3, Math.round((total * 0.55) / 200))} × ${aLargos(
                (total * 0.55) / Math.max(3, Math.round((total * 0.55) / 200)),
              )} m a ritmo firme`,
              carga: aLargos(total * 0.55),
              restSeconds: descanso,
              note: "Firme es el ritmo que podrías sostener 20 minutos: cansa, no ahoga.",
            },
            {
              title: "Vuelta a la calma",
              detail: `${aLargos(total * 0.15)} m suaves`,
              carga: aLargos(total * 0.15),
              restSeconds: null,
              note: "Suelta hombros; el día de pierna de mañana lo agradece.",
            },
          ];

  const notes = [
    "Los metros son la guía; si un día no salen, se corta el bloque principal y se conserva la técnica.",
  ];
  if (deload) notes.push("Semana de descarga: menos volumen a propósito, para poder subir la siguiente.");
  if (nivel === "PRINCIPIANTE") {
    notes.push("Si todavía no nadas 25 m seguidos, haz la sesión con tabla y descansos largos: cuenta igual.");
  }
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "NATACION",
    nivel,
    focus:
      nivel === "PRINCIPIANTE" ? "Técnica y familiaridad" : velocidad ? "Velocidad y técnica" : "Resistencia",
    unidad: "m",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes,
    blocks,
    deload,
    notes,
  };
}

export const NATACION: Prescriptor = {
  discipline: "NATACION",
  nombre: "Natación",
  niveles: [
    { nivel: "PRINCIPIANTE", descripcion: "Todavía no nadas de corrido. Técnica, tabla y descansos largos." },
    { nivel: "INTERMEDIO", descripcion: "Nadas 400-800 m sin parar. Series de resistencia y de velocidad." },
    { nivel: "AVANZADO", descripcion: "Más de 1500 m por sesión. Más volumen y menos descanso." },
  ],
  sesion,
};
