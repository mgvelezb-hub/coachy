import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Squash — la disciplina donde el partido NO es el entrenamiento.
 *
 * La distinción que ordena todo: jugar y entrenar squash son cosas distintas.
 * Un partido es carga, no es sesión: nadie mejora el drive jugando puntos,
 * igual que nadie mejora la sentadilla haciendo mudanzas. Lo que se prescribe
 * aquí son los **drills** —el trabajo repetido contra la pared o con el
 * compañero— y el acondicionamiento específico: los movimientos que el juego
 * exige y que las pesas no entrenan.
 *
 * Por eso la carga se cuenta en **minutos de bloque** y no en rondas: en la
 * cancha se trabaja por tiempo, no por repeticiones.
 *
 * El desplazamiento manda sobre el golpe. En squash casi todos los errores son
 * de posición —llegar tarde o mal parado—, no de técnica de raqueta, y por eso
 * el bloque de movimiento va antes que el de golpeo hasta en nivel avanzado.
 */

const BASE_MINUTOS = { PRINCIPIANTE: 40, INTERMEDIO: 55, AVANZADO: 70 } as const;

function reparte(total: number, fraccion: number): number {
  return Math.max(3, Math.round(total * fraccion));
}

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const total = Math.round(
    Math.min(minutes, BASE_MINUTOS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]),
  );

  // Dos caras que se alternan: una de patrones (golpe y precisión) y otra de
  // presión (fatiga y decisión). Repetir siempre la misma hace jugadores
  // precisos que se caen en el tercer juego, o al revés.
  const presion = nivel !== "PRINCIPIANTE" && ordinal % 2 === 0;

  const blocks =
    nivel === "PRINCIPIANTE"
      ? [
          {
            title: "Movilidad y calentamiento",
            detail: `${reparte(total, 0.2)} min de movilidad de cadera, tobillo y hombro`,
            carga: reparte(total, 0.2),
            restSeconds: null,
            note: "El squash pide tobillo y cadera. Entrar frío a una estirada es la lesión más común de esta cancha.",
          },
          {
            title: "Desplazamiento sin pelota",
            detail: `${reparte(total, 0.25)} min de recorrido a las cuatro esquinas`,
            carga: reparte(total, 0.25),
            restSeconds: 60,
            note: "Sal de la T, toca la esquina, vuelve a la T. Sin pelota se aprende a llegar parado, que es de lo que depende todo lo demás.",
          },
          {
            title: "Drive contra pared",
            detail: `${reparte(total, 0.35)} min alternando derecha y revés`,
            carga: reparte(total, 0.35),
            restSeconds: 45,
            note: "Objetivo: que la pelota vuelva paralela a la pared. No busques potencia, busca que caiga en el mismo sitio dos veces seguidas.",
          },
          {
            title: "Enfriamiento",
            detail: `${reparte(total, 0.2)} min de caminata y estiramiento`,
            carga: reparte(total, 0.2),
            restSeconds: null,
            note: "Gemelo, isquios y psoas: los tres que se acortan en cancha.",
          },
        ]
      : presion
        ? [
            {
              title: "Calentamiento con pelota",
              detail: `${reparte(total, 0.15)} min de peloteo progresivo`,
              carga: reparte(total, 0.15),
              restSeconds: null,
              note: "Que la pelota agarre temperatura mientras tú también.",
            },
            {
              title: "Fantasmas (ghosting)",
              detail: `${Math.max(4, Math.round(reparte(total, 0.3) / 2))} × 90 s a las esquinas`,
              carga: reparte(total, 0.3),
              restSeconds: 60,
              note: "Sin pelota, a ritmo de partido. Es el bloque que decide si llegas al tercer juego con piernas.",
            },
            {
              title: "Condicionados con presión",
              detail: `${Math.max(3, Math.round(reparte(total, 0.4) / 5))} juegos de 5 min, uno al frente y otro al fondo`,
              carga: reparte(total, 0.4),
              restSeconds: 90,
              note: "Uno mueve, el otro responde. Cuenta los puntos: sin marcador nadie corre igual.",
            },
            {
              title: "Enfriamiento",
              detail: `${reparte(total, 0.15)} min suaves`,
              carga: reparte(total, 0.15),
              restSeconds: null,
              note: "Baja pulsaciones antes de sentarte. La cancha caliente engaña.",
            },
          ]
        : [
            {
              title: "Calentamiento con pelota",
              detail: `${reparte(total, 0.15)} min de peloteo progresivo`,
              carga: reparte(total, 0.15),
              restSeconds: null,
              note: "Empieza al fondo y ve subiendo el ritmo.",
            },
            {
              title: "Precisión de drive",
              detail: `${Math.max(3, Math.round(reparte(total, 0.3) / 4))} series de 4 min al mismo objetivo`,
              carga: reparte(total, 0.3),
              restSeconds: 60,
              note: "Marca un punto en la pared lateral y busca repetirlo. La precisión se entrena aburriéndose.",
            },
            {
              title: "Patrones de dos",
              detail: `${Math.max(3, Math.round(reparte(total, 0.4) / 4))} series de 4 min: cruzado y paralelo`,
              carga: reparte(total, 0.4),
              restSeconds: 60,
              note: "Un patrón fijo y repetido. Es la forma de que el golpe salga solo cuando el punto se pone rápido.",
            },
            {
              title: "Enfriamiento",
              detail: `${reparte(total, 0.15)} min suaves`,
              carga: reparte(total, 0.15),
              restSeconds: null,
              note: "Movilidad de cadera para terminar.",
            },
          ];

  const notes = [
    "Un partido no sustituye esta sesión: jugar puntos es carga, no entrenamiento del golpe.",
    "Si vas a jugar el mismo día, haz esto antes y con el bloque principal recortado.",
  ];
  if (deload) notes.push("Semana de descarga: menos minutos, misma estructura.");
  if (nivel === "PRINCIPIANTE") {
    notes.push("Con lentes de protección. En squash el ojo es la lesión grave que sí se puede evitar.");
  }
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "SQUASH",
    nivel,
    focus:
      nivel === "PRINCIPIANTE" ? "Desplazamiento y drive" : presion ? "Presión y decisión" : "Precisión y patrones",
    unidad: "min",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes: total,
    blocks,
    deload,
    notes,
  };
}

export const SQUASH: Prescriptor = {
  discipline: "SQUASH",
  nombre: "Squash",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Peloteas pero el punto se te va pronto. Desplazamiento y drive contra pared.",
    },
    {
      nivel: "INTERMEDIO",
      descripcion: "Juegas partidos completos. Patrones de dos y precisión.",
    },
    {
      nivel: "AVANZADO",
      descripcion: "Compites o juegas liga. Fantasmas y condicionados con presión.",
    },
  ],
  sesion,
};
