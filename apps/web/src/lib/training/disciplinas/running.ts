import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Running — la disciplina donde la lesión viene de subir demasiado rápido.
 *
 * La regla que ordena todo esto es de volumen, no de velocidad: el tejido
 * conectivo se adapta mucho más lento que el corazón y el músculo, así que
 * casi todo el mundo puede correr más de lo que su tendón aguanta. Por eso el
 * ciclo sube poco y descarga cada cuatro semanas, y por eso el principiante
 * alterna caminar y correr en vez de correr menos rato: la carga por pisada es
 * la misma, lo que cambia es cuántas seguidas.
 *
 * La carga se cuenta en **minutos**, no en kilómetros. Un kilómetro cuesta el
 * doble de tiempo a quien empieza que a quien ya corre, y el cuerpo cuenta
 * minutos de impacto, no distancia.
 */

const BASE_MINUTOS = { PRINCIPIANTE: 25, INTERMEDIO: 40, AVANZADO: 55 } as const;

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const total = Math.round(
    Math.min(minutes, BASE_MINUTOS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]),
  );

  const intervalos = nivel !== "PRINCIPIANTE" && ordinal % 2 === 0;
  const parte = (fraccion: number) => Math.max(3, Math.round(total * fraccion));

  const blocks =
    nivel === "PRINCIPIANTE"
      ? [
          {
            title: "Caminata de entrada",
            detail: `${parte(0.2)} min caminando rápido`,
            carga: parte(0.2),
            restSeconds: null,
            note: "Empezar caminando no es calentar de mentiras: es lo que evita que las primeras zancadas sean las más duras del día.",
          },
          {
            title: "Corre y camina",
            detail: `${Math.max(4, Math.round(parte(0.6) / 3))} series de 1 min corriendo y 2 caminando`,
            carga: parte(0.6),
            restSeconds: null,
            note: "El minuto corriendo va cómodo: tienes que poder decir una frase entera. Si no puedes, es demasiado rápido.",
          },
          {
            title: "Caminata de salida",
            detail: `${parte(0.2)} min bajando el ritmo`,
            carga: parte(0.2),
            restSeconds: null,
            note: "Y estirar gemelo y cadera al terminar, todavía en caliente.",
          },
        ]
      : intervalos
        ? [
            {
              title: "Calentamiento",
              detail: `${parte(0.25)} min suaves`,
              carga: parte(0.25),
              restSeconds: null,
              note: "Los últimos 2 minutos con 3 o 4 progresiones cortas.",
            },
            {
              title: "Series",
              detail: `${Math.max(4, Math.round(parte(0.45) / 3))} × 2 min fuertes, 2 min trotando`,
              carga: parte(0.45),
              restSeconds: 120,
              note: "Fuerte es un ritmo que podrías sostener 10 minutos, no un esprint. Si la última serie es mucho más lenta que la primera, empezaste demasiado rápido.",
            },
            {
              title: "Vuelta a la calma",
              detail: `${parte(0.3)} min muy suaves`,
              carga: parte(0.3),
              restSeconds: null,
              note: "Trote flojo, nunca parar en seco después de series.",
            },
          ]
        : [
            {
              title: "Calentamiento",
              detail: `${parte(0.2)} min progresivos`,
              carga: parte(0.2),
              restSeconds: null,
              note: "De caminar a trotar sin escalones.",
            },
            {
              title: "Rodaje continuo",
              detail: `${parte(0.6)} min a ritmo de conversación`,
              carga: parte(0.6),
              restSeconds: null,
              note: "Si no puedes hablar, vas rápido. La mayor parte del kilometraje debe sentirse fácil: es lo que construye la base.",
            },
            {
              title: "Vuelta a la calma",
              detail: `${parte(0.2)} min suaves`,
              carga: parte(0.2),
              restSeconds: null,
              note: "Y movilidad de tobillo y cadera al terminar.",
            },
          ];

  const notes = [
    "El volumen sube poco a propósito: el tendón se adapta más lento que el corazón, y ahí es donde aparecen las lesiones.",
    "Si algo duele al correr y sigue doliendo al día siguiente, esa semana se corta. Correr con dolor no es disciplina.",
  ];
  if (deload) notes.push("Semana de descarga: menos minutos, mismo ritmo.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "CARDIO",
    nivel,
    focus:
      nivel === "PRINCIPIANTE" ? "Corre y camina" : intervalos ? "Series" : "Rodaje base",
    unidad: "min",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes: total,
    blocks,
    deload,
    notes,
  };
}

export const RUNNING: Prescriptor = {
  discipline: "CARDIO",
  nombre: "Correr",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Todavía no corres 10 minutos seguidos. Alternas correr y caminar.",
    },
    { nivel: "INTERMEDIO", descripcion: "Corres 30-40 min seguidos. Rodajes y series." },
    { nivel: "AVANZADO", descripcion: "Corres varias veces por semana. Más volumen e intervalos largos." },
  ],
  sesion,
};
