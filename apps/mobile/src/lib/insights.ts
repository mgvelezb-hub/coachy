/**
 * Lecturas de los datos de salud — lógica PURA, sin red ni React.
 *
 * Qué es esto: la frase que acompaña a cada dato en su pantalla de detalle.
 * Dice si la tendencia va hacia el objetivo de la persona y qué hacer esta
 * semana. Nada de esto es un diagnóstico ni una prescripción médica: son
 * comparaciones de promedios contra el objetivo declarado en el perfil.
 *
 * Reglas de tono (metodología del coach): se normaliza, nunca se regaña. Un
 * mal dato se dice tal cual, con la salida al lado, y sin adjetivos sobre la
 * persona.
 *
 * Reglas de honestidad: sin datos suficientes NO se inventa tendencia. Un
 * promedio de 2 días no describe una semana, y decirlo es mejor que rellenar.
 */

import type { CheckInRow, HealthDayPayload } from "@/lib/api";

export type Trend = "buena" | "estable" | "atencion" | "sin_datos";

export type Insight = {
  trend: Trend;
  /** Una línea: qué está pasando. */
  headline: string;
  /** El porqué, con los números que lo sostienen. */
  detail: string;
  /** Qué hacer esta semana. Concreto y chico, o `null` si no toca hacer nada. */
  recomendacion: string | null;
};

/** Objetivos del perfil (enum `Goal` en el schema). */
export type Goal = "RECOMPOSICION" | "PERDIDA_GRASA" | "GANANCIA_MUSCULO" | "SALUD" | "RENDIMIENTO";

export const GOAL_LABEL: Record<Goal, string> = {
  RECOMPOSICION: "recomposición",
  PERDIDA_GRASA: "pérdida de grasa",
  GANANCIA_MUSCULO: "ganancia de músculo",
  SALUD: "salud",
  RENDIMIENTO: "rendimiento",
};

/** Objetivos donde bajar grasa es el punto: la cintura manda sobre la báscula. */
function buscaBajarGrasa(goal: string): boolean {
  return goal === "PERDIDA_GRASA" || goal === "RECOMPOSICION";
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Días ordenados del más reciente al más viejo. No muta el arreglo original. */
function recientesPrimero<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date));
}

function promedio(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Los valores presentes de un campo, en una ventana de días. */
function ventana(
  days: HealthDayPayload[],
  field: "steps" | "sleepMin" | "activeKcal" | "exerciseMin" | "restingHr",
  desde: number,
  hasta: number,
): number[] {
  return recientesPrimero(days)
    .slice(desde, hasta)
    .map((day) => day[field])
    .filter((value): value is number => value !== null && value !== undefined);
}

/** Mínimo de días con dato para hablar de un promedio semanal. */
const MIN_DIAS = 3;

export function formatSleep(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

/**
 * Bandas de actividad por pasos diarios (cortes de uso común en la literatura,
 * Tudor-Locke). Son los mismos que usa el motor en el servidor para ajustar el
 * gasto: <5k sedentario, 5-8k poco activo, 8-12k activo, 12k+ muy activo.
 */
export const BANDAS = [
  { min: 12_000, nombre: "muy activo" },
  { min: 8_000, nombre: "activo" },
  { min: 5_000, nombre: "ligero" },
  { min: 0, nombre: "sedentario" },
] as const;

export function bandaDePasos(pasos: number): { nombre: string; siguiente: number | null } {
  const index = BANDAS.findIndex((banda) => pasos >= banda.min);
  const banda = BANDAS[index] ?? BANDAS[BANDAS.length - 1]!;
  const siguiente = index > 0 ? BANDAS[index - 1]!.min : null;
  return { nombre: banda.nombre, siguiente };
}

/** Ritmo de caminata para traducir pasos en minutos: ~100 pasos por minuto. */
const PASOS_POR_MINUTO = 100;

export function stepsInsight(days: HealthDayPayload[], goal: string): Insight {
  const semana = ventana(days, "steps", 0, 7);
  const previa = ventana(days, "steps", 7, 14);

  if (semana.length < MIN_DIAS) {
    return {
      trend: "sin_datos",
      headline: "Todavía no hay semana que leer",
      detail: `El reloj trae ${semana.length} ${semana.length === 1 ? "día" : "días"} con pasos. Con 3 o más ya se puede hablar de un promedio.`,
      recomendacion: "Trae el reloj puesto los días normales, no solo cuando entrenas: lo que se mide es tu vida diaria.",
    };
  }

  const actual = Math.round(promedio(semana)!);
  const anterior = promedio(previa);
  const banda = bandaDePasos(actual);
  const delta = anterior === null ? null : actual - Math.round(anterior);

  const trend: Trend =
    delta === null ? "estable" : delta >= 500 ? "buena" : delta <= -500 ? "atencion" : "estable";

  const comparacion =
    delta === null
      ? "Es tu primera semana completa, así que todavía no hay contra qué compararla."
      : delta >= 500
        ? `Son ${delta.toLocaleString("es-MX")} pasos más al día que la semana pasada.`
        : delta <= -500
          ? `Son ${Math.abs(delta).toLocaleString("es-MX")} pasos menos al día que la semana pasada.`
          : "Prácticamente lo mismo que la semana pasada.";

  const headline =
    trend === "buena"
      ? "Vas moviéndote más"
      : trend === "atencion"
        ? "Bajó tu movimiento diario"
        : `Tu semana está en "${banda.nombre}"`;

  let recomendacion: string | null = null;
  if (banda.siguiente !== null && buscaBajarGrasa(goal)) {
    const faltan = banda.siguiente - actual;
    const minutos = Math.round(faltan / PASOS_POR_MINUTO);
    recomendacion = `Te faltan ${faltan.toLocaleString("es-MX")} pasos al día para entrar en "${bandaDePasos(banda.siguiente).nombre}": unos ${minutos} minutos de caminata. Es el gasto más barato que tienes, no te cuesta entrenamiento ni comida.`;
  } else if (banda.siguiente === null) {
    recomendacion = "Ya estás en la banda más alta. Sostenerla vale más que subirle.";
  } else if (goal === "GANANCIA_MUSCULO") {
    recomendacion = "Para ganar músculo no hace falta subirle a los pasos: sostén los que traes y que la energía se vaya al entrenamiento.";
  } else {
    recomendacion = `Mantén el promedio arriba de ${banda.siguiente.toLocaleString("es-MX")} pasos y el resto lo hace el entrenamiento.`;
  }

  return {
    trend,
    headline,
    detail: `Promedio de ${actual.toLocaleString("es-MX")} pasos al día en ${semana.length} ${semana.length === 1 ? "día" : "días"}. ${comparacion}`,
    recomendacion,
  };
}

// ---------------------------------------------------------------------------
// Descanso
// ---------------------------------------------------------------------------

/** Debajo de esto la semana se marca; arriba de 7 h se considera buena. */
const SUENO_MINIMO_MIN = 6 * 60;
const SUENO_BUENO_MIN = 7 * 60;

export function sleepInsight(days: HealthDayPayload[], goal: string): Insight {
  const semana = ventana(days, "sleepMin", 0, 7);

  if (semana.length < MIN_DIAS) {
    return {
      trend: "sin_datos",
      headline: "Faltan noches registradas",
      detail: `El reloj trae ${semana.length} ${semana.length === 1 ? "noche" : "noches"} con sueño. Con 3 o más ya se puede leer la semana.`,
      recomendacion: "Duerme con el reloj puesto aunque sea unas noches: sin eso, el sueño es el único dato que nadie puede reconstruir después.",
    };
  }

  const actual = Math.round(promedio(semana)!);
  const cortas = semana.filter((minutos) => minutos < SUENO_MINIMO_MIN).length;

  const trend: Trend =
    actual >= SUENO_BUENO_MIN ? "buena" : actual < SUENO_MINIMO_MIN ? "atencion" : "estable";

  const headline =
    trend === "buena"
      ? "Estás durmiendo bien"
      : trend === "atencion"
        ? "Estás durmiendo poco"
        : "Te falta poco para las 7 horas";

  const detalleCortas =
    cortas === 0
      ? "Ninguna noche por debajo de 6 horas."
      : `${cortas} ${cortas === 1 ? "noche" : "noches"} por debajo de 6 horas.`;

  let recomendacion: string | null = null;
  if (trend !== "buena") {
    const faltan = SUENO_BUENO_MIN - actual;
    recomendacion = buscaBajarGrasa(goal)
      ? `Te faltan ${faltan} minutos para las 7 horas. Dormir poco te sube el hambre al día siguiente, así que esos minutos te cuestan menos que aguantar el antojo: acuéstate 30 minutos antes tres noches de esta semana.`
      : `Te faltan ${faltan} minutos para las 7 horas. El músculo se construye dormido, no en la serie: acuéstate 30 minutos antes tres noches de esta semana.`;
  } else {
    recomendacion = "Sostén el horario. Dormir parejo vale más que una noche larga de vez en cuando.";
  }

  return {
    trend,
    headline,
    detail: `Promedio de ${formatSleep(actual)} por noche en ${semana.length} ${semana.length === 1 ? "noche" : "noches"}. ${detalleCortas}`,
    recomendacion,
  };
}

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

/** Movimiento de cinta por debajo de esto es ruido de medición, no cambio. */
const CINTURA_RUIDO_CM = 0.5;

export function measuresInsight(checkIns: CheckInRow[], goal: string): Insight {
  const conCintura = recientesPrimero(checkIns).filter((row) => row.waistCm !== null);

  if (conCintura.length === 0) {
    return {
      trend: "sin_datos",
      headline: "Sin cintura registrada",
      detail: "La cintura es la medida que más dice cuando el peso no se mueve. Todavía no hay ninguna.",
      recomendacion: "Mídete a la altura del ombligo, en ayunas y sin apretar la cinta. Siempre igual: el criterio importa más que el número.",
    };
  }

  const ultimo = conCintura[0]!;
  const cinturaHoy = ultimo.waistCm!;

  if (conCintura.length === 1) {
    return {
      trend: "sin_datos",
      headline: "Este es tu punto de partida",
      detail: `${cinturaHoy} cm de cintura el ${ultimo.date}. Con el siguiente check-in ya hay tendencia.`,
      recomendacion: "Mide siempre igual —misma hora, mismo punto, misma tensión de cinta— o la tendencia va a medir tu método, no tu cuerpo.",
    };
  }

  const anterior = conCintura[1]!;
  const primero = conCintura[conCintura.length - 1]!;
  const delta = cinturaHoy - anterior.waistCm!;
  const deltaTotal = cinturaHoy - primero.waistCm!;

  const baja = delta <= -CINTURA_RUIDO_CM;
  const sube = delta >= CINTURA_RUIDO_CM;

  const pesoHoy = ultimo.weightKg;
  const pesoAntes = anterior.weightKg;
  const deltaPeso = pesoHoy !== null && pesoAntes !== null ? pesoHoy - pesoAntes : null;

  let trend: Trend;
  let headline: string;

  if (buscaBajarGrasa(goal)) {
    trend = baja ? "buena" : sube ? "atencion" : "estable";
    headline = baja
      ? "La cintura va bajando"
      : sube
        ? "La cintura subió"
        : "La cintura está estable";
  } else if (goal === "GANANCIA_MUSCULO") {
    // Subir peso con cintura quieta es exactamente lo que se busca aquí.
    const pesoSube = deltaPeso !== null && deltaPeso > 0;
    trend = pesoSube && !sube ? "buena" : sube ? "atencion" : "estable";
    headline = pesoSube && !sube
      ? "Subes peso sin subir cintura"
      : sube
        ? "La cintura está subiendo"
        : "Todo estable";
  } else {
    trend = sube ? "atencion" : "estable";
    headline = sube ? "La cintura subió" : "La cintura está estable";
  }

  const signo = (value: number, unidad: string) =>
    `${value > 0 ? "+" : ""}${value.toFixed(1)} ${unidad}`;

  const partes = [
    `${cinturaHoy} cm hoy, ${signo(delta, "cm")} contra tu check-in anterior`,
    `${signo(deltaTotal, "cm")} desde ${primero.date}`,
  ];
  if (deltaPeso !== null) partes.push(`peso ${signo(deltaPeso, "kg")}`);

  let recomendacion: string | null = null;
  if (buscaBajarGrasa(goal)) {
    if (baja && deltaPeso !== null && Math.abs(deltaPeso) < 0.3) {
      recomendacion = "Cintura abajo con la báscula quieta es recomposición: estás cambiando grasa por músculo. No le muevas nada al plan esta semana.";
    } else if (baja) {
      recomendacion = "Va hacia donde quieres. Sostén las calorías y la proteína tal como están: lo que funciona no se toca.";
    } else if (sube) {
      recomendacion = "Antes de cambiar el plan, revisa que la medición sea comparable (misma hora, en ayunas) y cuenta cuántos días cumpliste de verdad. Una semana no es una tendencia.";
    } else {
      recomendacion = "Una semana estable no es una semana perdida. Si se repite dos veces seguidas, ahí sí toca ajustar calorías o subir pasos.";
    }
  } else if (goal === "GANANCIA_MUSCULO") {
    recomendacion = sube
      ? "La cintura subiendo dice que parte de lo que ganas es grasa. Baja un poco el excedente antes de que se vuelva un ciclo largo."
      : "Sostén el excedente y la proteína. Subir despacio es lo que hace que lo ganado sea músculo.";
  } else {
    recomendacion = "Con este objetivo la cintura es un semáforo, no una meta: mientras no suba, vas bien.";
  }

  return { trend, headline, detail: `${partes.join(" · ")}.`, recomendacion };
}
