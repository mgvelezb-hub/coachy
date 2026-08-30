import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Funcional — estaciones con equipo, en un gimnasio.
 *
 * Lo que la separa de entrenar en casa es el **equipo**: trineo, sacos,
 * balones, remo y pesas rusas. Un circuito de flexiones y planchas es
 * exactamente lo que se puede hacer sin nada, y con eso las dos cosas serían
 * la misma disciplina.
 *
 * El marco es el de las carreras funcionales tipo Hyrox: estaciones de trabajo
 * con equipo intercaladas con carrera. No para competir, sino porque es la
 * lista más honesta de lo que un gimnasio funcional bien equipado sabe
 * entrenar, y cada estación tiene una técnica que se puede enseñar.
 *
 * El riesgo de esta disciplina no es la técnica: es que se convierta en una
 * segunda sesión de pesas mal hecha. Por eso el trabajo es de **densidad**
 * —mucho trabajo en poco tiempo, con carga ligera— y los patrones pesados de
 * barra se quedan del lado del gimnasio de pesas.
 *
 * La carga se cuenta en **rondas**, que es como se organiza un circuito.
 */

const BASE_RONDAS = { PRINCIPIANTE: 3, INTERMEDIO: 4, AVANZADO: 5 } as const;

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const rondas = Math.max(
    2,
    Math.round(BASE_RONDAS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]),
  );

  // Dos caras que se alternan: una de estaciones —el formato de carrera
  // funcional, con acarreos y máquinas— y otra de circuito con carga ligera.
  const estaciones = ordinal % 2 === 0;

  const ejercicios = estaciones
    ? nivel === "PRINCIPIANTE"
      ? "wall ball · empuje de trineo · caminata del granjero · remo en máquina"
      : nivel === "INTERMEDIO"
        ? "wall ball · trineo (empuje y arrastre) · zancadas con saco · SkiErg"
        : "burpee con salto largo · trineo pesado · zancadas con saco · SkiErg · remo"
    : nivel === "PRINCIPIANTE"
      ? "sentadilla goblet · swing con pesa rusa · paso sobre el cajón · remo en anillas"
      : nivel === "INTERMEDIO"
        ? "thruster con mancuernas · swing · step-over con carga · slam ball"
        : "clean con pesa rusa · thruster · cuerdas de batalla · plancha con arrastre";

  const blocks = [
    {
      title: "Movilidad y entrada",
      detail: `${nivel === "PRINCIPIANTE" ? 8 : 6} min de movilidad de cadera y hombro, y remo o bici suave`,
      carga: null,
      restSeconds: null,
      note: "Cadera y hombro, siempre: son las dos articulaciones que una estación pide sin avisar.",
    },
    {
      title: estaciones ? "Estaciones" : "Circuito con carga",
      detail: `${rondas} rondas: ${ejercicios}`,
      carga: rondas,
      restSeconds: nivel === "PRINCIPIANTE" ? 90 : 60,
      note: estaciones
        ? "Cada estación por distancia o por tiempo, con la carrera o el remo entre medias. El ritmo es el que te deja trabajar al llegar, no el de tu mejor 5K."
        : nivel === "PRINCIPIANTE"
          ? "12 repeticiones por ejercicio, con peso que te deje llegar a la última ronda igual que a la primera."
          : "40 s de trabajo y 20 de cambio. Peso ligero: aquí se busca densidad, no carga.",
    },
    {
      title: "Core",
      detail: `${Math.max(2, rondas - 1)} rondas de anti-rotación y anti-extensión`,
      carga: Math.max(2, rondas - 1),
      restSeconds: 45,
      note: "Pallof y plancha con peso: el core se entrena aguantando, no doblándose.",
    },
    {
      title: "Enfriamiento",
      detail: "5 min de respiración y estiramiento",
      carga: null,
      restSeconds: null,
      note: "Baja pulsaciones antes de salir; un circuito deja el pulso arriba más tiempo del que parece.",
    },
  ];

  const notes = [
    "Los patrones pesados de barra —sentadilla, peso muerto, press de banca— se quedan en tu día de pesas. Aquí compiten con la pierna en vez de sumarle.",
    "Si el gimnasio no tiene trineo o SkiErg, cámbialos por bici de aire o cuerdas: lo que importa es el tipo de esfuerzo, no la máquina.",
  ];
  if (deload) notes.push("Semana de descarga: una ronda menos.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "FUNCIONAL",
    nivel,
    focus: estaciones ? "Estaciones con equipo" : "Circuito con carga",
    unidad: "rondas",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes,
    blocks,
    deload,
    notes,
  };
}

export const FUNCIONAL: Prescriptor = {
  discipline: "FUNCIONAL",
  nombre: "Funcional",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Empiezas con el equipo. Wall ball, trineo ligero y acarreos cortos.",
    },
    {
      nivel: "INTERMEDIO",
      descripcion: "Dominas las estaciones. Trineo, saco y SkiErg por tiempo.",
    },
    {
      nivel: "AVANZADO",
      descripcion: "Formato de carrera funcional: más rondas, menos descanso y carga alta.",
    },
  ],
  sesion,
};
