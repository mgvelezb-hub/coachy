import { compatibilidad, ordenar, repartirMinutos, type BloqueDia } from "@/lib/training/combinaciones";
import { WEEK_DAYS, type WeekDay } from "@/lib/training/split";
import type { Discipline } from "@/lib/training/types";

/**
 * Rearmar la semana desde cero — lógica PURA.
 *
 * Es lo que corre cuando alguien dice "empecemos de nuevo": se le pregunta
 * cuánto tiempo tiene cada día, qué disciplina manda, cuáles acompañan y para
 * qué sirve cada una, y de ahí sale un reparto que **cabe de verdad**.
 *
 * Las tres reglas que lo hacen distinto de repartir a ojo:
 *
 * 1. **El tiempo del día es un techo, no una sugerencia.** Si el martes hay
 *    una hora, no caben gimnasio, alberca y squash: la app lo dice y reparte
 *    lo que sí cabe, en vez de armar una semana que se abandona el jueves.
 * 2. **El propósito cambia cuánto pesa cada disciplina.** Lo que se entrena en
 *    serio pide sesiones completas; un pasatiempo pide un hueco, no un plan.
 * 3. **La primaria nunca se queda sin semana.** Es la que arma el esqueleto;
 *    las demás caen alrededor.
 *
 * Lo que NO hace: inventar sesiones de disciplinas que no sabemos prescribir.
 * Reserva el día y dice para qué es, igual que el planificador semanal.
 *
 * **Fase 9 — antes de decir "no cupo".** Lo que no encontró día propio no se
 * da por perdido de inmediato: primero intenta anexarse como segundo bloque a
 * un día YA asignado (de la primaria o de otra secundaria), usando
 * `combinaciones.ts` para decidir si de verdad conviven y cuánto tiempo le
 * toca a cada una del tiempo real de ese día. Solo si tampoco hay ahí un
 * hueco compatible se avisa. Este módulo no conoce el `DayKind` del gimnasio
 * (eso lo decide `buildSplit` más tarde, cuando ya se generó la semana), así
 * que la regla de "nada de alto impacto en día de pierna" no aplica aquí —
 * las demás reglas duras de `compatibilidad` (misma disciplina, CrossFit con
 * gimnasio, squash+box) sí.
 */

export const PROPOSITOS = ["ENTRENAMIENTO", "COMPLEMENTO", "HOBBY"] as const;
export type Proposito = (typeof PROPOSITOS)[number];

/**
 * Cuánto pesa cada propósito al repartir el presupuesto.
 *
 * No son porcentajes: son pesos relativos. Lo que se entrena en serio vale el
 * triple que un pasatiempo, y el complemento —lo que se hace para sostener lo
 * demás: movilidad, cardio suave— queda en medio.
 */
const PESO_POR_PROPOSITO: Record<Proposito, number> = {
  ENTRENAMIENTO: 3,
  COMPLEMENTO: 2,
  HOBBY: 1,
};

/**
 * Minutos que pide una sesión digna de cada propósito.
 *
 * Por debajo de esto la sesión deja de valer la pena: media hora de gimnasio
 * es una sesión corta, quince minutos es un calentamiento.
 */
const MINUTOS_MINIMOS: Record<Proposito, number> = {
  ENTRENAMIENTO: 45,
  COMPLEMENTO: 30,
  HOBBY: 30,
};

export type DisciplinaElegida = {
  discipline: Discipline;
  proposito: Proposito;
  /** 1 a 3: cuánto quiere la persona que pese, dentro de su propósito. */
  importancia: number;
};

export type TiempoPorDia = Record<WeekDay, number>;

export type EntradaReplan = {
  /** Minutos disponibles cada día. 0 = ese día no se entrena. */
  tiempo: TiempoPorDia;
  primaria: Discipline;
  /** Las demás. La primaria no se repite aquí. */
  secundarias: DisciplinaElegida[];
  /** Cuántas sesiones de la primaria quiere a la semana, como tope deseado. */
  sesionesPrimaria: number;
};

export type SesionAsignada = {
  weekday: WeekDay;
  discipline: Discipline;
  minutos: number;
  esPrimaria: boolean;
};

export type Replan = {
  asignadas: SesionAsignada[];
  /**
   * Sesiones por disciplina, listo para guardar en el perfil. La primaria
   * sale sin `proposito`/`importancia` — esos dos campos son de las
   * secundarias, lo que la persona contestó al elegirlas (`secundarias` en
   * `EntradaReplan`). Guardarlos aquí es lo que evita que la próxima
   * recalibración tenga que adivinar la importancia contando sesiones.
   */
  cargas: Array<{
    discipline: Discipline;
    sessionsPerWeek: number;
    proposito?: Proposito;
    importancia?: number;
  }>;
  /** Días que quedaron con entrenamiento. */
  diasActivos: WeekDay[];
  /**
   * Lo que no cupo y por qué. Se dice siempre: un plan que recorta en silencio
   * hace pensar que la app se equivocó.
   */
  avisos: string[];
};

/** Los días con tiempo suficiente para algo, del que más tiene al que menos. */
function diasUtiles(tiempo: TiempoPorDia, minimo: number): WeekDay[] {
  return WEEK_DAYS.filter((dia) => (tiempo[dia] ?? 0) >= minimo);
}

/**
 * Cuántas sesiones le tocan a cada secundaria.
 *
 * Se reparte por peso —propósito × importancia— sobre los días que sobran
 * después de la primaria. Redondear hacia abajo es deliberado: es mejor que
 * sobre un día libre a que la semana pida más de lo que hay.
 */
function repartirSecundarias(
  secundarias: DisciplinaElegida[],
  huecos: number,
): Array<{ discipline: Discipline; sesiones: number; proposito: Proposito }> {
  if (secundarias.length === 0 || huecos <= 0) {
    return secundarias.map((entrada) => ({
      discipline: entrada.discipline,
      sesiones: 0,
      proposito: entrada.proposito,
    }));
  }

  const pesos = secundarias.map((entrada) => ({
    entrada,
    peso: PESO_POR_PROPOSITO[entrada.proposito] * Math.max(1, Math.min(3, entrada.importancia)),
  }));
  const total = pesos.reduce((suma, actual) => suma + actual.peso, 0);

  const repartido = pesos.map(({ entrada, peso }) => ({
    discipline: entrada.discipline,
    proposito: entrada.proposito,
    sesiones: Math.floor((huecos * peso) / total),
  }));

  // Lo que sobró por redondear va a la de mayor peso: repartirlo "parejo"
  // acabaría dándole una sesión a un pasatiempo antes que a lo que se entrena.
  let restante = huecos - repartido.reduce((suma, actual) => suma + actual.sesiones, 0);
  const orden = [...pesos].sort((a, b) => b.peso - a.peso);
  let indice = 0;
  while (restante > 0 && orden.length > 0) {
    const objetivo = orden[indice % orden.length]!.entrada.discipline;
    const fila = repartido.find((entrada) => entrada.discipline === objetivo);
    if (fila) fila.sesiones += 1;
    restante -= 1;
    indice += 1;
  }

  return repartido;
}

/**
 * Intenta anexar `discipline` como segundo bloque a un día que ya tiene una
 * sesión asignada (de la primaria o de otra secundaria).
 *
 * Entre todos los días ya ocupados y sin su segundo bloque, se queda con el
 * de mejor `compatibilidad` — y solo si `repartirMinutos` alcanza con el
 * tiempo real de ese día (`tiempo[dia]`, no una suma de valores por defecto:
 * aquí sí se sabe cuánto tiempo hay de verdad). Si combina, la sesión del
 * ocupante original se actualiza con su minutaje real; la nueva se agrega con
 * el mismo `weekday`.
 */
function intentarAnexarEnDia(
  discipline: Discipline,
  tiempo: TiempoPorDia,
  asignadas: SesionAsignada[],
  diasConDosBloques: Set<WeekDay>,
): boolean {
  const nuevo: BloqueDia = { discipline };

  // Un weekday puede ya traer una o dos sesiones; solo el primer ocupante
  // cuenta para decidir si cabe un segundo bloque — un tercero nunca se
  // ofrece.
  const primerOcupantePorDia = new Map<WeekDay, SesionAsignada>();
  for (const sesion of asignadas) {
    if (!primerOcupantePorDia.has(sesion.weekday)) primerOcupantePorDia.set(sesion.weekday, sesion);
  }

  let mejor: {
    ocupante: SesionAsignada;
    orden: [BloqueDia, BloqueDia];
    minutos: [number, number];
    score: number;
  } | null = null;

  for (const [dia, ocupante] of primerOcupantePorDia) {
    if (diasConDosBloques.has(dia)) continue;

    const existente: BloqueDia = { discipline: ocupante.discipline };
    const score = compatibilidad(existente, nuevo);
    if (score === null) continue;

    const orden = ordenar(existente, nuevo);
    const reparto = repartirMinutos(tiempo[dia] ?? 0, orden);
    if (!reparto) continue;

    if (!mejor || score > mejor.score) {
      mejor = { ocupante, orden, minutos: reparto.minutos, score };
    }
  }

  if (!mejor) return false;

  diasConDosBloques.add(mejor.ocupante.weekday);
  const [primero] = mejor.orden;
  const nuevoEsPrimero = primero.discipline === discipline;

  mejor.ocupante.minutos = nuevoEsPrimero ? mejor.minutos[1] : mejor.minutos[0];
  asignadas.push({
    weekday: mejor.ocupante.weekday,
    discipline,
    minutos: nuevoEsPrimero ? mejor.minutos[0] : mejor.minutos[1],
    esPrimaria: false,
  });

  return true;
}

/**
 * El reparto de la semana.
 *
 * Primero la primaria toma los días que le alcanzan; lo que queda se reparte
 * entre las secundarias por peso. Un día lleva una sola sesión salvo que dos
 * disciplinas combinen de verdad (Fase 9): compatibles según
 * `combinaciones.ts` y con tiempo real para los mínimos de ambas más la
 * transición. Una tercera nunca se ofrece — combinar es la excepción que
 * evita perder una sesión, no la norma.
 */
export function replanificar(entrada: EntradaReplan): Replan {
  const avisos: string[] = [];

  const minimoPrimaria = MINUTOS_MINIMOS.ENTRENAMIENTO;
  const disponiblesPrimaria = diasUtiles(entrada.tiempo, minimoPrimaria);

  const sesionesPrimaria = Math.max(
    0,
    Math.min(entrada.sesionesPrimaria, disponiblesPrimaria.length),
  );

  if (sesionesPrimaria < entrada.sesionesPrimaria) {
    avisos.push(
      `Pediste ${entrada.sesionesPrimaria} sesiones de ${entrada.primaria.toLowerCase()} y solo ` +
        `${disponiblesPrimaria.length} de tus días tienen al menos ${minimoPrimaria} minutos.`,
    );
  }

  // La primaria se lleva los días con más tiempo: es la que más pide.
  const ordenadosPorTiempo = [...disponiblesPrimaria].sort(
    (a, b) => (entrada.tiempo[b] ?? 0) - (entrada.tiempo[a] ?? 0),
  );
  const diasPrimaria = new Set(ordenadosPorTiempo.slice(0, sesionesPrimaria));

  const asignadas: SesionAsignada[] = WEEK_DAYS.filter((dia) => diasPrimaria.has(dia)).map((dia) => ({
    weekday: dia,
    discipline: entrada.primaria,
    minutos: entrada.tiempo[dia] ?? 0,
    esPrimaria: true,
  }));

  const librePorDia = WEEK_DAYS.filter((dia) => !diasPrimaria.has(dia));
  const reparto = repartirSecundarias(
    entrada.secundarias,
    librePorDia.filter((dia) => (entrada.tiempo[dia] ?? 0) >= MINUTOS_MINIMOS.HOBBY).length,
  );

  // Cada secundaria toma sus días entre los que le alcanzan, empezando por los
  // que menos tiempo tienen: los días largos se dejan para lo que pide más.
  const tomados = new Set<WeekDay>();
  // Días que ya combinaron dos disciplinas: no se ofrece un tercer bloque.
  const diasConDosBloques = new Set<WeekDay>();
  for (const fila of reparto) {
    const minimo = MINUTOS_MINIMOS[fila.proposito];
    const candidatos = librePorDia
      .filter((dia) => !tomados.has(dia) && (entrada.tiempo[dia] ?? 0) >= minimo)
      .sort((a, b) => (entrada.tiempo[a] ?? 0) - (entrada.tiempo[b] ?? 0));

    const cabe = Math.min(fila.sesiones, candidatos.length);

    for (const dia of candidatos.slice(0, cabe)) {
      tomados.add(dia);
      asignadas.push({
        weekday: dia,
        discipline: fila.discipline,
        minutos: entrada.tiempo[dia] ?? 0,
        esPrimaria: false,
      });
    }

    // Lo que no encontró día propio intenta anexarse a uno ya asignado antes
    // de darlo por perdido — ver el docblock del módulo.
    let anexadas = 0;
    for (let restante = fila.sesiones - cabe; restante > 0; restante--) {
      const anexada = intentarAnexarEnDia(fila.discipline, entrada.tiempo, asignadas, diasConDosBloques);
      if (!anexada) break; // si ya no combinó en ningún lado, un intento más tampoco lo hará.
      anexadas += 1;
    }

    const totalColocadas = cabe + anexadas;
    if (totalColocadas < fila.sesiones) {
      avisos.push(
        `${fila.discipline.toLowerCase()} se queda en ${totalColocadas} ${totalColocadas === 1 ? "sesión" : "sesiones"}: ` +
          `no hay más días con al menos ${minimo} minutos libres, ni un día ya asignado con el que combine.`,
      );
    }
  }

  const porDisciplina = new Map<Discipline, number>();
  for (const sesion of asignadas) {
    porDisciplina.set(sesion.discipline, (porDisciplina.get(sesion.discipline) ?? 0) + 1);
  }

  // Lo que la persona contestó al elegir cada secundaria, para hilarlo hasta
  // `cargas` y que sobreviva en el perfil (ver el docblock de `Replan`).
  const eleccionPorDisciplina = new Map(
    entrada.secundarias.map((elegida) => [elegida.discipline, elegida] as const),
  );

  const ordenadas = asignadas.sort(
    (a, b) => WEEK_DAYS.indexOf(a.weekday) - WEEK_DAYS.indexOf(b.weekday),
  );

  if (ordenadas.length === 0) {
    avisos.push(
      `Ninguno de tus días llega a ${MINUTOS_MINIMOS.HOBBY} minutos. Con menos que eso no hay ` +
        "sesión que valga la pena: conviene juntar el tiempo en menos días.",
    );
  }

  return {
    asignadas: ordenadas,
    cargas: [...porDisciplina.entries()].map(([discipline, sessionsPerWeek]) => {
      const elegida = eleccionPorDisciplina.get(discipline);
      return {
        discipline,
        sessionsPerWeek,
        ...(elegida ? { proposito: elegida.proposito, importancia: elegida.importancia } : {}),
      };
    }),
    diasActivos: [...new Set(ordenadas.map((sesion) => sesion.weekday))],
    avisos,
  };
}

/**
 * El horario que entiende el generador, a partir del reparto.
 *
 * `trainingSchedule` guarda un momento del día por jornada; aquí solo se
 * distingue entrenar de descansar, porque a qué hora se entrena lo declara la
 * persona aparte y no debe reescribirse al replanificar.
 */
export function horarioDesde(
  replan: Replan,
  horaPreferida: string,
): Record<WeekDay, string> {
  const activos = new Set(replan.diasActivos);
  return Object.fromEntries(
    WEEK_DAYS.map((dia) => [dia, activos.has(dia) ? horaPreferida : "DESCANSO"]),
  ) as Record<WeekDay, string>;
}
