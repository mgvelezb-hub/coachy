import type { CheckInPoint } from "@/lib/api";

/**
 * El glidepath: la bajada al objetivo, partida en cortes mensuales.
 *
 * Por qué así y no contra la foto: la referencia dice hacia dónde, no cuánto
 * —de una foto no salen centímetros sin inventarlos—. Lo que sí se puede
 * anclar en un número es la **cintura**, con la razón cintura-estatura: una
 * cintura por debajo de la mitad de la estatura es el corte de uso común para
 * riesgo cardiometabólico, y es el mismo criterio para cualquier complexión
 * porque se mide contra tu propia altura. Ese es el destino; el ritmo mensual
 * lo parte en escalones que sí se pueden cumplir.
 *
 * Qué se recalcula cada mes: el punto de partida es tu última medición, así
 * que el glidepath se re-ancla solo. Si un mes te pasas, el siguiente pide
 * menos; si te quedas corto, no se "acumula deuda" —el escalón siguiente sale
 * de donde estás, no de donde debiste estar—. Una meta que arrastra deudas
 * deja de cumplirse y se abandona.
 *
 * Módulo puro: sin red, sin React, sin reloj del sistema salvo el `hoy` que
 * se le pasa.
 */

/** Cintura objetivo = la mitad de la estatura. */
const RAZON_CINTURA_ESTATURA = 0.5;

/**
 * Corte mensual de cintura, en cm.
 *
 * Dos centímetros al mes es lo que sale de un déficit sostenible sin que la
 * fuerza se caiga; con brechas grandes el cuerpo suele ir más rápido al
 * principio, pero prometer eso es prometer lo que no se sostiene.
 */
const CORTE_MENSUAL_CM = 2;

/** Debajo de esto ya no se persigue nada: se sostiene. */
const TOLERANCIA_CM = 1;

export type Glidepath = {
  /** Cintura de hoy. */
  actual: number;
  /** A dónde va: la mitad de tu estatura. */
  destino: number;
  /** El corte de este mes, desde tu última medición. */
  meta: number;
  /** Cuántos meses faltan al ritmo del corte mensual. */
  mesesRestantes: number;
  /** Cuánto se lleva recorrido del total, 0 a 1. */
  avanceTotal: number;
  /** El primer registro con cintura: de dónde arrancó todo. */
  inicio: { valor: number; fecha: string } | null;
  /** `true` cuando ya está dentro de la tolerancia del destino. */
  enDestino: boolean;
};

export function glidepathDeCintura(
  points: CheckInPoint[] | undefined,
  heightCm: number | null,
): Glidepath | null {
  if (!heightCm || heightCm <= 0) return null;

  const conCintura = [...(points ?? [])]
    .filter((punto) => punto.waistCm !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (conCintura.length === 0) return null;

  const primero = conCintura[0]!;
  const ultimo = conCintura[conCintura.length - 1]!;
  const actual = ultimo.waistCm!;
  const destino = Math.round(heightCm * RAZON_CINTURA_ESTATURA * 10) / 10;

  const faltan = actual - destino;
  const enDestino = faltan <= TOLERANCIA_CM;

  // El escalón del mes sale de DONDE ESTÁS, no de donde debías estar: el
  // glidepath no arrastra deudas.
  const meta = enDestino
    ? destino
    : Math.round(Math.max(destino, actual - CORTE_MENSUAL_CM) * 10) / 10;

  const recorrido = primero.waistCm! - actual;
  const total = primero.waistCm! - destino;

  return {
    actual,
    destino,
    meta,
    mesesRestantes: enDestino ? 0 : Math.ceil(faltan / CORTE_MENSUAL_CM),
    avanceTotal: total <= 0 ? 1 : Math.max(0, Math.min(1, recorrido / total)),
    inicio: { valor: primero.waistCm!, fecha: primero.date },
    enDestino,
  };
}

/** La línea que acompaña al gráfico: dónde vas dentro del plan completo. */
export function textoDeGlidepath(plan: Glidepath): string {
  if (plan.enDestino) {
    return `Estás en tu destino (${plan.destino} cm, la mitad de tu estatura). De aquí en adelante es sostener.`;
  }

  const meses = plan.mesesRestantes;
  return `Este mes: ${plan.meta} cm. Destino ${plan.destino} cm —la mitad de tu estatura— en unos ${meses} ${meses === 1 ? "mes" : "meses"} a este ritmo.`;
}


export type EscalonMes = {
  /** 1 = este mes. */
  mes: number;
  /** A dónde debería llegar la cintura al cierre de ese mes. */
  cintura: number;
  /** Etiqueta del mes, ya en español: "septiembre 2026". */
  etiqueta: string;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Los escalones mes a mes hasta el destino, para la pantalla de detalle.
 *
 * Es una proyección al ritmo actual, no una promesa: por eso se dibuja
 * completa y se dice de dónde sale cada número. El último escalón puede ser
 * más corto que los demás —no se pasa del destino.
 */
export function escalonesDe(plan: Glidepath, desde: Date, maxMeses = 24): EscalonMes[] {
  if (plan.enDestino) return [];

  const escalones: EscalonMes[] = [];
  let cintura = plan.actual;

  for (let mes = 1; mes <= Math.min(plan.mesesRestantes, maxMeses); mes += 1) {
    cintura = Math.max(plan.destino, Math.round((cintura - CORTE_MENSUAL_CM) * 10) / 10);
    const fecha = new Date(desde.getFullYear(), desde.getMonth() + mes, 1);
    escalones.push({
      mes,
      cintura,
      etiqueta: `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`,
    });
  }

  return escalones;
}
