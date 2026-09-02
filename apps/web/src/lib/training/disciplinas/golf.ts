import {
  FACTOR_POR_OBJETIVO,
  factorDeSemana,
  notaDeObjetivo,
  type BloqueSesion,
  type Prescriptor,
  type PrescripcionInput,
  type SesionDisciplina,
} from "@/lib/training/disciplinas/tipos";

/**
 * Golf — la disciplina en paralelo: no suma al objetivo físico del perfil,
 * entrena la habilidad. El gimnasio sigue cargando con la meta de fuerza o
 * composición; esta sesión existe para que "juega golf" en el perfil
 * signifique algo más que "reserva el día", igual que ya pasa con squash o
 * natación.
 *
 * Dos cuerpos de evidencia deciden CÓMO se arma cada sesión, no solo cuánta:
 *
 * 1. **Práctica aleatoria/intercalada > práctica en bloque** (Schmidt & Lee,
 *    aprendizaje motor; "interleaving effect"). Vaciar una cubeta entera con
 *    el mismo palo a la misma distancia SE SIENTE mejor en el momento —cada
 *    tiro sale más limpio que el anterior porque el cerebro no tiene que
 *    resolver el problema desde cero— pero esa misma repetición es lo que
 *    hace que se olvide rápido: no hubo que recuperar el patrón motor, solo
 *    mantenerlo. Cambiar de estación, de palo y de distancia cada pocos tiros
 *    obliga a resolver el problema motor de nuevo cada vez, que es justo el
 *    proceso que fija el aprendizaje a largo plazo. Por eso ninguna estación
 *    de este archivo repite el mismo palo o la misma distancia más de un
 *    puñado de tiros seguidos, y por eso el nivel avanzado llega a simular
 *    hoyos completos cambiando de palo en cada tiro: es la forma máxima de
 *    intercalar, y además es literalmente cómo se juega un hoyo real.
 *
 * 2. **El putting y el juego corto pesan más de lo que el golfista amateur
 *    cree** (Mark Broadie, *strokes gained*). El análisis de millones de
 *    tiros muestra que el jugador promedio pierde más golpes contra el campo
 *    en putts y approaches cortos que en el swing completo, y aun así casi
 *    todos entrenan sobre todo el driver porque es lo que más se disfruta.
 *    Por eso cada sesión de este archivo —sin importar si el foco declarado
 *    del día es el swing, el driver o la presión— reserva ~40 % del tiempo a
 *    putting o juego corto: es el reparto que de verdad mueve el score, no el
 *    que más se siente en el bolsillo del hombro.
 *
 * Por nivel:
 *
 * - **PRINCIPIANTE**: fundamentos y contacto. Grip y postura antes que
 *   cualquier golpe, tiros a media altura para aprender a hacer contacto
 *   limpio sin perseguir distancia, y putts cortos con "compuerta" (dos tees
 *   clavados a la entrada del hoyo) que dan una retroalimentación binaria muy
 *   clara: entra o no entra.
 * - **INTERMEDIO**: control de distancia con wedges (rotando entre tres
 *   distancias cortas), putting en escalera de distancias, y driver contra un
 *   objetivo de calle en vez de "lo más lejos posible" — la precisión es lo
 *   que baja el score, la distancia sola no.
 * - **AVANZADO**: juegos de presión con consecuencia real (no sales de la
 *   estación hasta embocar una racha), práctica desde lies variables (nunca
 *   tapete plano, que es como nunca se juega en cancha) y simulación de hoyos
 *   completos en el range.
 *
 * La carga se cuenta en **minutos**, como squash y running: las estaciones no
 * comparten una unidad natural entre sí (putts, tiros, hoyos imaginarios), y
 * el tiempo es lo único que de verdad limita si la sesión cabe en el bloque
 * que le tocó esa semana. Por la misma razón (igual que squash y running) el
 * total real de la sesión NO es siempre el minutaje que llegó del bloque: un
 * principiante no necesita ni aguanta 90 minutos de práctica sostenida —la
 * atención a la técnica se cae mucho antes que en un avanzado—, así que
 * `BASE_MINUTOS` limita cuánto pide cada nivel, y `minutes` de la sesión
 * nunca pasa de `Math.min(bloque, BASE_MINUTOS[nivel] * factor * objetivo)`.
 *
 * Como toda disciplina fuera de pesas, esto prescribe estructura, no
 * corrección de swing en vivo: la app no ve si el palo llega adelantado, un
 * profesional de golf sí.
 */

/** Techo de minutos por nivel, antes del recorte por objetivo y semana. */
const BASE_MINUTOS = { PRINCIPIANTE: 40, INTERMEDIO: 60, AVANZADO: 80 } as const;

/** Rotación de palos para la estación de contacto (principiante). Varía por semana. */
const CLUBES_CONTACTO = [
  "9-hierro · 7-hierro · madera de calle",
  "8-hierro · 6-hierro · híbrido",
  "PW · 9-hierro · 7-hierro",
] as const;

/** Trío de distancias de wedge (intermedio). Varía por semana para no memorizar un solo yardaje. */
const DISTANCIAS_WEDGE = [
  [30, 50, 70],
  [35, 55, 75],
  [40, 60, 80],
] as const;

/** Lies fuera de tapete plano (avanzado). En cancha nunca hay dos tiros iguales seguidos. */
const LIES_VARIABLES = [
  "pendiente arriba y rough alto",
  "bunker de green y pendiente abajo",
  "rough profundo y lie desnivelado",
] as const;

/** Secuencias de palo para "jugar" un hoyo imaginario en el range (avanzado). */
const SECUENCIAS_HOYOS = [
  "driver · hierro largo · wedge · putt (par 5 imaginario)",
  "híbrido · hierro medio · wedge · putt (par 4 imaginario)",
  "hierro corto · wedge · putt (par 3 imaginario)",
] as const;

/** Elige un elemento del pool determinado por `seed` — así la semana decide, no el azar real. */
function pick<T>(pool: readonly T[], seed: number): T {
  const index = ((seed % pool.length) + pool.length) % pool.length;
  return pool[index]!;
}

/**
 * Reparte `total` minutos entre estaciones según `fracciones` (deben sumar
 * ~1). Con `Math.floor` en cada bloque y el remanente del redondeo repartido
 * un minuto a la vez, la suma final NUNCA pasa de `total` — a diferencia de
 * redondear cada bloque por separado, que sí puede desbordar por acumulación.
 *
 * Si el total es tan corto que a algún bloque le toca 0, se le presta 1
 * minuto del bloque más grande: una estación de 0 minutos no es una
 * estación, y "una más corta" es más honesto que "una que no existe".
 */
function repartir(total: number, fracciones: number[]): number[] {
  const bloques = fracciones.map((f) => Math.floor(total * f));
  const asignado = bloques.reduce((suma, m) => suma + m, 0);
  let restante = Math.max(0, total - asignado);

  const ordenPorTamano = fracciones
    .map((_, i) => i)
    .sort((a, b) => fracciones[b]! - fracciones[a]!);

  let cursor = 0;
  while (restante > 0) {
    bloques[ordenPorTamano[cursor]!]! += 1;
    restante -= 1;
    cursor = (cursor + 1) % ordenPorTamano.length;
  }

  if (total >= fracciones.length) {
    for (let i = 0; i < bloques.length; i++) {
      if (bloques[i] !== 0) continue;
      const iMax = bloques.reduce((mejor, val, j) => (val > bloques[mejor]! ? j : mejor), 0);
      if (bloques[iMax]! > 1) {
        bloques[iMax]! -= 1;
        bloques[i] = 1;
      }
    }
  }

  return bloques;
}

/**
 * Escala una dosis (putts, tiros) por semana y objetivo, redondeando a
 * múltiplos de `paso` — nadie cuenta 23 putts, cuenta series de 5.
 */
function dosis(base: number, factor: number, objetivoFactor: number, paso = 5): number {
  return Math.max(paso, Math.round((base * factor * objetivoFactor) / paso) * paso);
}

function bloquesPrincipiante(
  minutos: number[],
  factor: number,
  objetivoFactor: number,
  seed: number,
): BloqueSesion[] {
  const [act, putt, contacto, cierre] = minutos as [number, number, number, number];
  const club = pick(CLUBES_CONTACTO, seed);
  const puttReps = dosis(20, factor, objetivoFactor, 5);
  const contactoReps = dosis(15, factor, objetivoFactor, 5);

  return [
    {
      title: "Grip y postura",
      detail: `${act} min: agarre neutro, alineación con un palo en el piso y postura frente al espejo o el celular`,
      carga: act,
      restSeconds: null,
      note: "Sin esto todo lo demás se compensa mal: el grip y la postura son lo primero que un principiante necesita automatizar, antes que cualquier golpe.",
    },
    {
      title: "Putts en escalera con compuerta",
      detail: `${puttReps} putts en escalera: 1, 2, 3 m — dos tees clavados como compuerta a la entrada del hoyo; si fallas dos seguidos, vuelve a 1 m`,
      carga: putt,
      restSeconds: null,
      note: "El golfista amateur pierde más golpes en putting de lo que cree (Broadie, strokes gained): por eso esta estación se lleva el bloque más grande, aunque el foco del día sea aprender a pegarle a la bola.",
    },
    {
      title: "Contacto a media altura",
      detail: `${contactoReps} tiros con ${club}, cambiando de palo cada 5: el objetivo es el contacto limpio, no la distancia`,
      carga: contacto,
      restSeconds: null,
      note: "Cambiar de palo cada pocos tiros en vez de vaciar una cubeta entera del mismo es a propósito: la práctica intercalada retiene más que la práctica en bloque (Schmidt & Lee), aunque en el momento se sienta más torpe que repetir.",
    },
    {
      title: "Cierre y respiración",
      detail: `${cierre} min: revisa qué estación se sintió más sólida hoy y por qué`,
      carga: cierre,
      restSeconds: null,
      note: "Un minuto de reflexión consolida más que un tiro extra: la memoria motora se fija después del esfuerzo, no durante.",
    },
  ];
}

function bloquesIntermedio(
  minutos: number[],
  factor: number,
  objetivoFactor: number,
  seed: number,
): BloqueSesion[] {
  const [act, putt, wedge, driver, cierre] = minutos as [number, number, number, number, number];
  const [d1, d2, d3] = pick(DISTANCIAS_WEDGE, seed);
  const puttReps = dosis(24, factor, objetivoFactor, 6);
  const wedgeReps = dosis(18, factor, objetivoFactor, 6);
  const driverReps = dosis(12, factor, objetivoFactor, 3);

  return [
    {
      title: "Activación",
      detail: `${act} min: movilidad de cadera y hombro, y swings en vacío subiendo el ritmo poco a poco`,
      carga: act,
      restSeconds: null,
      note: "Entrar frío a un wedge de precisión es donde se pierde la primera mitad de la sesión ajustando sensaciones que el calentamiento resuelve gratis.",
    },
    {
      title: "Putting con escalera de distancias",
      detail: `${puttReps} putts repartidos en escalera de 1 a 5 m, cambiando de distancia cada 3 intentos`,
      carga: putt,
      restSeconds: null,
      note: "Sigue siendo la estación más grande aunque hoy el foco sean los wedges: strokes gained dice que ahí se pierden más golpes de los que un jugador intermedio cree.",
    },
    {
      title: "Wedges de distancia",
      detail: `${wedgeReps} tiros a ${d1}/${d2}/${d3} m, rotando entre las tres distancias — nunca más de 3 tiros seguidos a la misma`,
      carga: wedge,
      restSeconds: null,
      note: "El control de distancia con wedge es lo que separa el score de un intermedio del de un principiante: se entrena rotando distancias, no memorizando un solo swing.",
    },
    {
      title: "Driver con objetivo",
      detail: `${driverReps} drives a un objetivo de calle marcado (no a la bandera): cuenta cuántos caen dentro`,
      carga: driver,
      restSeconds: 30,
      note: "Un objetivo de calle en vez de 'pegarle lo más lejos' entrena la precisión que de verdad baja el score: la distancia sin dirección no sirve en cancha.",
    },
    {
      title: "Cierre",
      detail: `${cierre} min: putts cortos de confianza para terminar en positivo`,
      carga: cierre,
      restSeconds: null,
      note: "Terminar con algo que se embuca casi siempre deja mejor sensación motora que terminar en el palo más difícil del día.",
    },
  ];
}

function bloquesAvanzado(
  minutos: number[],
  factor: number,
  objetivoFactor: number,
  seed: number,
  deload: boolean,
): BloqueSesion[] {
  const [act, puttPresion, lies, hoyos, cierre] = minutos as [
    number,
    number,
    number,
    number,
    number,
  ];
  const lie = pick(LIES_VARIABLES, seed);
  const secuenciaHoyos = pick(SECUENCIAS_HOYOS, seed + 1);
  const rachaObjetivo = deload ? 4 : 5;
  const liesReps = dosis(12, factor, objetivoFactor, 3);
  const hoyosSimulados = Math.max(4, Math.round(hoyos / 2));

  return [
    {
      title: "Activación",
      detail: `${act} min: movilidad completa y tiros cortos de aproximación para entrar directo a la presión`,
      carga: act,
      restSeconds: null,
      note: "A este nivel el calentamiento es breve: el cuerpo ya conoce el patrón, lo que hace falta es afinar el gatillo antes de exponerse a la presión.",
    },
    {
      title: "Putting de presión",
      detail: `Putts de 1.5 m: no sales de la estación hasta embocar ${rachaObjetivo} seguidos — si fallas uno, la racha vuelve a cero`,
      carga: puttPresion,
      restSeconds: null,
      note: "La presión de una racha —no un número fijo de intentos— simula lo único que de verdad se pierde en cancha: la consecuencia de fallar. Sigue siendo la estación más grande: strokes gained castiga el putting más que el swing incluso en jugadores avanzados.",
    },
    {
      title: "Lies variables",
      detail: `${liesReps} tiros desde ${lie}, sin repetir el mismo lie dos tiros seguidos`,
      carga: lies,
      restSeconds: null,
      note: "En cancha nunca hay dos tiros iguales seguidos; practicar siempre desde tapete plano es una de las razones por las que el hándicap se estanca.",
    },
    {
      title: "Simulación de hoyos en el range",
      detail: `Juega ${hoyosSimulados} hoyos imaginarios: ${secuenciaHoyos}, cambiando de palo en cada tiro como en cancha real`,
      carga: hoyos,
      restSeconds: null,
      note: "Nada entrena mejor la toma de decisiones que jugar contra un marcador imaginario: cambiar de palo en cada tiro es la forma máxima de práctica intercalada, y además es literalmente cómo se juega un hoyo real.",
    },
    {
      title: "Cierre",
      detail: `${cierre} min: putts cortos de confianza`,
      carga: cierre,
      restSeconds: null,
      note: "Cerrar con lo fácil deja la sesión en positivo, en vez de terminar frustrado en la estación más difícil del día.",
    },
  ];
}

function sesion(input: PrescripcionInput): SesionDisciplina {
  const { nivel, isoWeek, ordinal, minutes, objetivo } = input;
  const { factor, deload } = factorDeSemana(isoWeek);
  const objetivoFactor = FACTOR_POR_OBJETIVO[objetivo];

  // El total real nunca pasa de lo que trajo el bloque, pero tampoco es
  // siempre ese máximo: igual que squash y running, cada nivel tiene su
  // propio techo de sostenimiento (`BASE_MINUTOS`), así que un principiante
  // en un bloque de 90 min practica menos que un avanzado en ese mismo
  // bloque — la sesión crece con el nivel, no solo con lo que el calendario
  // dejó libre.
  const total = Math.round(Math.min(minutes, BASE_MINUTOS[nivel] * factor * objetivoFactor));

  // La semilla mezcla semana y ordinal: semanas distintas rotan el contenido
  // (palo, distancias, lie, secuencia de hoyo), y si hay dos sesiones de golf
  // en la misma semana tampoco se repiten calcadas entre sí.
  const seed = isoWeek + ordinal;

  let blocks: BloqueSesion[];
  let focus: string;

  if (nivel === "PRINCIPIANTE") {
    const minutos = repartir(total, [0.15, 0.4, 0.3, 0.15]);
    blocks = bloquesPrincipiante(minutos, factor, objetivoFactor, seed);
    focus = "Fundamentos y contacto";
  } else if (nivel === "INTERMEDIO") {
    const minutos = repartir(total, [0.1, 0.35, 0.25, 0.2, 0.1]);
    blocks = bloquesIntermedio(minutos, factor, objetivoFactor, seed);
    focus = "Control de distancia";
  } else {
    const minutos = repartir(total, [0.1, 0.35, 0.2, 0.25, 0.1]);
    blocks = bloquesAvanzado(minutos, factor, objetivoFactor, seed, deload);
    focus = "Presión y simulación de juego";
  }

  const notes = [
    "Esta sesión entrena la habilidad, no suma a tu objetivo físico del perfil: es la disciplina en paralelo, el gimnasio sigue cargando con tu meta.",
    "Las estaciones cambian de palo y de distancia a propósito, en vez de vaciar la misma cubeta: repetir se siente mejor en el momento, pero intercalar es lo que se queda (Schmidt & Lee).",
  ];
  if (deload) notes.push("Semana de descarga: mismas estaciones, menos repeticiones por bloque.");
  const porObjetivo = notaDeObjetivo(objetivo);
  if (porObjetivo) notes.push(porObjetivo);

  return {
    discipline: "GOLF",
    nivel,
    focus,
    unidad: "min",
    cargaTotal: blocks.reduce((suma, bloque) => suma + (bloque.carga ?? 0), 0),
    minutes: total,
    blocks,
    deload,
    notes,
  };
}

export const GOLF: Prescriptor = {
  discipline: "GOLF",
  nombre: "Golf",
  niveles: [
    {
      nivel: "PRINCIPIANTE",
      descripcion: "Aprendiendo el swing. Grip, postura, contacto limpio y putts cortos con compuerta.",
    },
    {
      nivel: "INTERMEDIO",
      descripcion: "Ya juegas rondas. Control de distancia con wedges, putting en escalera y driver con objetivo.",
    },
    {
      nivel: "AVANZADO",
      descripcion: "Compites o buscas bajar el hándicap. Juegos de presión, lies variables y hoyos simulados.",
    },
  ],
  sesion,
};
