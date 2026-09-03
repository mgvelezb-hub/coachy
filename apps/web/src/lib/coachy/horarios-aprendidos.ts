/**
 * Aprendizaje semanal de horarios: propone, nunca escribe.
 *
 * EL PROBLEMA: los horarios de comida los pone la persona una vez, en
 * Ajustes, y ahí se quedan aunque en la práctica coma sistemáticamente a
 * otra hora — el recordatorio sigue disparando a las 14:30 mientras ella come
 * a las 15:20 todos los miércoles, y con el tiempo deja de contestarlo porque
 * nunca coincide con el momento real.
 *
 * Esto mira las últimas semanas de `MealLog` (hora planeada vs. hora real
 * confirmada) y, cuando el patrón es consistente y grande, arma una
 * propuesta de horario nuevo. Nunca la aplica sola: la propuesta se enseña
 * como tarjeta accionable y la persona decide.
 *
 * Separa entre semana y fin de semana porque son rutinas distintas — nadie
 * come igual un martes que un sábado — y mezclar los dos desfases produciría
 * una mediana que no describe ninguno de los dos días reales.
 *
 * Toda propuesta pasa por los mismos candados que `horarios.ts` (orden, 90
 * minutos, ventana del día): proponer un horario que el servidor rechazaría
 * después sería peor que no proponer nada.
 */

import {
  HORA_MAXIMA_MIN,
  HORA_MINIMA_MIN,
  SEPARACION_MINIMA_MIN,
  horaDeMinutos,
  minutosDeHora,
  type TiempoDeComida,
} from "./horarios";

/** Un registro de `MealLog` ya reducido a lo que el aprendizaje necesita. */
export interface RegistroComidaAprendizaje {
  slot: string;
  /** Fecha de la comida (`yyyy-MM-dd`), para clasificar entre semana / fin. */
  date: string;
  /** Hora planeada ese día, copiada al registrar (`"14:30"`). `null` = sin dato. */
  plannedAt: string | null;
  /** Hora real en que se confirmó, ya en hora local (`"15:20"`). `null` = no comió a esa hora. */
  takenHora: string | null;
}

export type TipoDia = "SEMANA" | "FIN";

export interface PropuestaHorario {
  slot: string;
  dia: TipoDia;
  /** La hora vigente para ese slot, la que se movería. */
  actual: string;
  /** La hora nueva sugerida, ya validada contra los candados. */
  propuesta: string;
  /** Cuántos registros sostienen la propuesta. */
  evidencia: number;
}

/** Se necesitan al menos estos registros para no proponer sobre ruido. */
const EVIDENCIA_MINIMA = 4;
/** Debajo de esto el desfase es ruido de horario, no un patrón que valga mover. */
const DESFASE_MINIMO_MIN = 30;

/** `yyyy-MM-dd` → `SEMANA` o `FIN`, en UTC para no cruzar de día por el huso local. */
function tipoDeDia(fechaISO: string): TipoDia {
  const [year, month, day] = fechaISO.split("-").map(Number) as [number, number, number];
  const diaSemana = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6 ? "FIN" : "SEMANA";
}

/** La mediana de una lista de números. `null` si viene vacía. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return (ordenados[mitad - 1]! + ordenados[mitad]!) / 2;
  }
  return ordenados[mitad]!;
}

/**
 * Recorta `deseada` (en minutos) al hueco que dejan los vecinos de `tiempos[indice]`
 * y la ventana del día. `null` si no hay margen (el hueco ya está al mínimo) o
 * si el recorte deja la hora exactamente donde ya estaba.
 */
function recortaAlCandado(
  tiempos: TiempoDeComida[],
  indice: number,
  actual: number,
  deseada: number,
): number | null {
  let min = HORA_MINIMA_MIN;
  let max = HORA_MAXIMA_MIN;

  const anterior = tiempos[indice - 1];
  if (anterior) {
    const horaAnterior = minutosDeHora(anterior.hora);
    if (horaAnterior !== null) min = Math.max(min, horaAnterior + SEPARACION_MINIMA_MIN);
  }

  const siguiente = tiempos[indice + 1];
  if (siguiente) {
    const horaSiguiente = minutosDeHora(siguiente.hora);
    if (horaSiguiente !== null) max = Math.min(max, horaSiguiente - SEPARACION_MINIMA_MIN);
  }

  if (min > max) return null;

  const recortada = Math.min(max, Math.max(min, deseada));
  return recortada === actual ? null : recortada;
}

/**
 * Calcula las propuestas de horario a partir de los registros de `MealLog`.
 *
 * `tiempos` es el horario vigente, en el orden del menú (el mismo que exige
 * `validaHorarios`): de ahí sale tanto la hora "actual" de cada propuesta
 * como los vecinos contra los que se valida el recorte.
 */
export function calculaPropuestas(
  registros: RegistroComidaAprendizaje[],
  tiempos: TiempoDeComida[],
): PropuestaHorario[] {
  // slot -> tipo de día -> lista de desfases en minutos (real - planeado).
  const desfasesPorGrupo = new Map<string, number[]>();

  for (const registro of registros) {
    if (registro.plannedAt === null || registro.takenHora === null) continue;
    const planeado = minutosDeHora(registro.plannedAt);
    const real = minutosDeHora(registro.takenHora);
    if (planeado === null || real === null) continue;

    const clave = `${registro.slot}|${tipoDeDia(registro.date)}`;
    const lista = desfasesPorGrupo.get(clave) ?? [];
    lista.push(real - planeado);
    desfasesPorGrupo.set(clave, lista);
  }

  const propuestas: PropuestaHorario[] = [];

  for (const [clave, desfases] of desfasesPorGrupo) {
    if (desfases.length < EVIDENCIA_MINIMA) continue;

    const [slot, dia] = clave.split("|") as [string, TipoDia];
    const indice = tiempos.findIndex((tiempo) => tiempo.slot === slot);
    if (indice === -1) continue;

    const centro = mediana(desfases);
    if (centro === null || Math.abs(centro) < DESFASE_MINIMO_MIN) continue;

    const actual = minutosDeHora(tiempos[indice]!.hora);
    if (actual === null) continue;

    const deseada = actual + Math.round(centro);
    const propuesta = recortaAlCandado(tiempos, indice, actual, deseada);
    if (propuesta === null) continue;

    propuestas.push({
      slot,
      dia,
      actual: horaDeMinutos(actual),
      propuesta: horaDeMinutos(propuesta),
      evidencia: desfases.length,
    });
  }

  return propuestas;
}
