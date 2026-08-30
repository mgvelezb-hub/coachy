import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Box — todo el beneficio, sin los golpes a la cabeza.
 *
 * La decisión más importante de este archivo es lo que NO prescribe: **sparring
 * no**, en ningún nivel. No por prudencia decorativa —el sparring es como se
 * aprende a boxear— sino porque una app no puede supervisar contacto: no ve la
 * guardia, no ve el golpe que entró, y no puede parar una sesión. El
 * acondicionamiento, la técnica, el saco y las manoplas dan casi todo el
 * beneficio físico y ninguno de los riesgos que no podemos vigilar. Quien
 * quiera sparring lo hace con su entrenador presente, y eso se dice con todas
 * sus letras.
 *
 * La carga se cuenta en **asaltos**, que es la unidad del deporte: tres
 * minutos de trabajo y uno de descanso es el reloj que todo gimnasio de box
 * tiene en la pared.
 */

const BASE_ASALTOS = { PRINCIPIANTE: 6, INTERMEDIO: 9, AVANZADO: 12 } as const;

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const asaltos = Math.max(
    4,
    Math.round(BASE_ASALTOS[nivel] * factor * FACTOR_POR_OBJETIVO[objetivo]),
  );

  // Alterna técnica (limpio, con tiempo para pensar el golpe) y capacidad
  // (fatigado, que es donde la técnica se cae y hay que sostenerla).
  const capacidad = nivel !== "PRINCIPIANTE" && ordinal % 2 === 0;

  const reparto = {
    calentamiento: Math.max(1, Math.round(asaltos * 0.2)),
    sombra: Math.max(1, Math.round(asaltos * 0.25)),
    principal: Math.max(2, Math.round(asaltos * 0.4)),
    core: Math.max(1, Math.round(asaltos * 0.15)),
  };

  const blocks =
    nivel === "PRINCIPIANTE"
      ? [
          {
            title: "Cuerda y movilidad",
            detail: `${reparto.calentamiento} asaltos de cuerda (o salto sin cuerda)`,
            carga: reparto.calentamiento,
            restSeconds: 60,
            note: "Si la cuerda todavía se enreda, salta sin ella. Lo que importa es el tobillo y el pulso arriba.",
          },
          {
            title: "Guardia y desplazamiento",
            detail: `${reparto.sombra} asaltos de sombra, solo movimiento`,
            carga: reparto.sombra,
            restSeconds: 60,
            note: "Sin golpear: adelante, atrás y lateral manteniendo la guardia arriba. Los pies primero, las manos después.",
          },
          {
            title: "Jab y directo al saco",
            detail: `${reparto.principal} asaltos: jab solo, luego uno-dos`,
            carga: reparto.principal,
            restSeconds: 60,
            note: "Golpea al saco, no lo empujes: el puño vuelve a la cara tan rápido como salió. Vendas siempre.",
          },
          {
            title: "Core y cuello",
            detail: `${reparto.core} asaltos de abdomen y cuello`,
            carga: reparto.core,
            restSeconds: 45,
            note: "El core transmite la fuerza de la cadera al puño. Sin él, el golpe se queda en el brazo.",
          },
        ]
      : capacidad
        ? [
            {
              title: "Cuerda",
              detail: `${reparto.calentamiento} asaltos, el último con dobles`,
              carga: reparto.calentamiento,
              restSeconds: 45,
              note: "Sube el pulso antes del trabajo duro.",
            },
            {
              title: "Sombra a ritmo",
              detail: `${reparto.sombra} asaltos con combinaciones de 3 y 4`,
              carga: reparto.sombra,
              restSeconds: 45,
              note: "Rápido y suelto. Cada asalto empieza y termina con salida lateral.",
            },
            {
              title: "Saco por intervalos",
              detail: `${reparto.principal} asaltos: 20 s fuerte / 40 s técnico`,
              carga: reparto.principal,
              restSeconds: 60,
              note: "En los 20 fuertes se sostiene la guardia, no se abandona. Ese es el punto del bloque.",
            },
            {
              title: "Core y cuello",
              detail: `${reparto.core} asaltos`,
              carga: reparto.core,
              restSeconds: 45,
              note: "Termina con cuello: es lo que protege de verdad si algún día haces contacto.",
            },
          ]
        : [
            {
              title: "Cuerda",
              detail: `${reparto.calentamiento} asaltos`,
              carga: reparto.calentamiento,
              restSeconds: 45,
              note: "Ligero, para entrar en calor.",
            },
            {
              title: "Sombra con espejo",
              detail: `${reparto.sombra} asaltos, uno por combinación`,
              carga: reparto.sombra,
              restSeconds: 45,
              note: "Frente al espejo se corrige la guardia sola. Una combinación por asalto, sin inventar.",
            },
            {
              title: "Saco técnico",
              detail: `${reparto.principal} asaltos con combinaciones fijas`,
              carga: reparto.principal,
              restSeconds: 60,
              note: "Limpio antes que fuerte. Si la mano se queda abajo al volver, baja el ritmo.",
            },
            {
              title: "Core y cuello",
              detail: `${reparto.core} asaltos`,
              carga: reparto.core,
              restSeconds: 45,
              note: "Rotación con balón o banda, no solo abdominales.",
            },
          ];

  const notes = [
    "Asalto = 3 minutos de trabajo y 1 de descanso, el reloj de cualquier gimnasio de box.",
    "Vendas siempre, y guantes de saco. La muñeca es lo primero que se lastima golpeando sin vendar.",
    "Aquí no hay sparring: una app no ve tu guardia ni puede parar una sesión. Eso se hace con tu entrenador enfrente.",
  ];
  if (deload) notes.push("Semana de descarga: menos asaltos, misma técnica.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "BOX",
    nivel,
    focus:
      nivel === "PRINCIPIANTE" ? "Guardia y golpes base" : capacidad ? "Capacidad e intervalos" : "Técnica y combinaciones",
    unidad: "asaltos",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes,
    blocks,
    deload,
    notes,
  };
}

export const BOX: Prescriptor = {
  discipline: "BOX",
  nombre: "Box",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Empiezas. Guardia, desplazamiento, jab y directo al saco.",
    },
    {
      nivel: "INTERMEDIO",
      descripcion: "Tienes combinaciones y aguantas asaltos. Sombra, saco técnico e intervalos.",
    },
    {
      nivel: "AVANZADO",
      descripcion: "Entrenas seguido. Más asaltos y trabajo por intervalos con guardia sostenida.",
    },
  ],
  sesion,
};
