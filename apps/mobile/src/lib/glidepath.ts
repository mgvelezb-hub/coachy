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

// ---------------------------------------------------------------------------
// Todo el objetivo, no solo la cintura
// ---------------------------------------------------------------------------

/**
 * La proyección de una medida hacia su destino.
 *
 * El glidepath de arriba solo sabe de cintura, porque es la única medida con
 * un destino anclado en un número (la mitad de tu estatura). El resto del
 * objetivo —peso, brazos, piernas— tiene ritmo pero no destino fijo, y decirlo
 * es parte del dato: una proyección con destino inventado se lee como promesa.
 *
 * Cada zona trae DOS lecturas: el ritmo que pide el plan y el ritmo que de
 * verdad llevas. La diferencia entre las dos es la conversación honesta —"al
 * plan llegas en marzo; a tu ritmo real, en junio"— y es la que ninguna barra
 * de progreso puede tener.
 */
export type ProyeccionZona = {
  label: string;
  unidad: string;
  actual: number;
  /** Dónde arrancó todo, con su fecha. */
  inicio: { valor: number; fecha: string };
  /** El destino, cuando la medida tiene uno. `null` = se mide por ritmo. */
  destino: number | null;
  /** Lo que pide el plan cada mes. Negativo = bajar. */
  ritmoMensualPlan: number;
  /** Lo que de verdad se movió por mes, calculado del historial. */
  ritmoMensualReal: number | null;
  /** Meses al ritmo del plan hasta el destino. `null` si no hay destino. */
  mesesAlPlan: number | null;
  /** Meses al ritmo real. `null` si no hay destino o si no avanza. */
  mesesReales: number | null;
  /** 0 a 1 del camino total, cuando hay destino. */
  avance: number | null;
};

const MESES_LARGO = MESES;

/** "marzo de 2027" a partir de hoy más N meses. */
export function fechaEnMeses(desde: Date, meses: number): string {
  const fecha = new Date(desde.getFullYear(), desde.getMonth() + Math.ceil(meses), 1);
  return `${MESES_LARGO[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

function ritmoObservado(
  puntos: Array<{ date: string; valor: number }>,
): number | null {
  if (puntos.length < 2) return null;
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;
  const dias =
    (Date.parse(`${ultimo.date}T12:00:00.000Z`) - Date.parse(`${primero.date}T12:00:00.000Z`)) /
    86_400_000;
  if (dias < 14) return null; // Menos de dos semanas no es una tendencia.
  return ((ultimo.valor - primero.valor) / dias) * 30;
}

/**
 * Todas las zonas del objetivo, con su proyección.
 *
 * `ritmos` viene del mismo catálogo que usa `metasDelMes`, para que el plan
 * del mes y la proyección a meses hablen del mismo ritmo. Si no coincidieran,
 * la app se estaría contradiciendo a sí misma en dos pantallas.
 */
export function proyeccionDelObjetivo(input: {
  points: CheckInPoint[] | undefined;
  heightCm: number | null;
  ritmos: { pesoPct: number; cinturaCm: number; brazoCm: number; piernaCm: number };
}): ProyeccionZona[] {
  const lista = [...(input.points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (lista.length === 0) return [];

  function serie(lectura: (punto: CheckInPoint) => number | null) {
    return lista
      .map((punto) => ({ date: punto.date, valor: lectura(punto) }))
      .filter((entrada): entrada is { date: string; valor: number } => entrada.valor !== null);
  }

  function par(izq: number | null, der: number | null): number | null {
    const valores = [izq, der].filter((valor): valor is number => valor !== null);
    if (valores.length === 0) return null;
    return Math.round((valores.reduce((suma, valor) => suma + valor, 0) / valores.length) * 10) / 10;
  }

  function zona(
    label: string,
    unidad: string,
    puntos: Array<{ date: string; valor: number }>,
    destino: number | null,
    ritmoPlan: number,
  ): ProyeccionZona | null {
    if (puntos.length === 0) return null;

    const primero = puntos[0]!;
    const actual = puntos[puntos.length - 1]!.valor;
    const real = ritmoObservado(puntos.slice(-4));

    const falta = destino === null ? null : actual - destino;
    const mesesAlPlan =
      falta === null || ritmoPlan === 0 || falta / ritmoPlan < 0
        ? null
        : Math.ceil(Math.abs(falta / ritmoPlan));
    const mesesReales =
      falta === null || real === null || real === 0 || falta / real < 0
        ? null
        : Math.ceil(Math.abs(falta / real));

    const total = destino === null ? null : primero.valor - destino;

    return {
      label,
      unidad,
      actual: Math.round(actual * 10) / 10,
      inicio: { valor: Math.round(primero.valor * 10) / 10, fecha: primero.date },
      destino,
      ritmoMensualPlan: ritmoPlan,
      ritmoMensualReal: real === null ? null : Math.round(real * 10) / 10,
      mesesAlPlan,
      mesesReales,
      avance:
        total === null || total === 0
          ? null
          : Math.max(0, Math.min(1, (primero.valor - actual) / total)),
    };
  }

  const cinturaDestino =
    input.heightCm && input.heightCm > 0
      ? Math.round(input.heightCm * RAZON_CINTURA_ESTATURA * 10) / 10
      : null;

  const pesoInicial = serie((punto) => punto.weightKg)[0]?.valor ?? null;

  return [
    zona("Cintura", "cm", serie((punto) => punto.waistCm), cinturaDestino, -CORTE_MENSUAL_CM),
    zona(
      "Peso",
      "kg",
      serie((punto) => punto.weightKg),
      // El peso no tiene destino propio: se mueve como consecuencia de lo
      // demás. Se proyecta por ritmo y se dice que no hay meta fija.
      null,
      pesoInicial === null ? 0 : Math.round(((pesoInicial * input.ritmos.pesoPct) / 100) * 10) / 10,
    ),
    zona(
      "Brazos",
      "cm",
      serie((punto) => par(punto.armLeftCm, punto.armRightCm)),
      null,
      input.ritmos.brazoCm,
    ),
    zona(
      "Piernas",
      "cm",
      serie((punto) => par(punto.legLeftCm, punto.legRightCm)),
      null,
      input.ritmos.piernaCm,
    ),
  ].filter((zona): zona is ProyeccionZona => zona !== null);
}
