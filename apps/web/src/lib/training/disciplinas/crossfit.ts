import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * CrossFit — la que más choca con la planeación de fuerza, y por eso la última.
 *
 * Dos cosas la separan de las demás:
 *
 * 1. **Un WOD sustituye un día de gimnasio, no lo acompaña.** Un metcon con
 *    sentadilla y peso muerto es un día de pierna con otro nombre. El
 *    presupuesto semanal ya lo cobra así, y aquí se dice para que nadie lo
 *    sume encima.
 * 2. **Los movimientos olímpicos NO se prescriben por app en principiante.**
 *    Un arranque o un envión mal ejecutado con fatiga es la receta de una
 *    lesión de hombro o espalda, y ninguna app puede ver una barra que se va
 *    adelante. Se prescriben sus progresiones —tirón alto, empuje de fuerza—
 *    hasta que alguien con ojos enfrente diga lo contrario.
 *
 * La carga se cuenta en **rondas**, que es la unidad del WOD.
 */

const BASE_RONDAS = { PRINCIPIANTE: 3, INTERMEDIO: 5, AVANZADO: 6 } as const;

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const rondas = Math.max(
    2,
    Math.round(BASE_RONDAS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]),
  );

  // Los dos formatos clásicos, alternados: AMRAP (tantas rondas como puedas en
  // un tiempo) y "por tiempo" (rondas fijas lo antes posible). El primero
  // enseña a dosificar; el segundo, a sostener bajo prisa.
  const amrap = ordinal % 2 === 0;

  const movimientos =
    nivel === "PRINCIPIANTE"
      ? "sentadilla al aire · remo o bici · flexión al cajón · zancada"
      : nivel === "INTERMEDIO"
        ? "sentadilla frontal ligera · remo · burpee · kettlebell swing"
        : "thruster ligero · dominadas · remo · box jump";

  const blocks = [
    {
      title: "Calentamiento general",
      detail: "8-10 min: remo o cuerda, movilidad de cadera y hombro",
      carga: null,
      restSeconds: null,
      note: "Con el pulso arriba antes de tocar una barra. Entrar frío a un metcon es donde se rompe la técnica.",
    },
    {
      title: "Fuerza o progresión",
      detail:
        nivel === "PRINCIPIANTE"
          ? "5 × 5 de sentadilla al cajón y empuje de fuerza, con barra vacía o ligera"
          : "5 × 3 de sentadilla frontal o press, subiendo si la técnica aguanta",
      carga: null,
      restSeconds: 120,
      note:
        nivel === "PRINCIPIANTE"
          ? "Aquí no hay arranque ni envión: primero las progresiones, y el levantamiento completo con un entrenador enfrente."
          : "Si la barra se va adelante o la espalda se redondea, ese fue el último set válido.",
    },
    {
      title: amrap ? `AMRAP de ${Math.max(8, Math.round(minutes * 0.35))} min` : `${rondas} rondas por tiempo`,
      detail: `${movimientos}`,
      carga: rondas,
      restSeconds: null,
      note: amrap
        ? "Ritmo sostenible: la primera ronda tiene que parecerse a la última. Salir volando es la forma clásica de terminar caminando."
        : "Rondas fijas, lo más rápido que la técnica aguante. La técnica manda sobre el reloj.",
    },
    {
      title: "Enfriamiento",
      detail: "5 min de respiración y movilidad",
      carga: null,
      restSeconds: null,
      note: "Respiración nasal para bajar pulsaciones; el metcon deja el sistema encendido.",
    },
  ];

  const notes = [
    "Este WOD ocupa el lugar de un día de gimnasio, no se suma: un metcon con sentadilla y peso muerto es un día de pierna con otro nombre.",
    "Escala el peso siempre que la técnica se caiga. Escalar es parte del método, no una rebaja.",
  ];
  if (nivel === "PRINCIPIANTE") {
    notes.push(
      "Arranque y envión no se prescriben desde una app: son los dos movimientos donde la fatiga y la técnica se cruzan peor.",
    );
  }
  if (deload) notes.push("Semana de descarga: menos rondas, mismo formato.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "CROSSFIT",
    nivel,
    focus: amrap ? "AMRAP y dosificación" : "Rondas por tiempo",
    unidad: "rondas",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes,
    blocks,
    deload,
    notes,
  };
}

export const CROSSFIT: Prescriptor = {
  discipline: "CROSSFIT",
  nombre: "CrossFit",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Primeros meses. Peso corporal, progresiones y nada de olímpicos.",
    },
    { nivel: "INTERMEDIO", descripcion: "Escalas los WOD. Barra ligera y metcons completos." },
    { nivel: "AVANZADO", descripcion: "WOD prescrito. Más rondas y más carga." },
  ],
  sesion,
};
