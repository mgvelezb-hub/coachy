import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Funcional — circuitos de cuerpo completo, sin pisar la fuerza.
 *
 * El riesgo de esta disciplina no es la técnica: es que se convierta en una
 * segunda sesión de pesas mal hecha. Un circuito con sentadillas cargadas y
 * peso muerto compite de frente con el día de pierna y deja al gimnasio sin
 * nada que estimular. Por eso aquí el trabajo es de **densidad** —muchas
 * repeticiones con poco peso, en menos tiempo— y los patrones pesados se
 * quedan del lado de las pesas.
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

  const tren = ordinal % 2 === 0 ? "superior" : "inferior";

  const ejercicios =
    tren === "inferior"
      ? nivel === "PRINCIPIANTE"
        ? "sentadilla al cajón · zancada estática · puente de glúteo · plancha"
        : "sentadilla goblet · zancada caminando · peso muerto a una pierna · escalador"
      : nivel === "PRINCIPIANTE"
        ? "flexión inclinada · remo con banda · press de hombro ligero · plancha lateral"
        : "flexión · remo con mancuerna · press de hombro · rueda o plancha con arrastre";

  const blocks = [
    {
      title: "Movilidad",
      detail: `${nivel === "PRINCIPIANTE" ? 8 : 6} min de movilidad de cadera y hombro`,
      carga: null,
      restSeconds: null,
      note: "Cadera y hombro, siempre: son las dos articulaciones que un circuito pide sin avisar.",
    },
    {
      title: `Circuito de tren ${tren}`,
      detail: `${rondas} rondas de 4 ejercicios: ${ejercicios}`,
      carga: rondas,
      restSeconds: nivel === "PRINCIPIANTE" ? 90 : 60,
      note:
        nivel === "PRINCIPIANTE"
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
    "Los patrones pesados —sentadilla con barra, peso muerto, press de banca— se quedan en el gimnasio. Aquí compiten con tu día de pierna en vez de sumarle.",
    "Si un día tienes pierna pesada, este circuito va de tren superior, no al revés.",
  ];
  if (deload) notes.push("Semana de descarga: una ronda menos.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "FUNCIONAL",
    nivel,
    focus: `Circuito de tren ${tren}`,
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
    { nivel: "PRINCIPIANTE", descripcion: "Empiezas. Peso corporal y progresiones asistidas." },
    { nivel: "INTERMEDIO", descripcion: "Dominas los patrones. Circuitos por tiempo con carga ligera." },
    { nivel: "AVANZADO", descripcion: "Más rondas y menos descanso, sin subir el peso." },
  ],
  sesion,
};
