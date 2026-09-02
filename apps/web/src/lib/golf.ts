/**
 * Agregados puros de golf.
 *
 * No toca Prisma ni el reloj: recibe rondas y prácticas ya cargadas y
 * devuelve números. La misma entrada siempre produce la misma salida, así que
 * se prueba sin base de datos — igual que `lib/training/*`.
 *
 * **Por qué estas métricas y no "score promedio" a secas.** El análisis de
 * "strokes gained" de Mark Broadie (y las estadísticas que PGA Tour/USGA
 * llevan décadas publicando) coinciden en que el score final esconde DÓNDE se
 * fuga el juego. De las que sí se pueden capturar a mano después de una
 * ronda, cuatro cuentan la historia:
 *
 * - **GIR%** (greens en regulación) es, de las estadísticas de una ronda, la
 *   que mejor predice el score promedio — llegar al green "a la de reglamento"
 *   (en par-2 golpes o menos) resume en un solo número si el juego largo
 *   sostuvo la ronda.
 * - **Putts por ronda**: el tour promedia ~29, un amateur típico 32-38. Es la
 *   otra mitad de la historia que GIR% no cuenta: se puede llegar al green
 *   bien y aun así regalar la ronda en el green.
 * - **FIR%** (fairways) explica de dónde salió (o no) la oportunidad de GIR.
 * - **Castigos** (golpes de penalización) son golpes regalados fuera del
 *   juego normal — pelotas perdidas, agua, fuera de límites. Bajarlos no pide
 *   pegarle mejor, pide jugar más conservador.
 *
 * **Balance de práctica.** La evidencia del deporte (otra vez Broadie) es
 * consistente: el juego corto y el putting concentran alrededor del 60% de
 * los golpes de una ronda amateur, pero reciben una fracción de las horas de
 * práctica frente al range. Este módulo no corrige eso — solo lo hace
 * visible: si `balancePorTipo.RANGE` es 80% y el resto casi no aparece, la
 * desigualdad queda a la vista sin que la app tenga que sermonear.
 *
 * **Diferencial, no hándicap.** `diferencial()` es una aproximación honesta
 * al estilo hándicap —el promedio de las 3 mejores diferencias contra par de
 * las últimas 10 rondas—, NUNCA el cálculo oficial de la USGA/World Handicap
 * System (que pide slope y rating de cada campo, que esta app no tiene). Se
 * declara así en el nombre y en cada lugar donde se muestra: llamarlo
 * "hándicap" sería inventar precisión que esta app no puede sostener.
 *
 * **Lo que NO hace este módulo:** nada de detección de swing. v1 se apoya en
 * lo que Apple Watch ya mide en el workout de golf de Salud (pasos, distancia
 * caminada, calorías, pulso) — que es dato real y ya disponible. Un contador
 * de swings vía CoreMotion necesitaría calibrar umbrales con datos reales del
 * movimiento, y sin esos datos no se inventan: misma política que el conteo
 * de repeticiones del modo gimnasio. Queda como trabajo futuro explícito, no
 * como una promesa a medias en esta fase.
 */

/** Tipo de sesión de práctica: dónde se fue el tiempo fuera de la cancha. */
export const GOLF_PRACTICE_KINDS = ["RANGE", "JUEGO_CORTO", "PUTTING"] as const;
export type GolfPracticeKind = (typeof GOLF_PRACTICE_KINDS)[number];

/** Una ronda, aplanada a lo que este módulo necesita (mismos campos que `GolfRound`). */
export type GolfRoundInput = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** `9` o `18` en la práctica; `number` aquí porque este módulo no valida entrada, solo agrega (la validación 9|18 vive en `golf-schema.ts`). */
  holes: number;
  score: number;
  /** `null` = no se registró el par: esa ronda no entra a ningún promedio "vs par". */
  par: number | null;
  putts: number | null;
  fairwaysHit: number | null;
  fairwaysTotal: number | null;
  girHit: number | null;
  penalties: number | null;
};

/** Una sesión de práctica, aplanada (mismos campos que `GolfPractice`). */
export type GolfPracticeInput = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** `string` porque `GolfPractice.kind` en la base es texto libre, no un enum de Prisma; la validación de los tres valores vive en `golf-schema.ts`. */
  kind: string;
  minutes: number;
  balls: number | null;
};

export type TendenciaGolf = "MEJORANDO" | "ESTABLE" | "EMPEORANDO";

export type GolfAggregates = {
  /** Cuántas rondas se usaron para este cálculo. */
  rondas: number;
  /**
   * Promedio de `score - par`. `null` cuando ninguna ronda de esa ventana
   * trae `par` — no se inventa un promedio con denominador cero.
   */
  scoreVsPar: { ultimas5: number | null; todas: number | null };
  /** % de greens en regulación. `null` sin ninguna ronda con `girHit`. */
  girPct: number | null;
  /** % de fairways embocados. `null` sin ninguna ronda con ambos campos. */
  firPct: number | null;
  puttsPromedio: number | null;
  castigosPromedio: number | null;
  /**
   * Comparación de la primera mitad de las rondas (con par) contra la
   * segunda. `null` con menos de `MIN_RONDAS_PARA_TENDENCIA` rondas
   * utilizables: dos rondas no son una tendencia, son dos rondas.
   */
  tendencia: TendenciaGolf | null;
  /**
   * Aproximación estilo hándicap — ver el docblock del módulo. `null` con
   * menos de 3 rondas con par en las últimas 10.
   */
  diferencial: number | null;
  practica: {
    totalMinutos: number;
    /** % del tiempo total por tipo, solo los tipos con minutos > 0. */
    balancePorTipo: Partial<Record<GolfPracticeKind, number>>;
  };
};

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

function round1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/** Rondas en orden cronológico (más vieja primero). */
function ordenarPorFecha(rondas: GolfRoundInput[]): GolfRoundInput[] {
  return [...rondas].sort((a, b) => a.date.localeCompare(b.date));
}

/** `score - par` de cada ronda que sí trae `par`, en el orden de entrada. */
function diferenciasVsPar(rondas: GolfRoundInput[]): number[] {
  return rondas.filter((ronda) => ronda.par !== null).map((ronda) => ronda.score - ronda.par!);
}

/**
 * Promedio de `score - par` de las últimas `ultimasN` rondas (o todas si no
 * se pasa). "Últimas N" son las N rondas más recientes por fecha, tengan o
 * no `par` — dentro de esas, solo las que sí lo traen entran al promedio.
 */
function promedioVsPar(rondas: GolfRoundInput[], ultimasN?: number): number | null {
  const ordenadas = ordenarPorFecha(rondas);
  const ventana = ultimasN !== undefined ? ordenadas.slice(-ultimasN) : ordenadas;
  const promedio = media(diferenciasVsPar(ventana));
  return promedio === null ? null : round1(promedio);
}

function girPct(rondas: GolfRoundInput[]): number | null {
  const conDato = rondas.filter((ronda) => ronda.girHit !== null);
  if (conDato.length === 0) return null;

  const hits = conDato.reduce((suma, ronda) => suma + ronda.girHit!, 0);
  const holes = conDato.reduce((suma, ronda) => suma + ronda.holes, 0);
  if (holes === 0) return null; // no debería pasar (holes es 9|18), pero no se divide entre cero

  return round1((hits / holes) * 100);
}

function firPct(rondas: GolfRoundInput[]): number | null {
  const conDato = rondas.filter(
    (ronda) => ronda.fairwaysHit !== null && ronda.fairwaysTotal !== null && ronda.fairwaysTotal > 0,
  );
  if (conDato.length === 0) return null;

  const hits = conDato.reduce((suma, ronda) => suma + ronda.fairwaysHit!, 0);
  const total = conDato.reduce((suma, ronda) => suma + ronda.fairwaysTotal!, 0);
  if (total === 0) return null;

  return round1((hits / total) * 100);
}

function puttsPromedio(rondas: GolfRoundInput[]): number | null {
  const promedio = media(rondas.filter((ronda) => ronda.putts !== null).map((ronda) => ronda.putts!));
  return promedio === null ? null : round1(promedio);
}

function castigosPromedio(rondas: GolfRoundInput[]): number | null {
  const promedio = media(
    rondas.filter((ronda) => ronda.penalties !== null).map((ronda) => ronda.penalties!),
  );
  return promedio === null ? null : round1(promedio);
}

/** Con menos rondas utilizables que esto, no hay mitades que valgan la pena comparar. */
const MIN_RONDAS_PARA_TENDENCIA = 4;
/** Golpes de diferencia entre mitades para dejar de llamarlo "estable". */
const UMBRAL_TENDENCIA = 0.5;

/**
 * Compara el promedio de `score - par` de la primera mitad de las rondas
 * utilizables contra la segunda, en orden cronológico. Con longitud impar, la
 * ronda de en medio no cuenta para ninguna mitad — repartirla a cualquiera de
 * los dos lados sesgaría la comparación sin razón para preferir un lado.
 */
function tendencia(rondas: GolfRoundInput[]): TendenciaGolf | null {
  const diffs = diferenciasVsPar(ordenarPorFecha(rondas));
  if (diffs.length < MIN_RONDAS_PARA_TENDENCIA) return null;

  const mitad = Math.floor(diffs.length / 2);
  const primeraMitad = diffs.slice(0, mitad);
  const segundaMitad = diffs.slice(-mitad);

  const delta = media(segundaMitad)! - media(primeraMitad)!;
  if (delta <= -UMBRAL_TENDENCIA) return "MEJORANDO"; // score vs par bajó: mejor
  if (delta >= UMBRAL_TENDENCIA) return "EMPEORANDO";
  return "ESTABLE";
}

/** Ventana y tamaño del "diferencial" — ver el docblock del módulo. */
const DIFERENCIAL_VENTANA = 10;
const DIFERENCIAL_MEJORES = 3;

function diferencial(rondas: GolfRoundInput[]): number | null {
  const ultimas = ordenarPorFecha(rondas).slice(-DIFERENCIAL_VENTANA);
  const diffs = diferenciasVsPar(ultimas).sort((a, b) => a - b);
  if (diffs.length < DIFERENCIAL_MEJORES) return null;

  return round1(media(diffs.slice(0, DIFERENCIAL_MEJORES))!);
}

function balancePractica(practicas: GolfPracticeInput[]): GolfAggregates["practica"] {
  const totalMinutos = practicas.reduce((suma, practica) => suma + practica.minutes, 0);
  if (totalMinutos === 0) return { totalMinutos: 0, balancePorTipo: {} };

  const balancePorTipo: Partial<Record<GolfPracticeKind, number>> = {};
  for (const kind of GOLF_PRACTICE_KINDS) {
    const minutos = practicas
      .filter((practica) => practica.kind === kind)
      .reduce((suma, practica) => suma + practica.minutes, 0);
    if (minutos > 0) balancePorTipo[kind] = Math.round((minutos / totalMinutos) * 100);
  }

  return { totalMinutos, balancePorTipo };
}

/** Todos los agregados de golf, a partir de las rondas y prácticas que se le pasen. */
export function calcularAgregadosGolf(
  rondas: GolfRoundInput[],
  practicas: GolfPracticeInput[],
): GolfAggregates {
  return {
    rondas: rondas.length,
    scoreVsPar: {
      ultimas5: promedioVsPar(rondas, 5),
      todas: promedioVsPar(rondas),
    },
    girPct: girPct(rondas),
    firPct: firPct(rondas),
    puttsPromedio: puttsPromedio(rondas),
    castigosPromedio: castigosPromedio(rondas),
    tendencia: tendencia(rondas),
    diferencial: diferencial(rondas),
    practica: balancePractica(practicas),
  };
}
