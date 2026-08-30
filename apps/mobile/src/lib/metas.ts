import type { Brecha } from "@/components/GapChart";
import type { CheckInPoint } from "@/lib/api";

/**
 * Las metas del mes: la rampa, no la cima.
 *
 * Por qué existe: comparar tu cintura de hoy contra la silueta de referencia
 * produce una brecha enorme que no dice qué hacer esta semana y desanima. El
 * objetivo lejano sirve para elegir la dirección; para medirse hace falta el
 * siguiente escalón. Aquí cada medida trae la meta DEL MES en curso, calculada
 * desde donde arrancaste ese mes.
 *
 * De dónde salen los ritmos: son los que se consideran sostenibles en la
 * práctica —alrededor de 0.5 % del peso corporal por semana en pérdida de
 * grasa (la franja usual es 0.5-1 %), y ganancias de músculo mucho más lentas
 * que eso, del orden de 1 % de peso al mes en alguien que ya entrena—. Están
 * del lado conservador a propósito: una meta que se cumple sostiene el hábito,
 * una que no se cumple lo rompe.
 *
 * Esto es una sugerencia de ritmo, no una prescripción. Módulo puro: sin red,
 * sin React.
 */

/**
 * Ritmos mensuales por objetivo. Signo negativo = bajar.
 *
 * Se exporta porque la proyección a meses (`glidepath.ts`) tiene que usar
 * EXACTAMENTE el mismo ritmo que la meta del mes. Con dos tablas distintas la
 * app se contradiría a sí misma en dos pantallas.
 */
export const RITMOS: Record<string, { pesoPct: number; cinturaCm: number; brazoCm: number; piernaCm: number }> = {
  // ~0.5 % de peso por semana, redondeado a la baja para el mes.
  PERDIDA_GRASA: { pesoPct: -2, cinturaCm: -2, brazoCm: 0, piernaCm: 0 },
  // Recomposición: la báscula se mueve poco y la cinta es la que manda.
  RECOMPOSICION: { pesoPct: -1, cinturaCm: -1.5, brazoCm: 0.2, piernaCm: 0.3 },
  // Subir despacio es lo que hace que lo ganado sea músculo y no grasa.
  GANANCIA_MUSCULO: { pesoPct: 1, cinturaCm: 0, brazoCm: 0.3, piernaCm: 0.5 },
  SALUD: { pesoPct: 0, cinturaCm: -0.5, brazoCm: 0, piernaCm: 0 },
  RENDIMIENTO: { pesoPct: 0, cinturaCm: 0, brazoCm: 0.2, piernaCm: 0.3 },
};

/** Días que se miran hacia atrás para encontrar el arranque del mes. */
const VENTANA_DIAS = 35;

export type MetaMedida = {
  label: string;
  /** Desde dónde arrancó el mes. */
  inicio: number;
  /** Dónde estás hoy. */
  actual: number;
  /** A dónde debería llegar este mes. */
  meta: number;
  unidad: string;
  /** 0 a 1: cuánto del camino del mes ya está hecho. */
  progreso: number;
};

function promedioPar(izquierdo: number | null, derecho: number | null): number | null {
  const valores = [izquierdo, derecho].filter((v): v is number => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((sum, v) => sum + v, 0) / valores.length;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T12:00:00.000Z`) - Date.parse(`${desde}T12:00:00.000Z`)) / 86_400_000,
  );
}

/**
 * Progreso hacia una meta, de 0 a 1.
 *
 * Si te pasaste de la meta se topa en 1 en vez de crecer: cumplir de más no
 * "adelanta" el mes siguiente, y un riel que se sale de su carril miente sobre
 * lo que falta.
 */
function progresoHacia(inicio: number, actual: number, meta: number): number {
  const camino = meta - inicio;
  if (Math.abs(camino) < 0.01) {
    // Meta de sostener: se cumple mientras no te muevas más de medio punto.
    return Math.abs(actual - inicio) <= 0.5 ? 1 : 0;
  }
  return Math.max(0, Math.min(1, (actual - inicio) / camino));
}

export type MetasDelMes = {
  medidas: MetaMedida[];
  /** El check-in desde el que se está midiendo el mes. */
  desde: string | null;
};

/**
 * Las metas del mes a partir del historial de medidas.
 *
 * Necesita al menos dos puntos: uno para saber de dónde saliste y otro para
 * saber dónde estás. Con uno solo no hay rampa que medir y regresa vacío —
 * inventar una meta sobre un solo dato sería adivinar el punto de partida.
 */
export function metasDelMes(
  points: CheckInPoint[] | undefined,
  goal: string,
  hoy: string,
  /** El corte de cintura de este mes, cuando hay glidepath: manda sobre el
   * ritmo genérico porque está anclado al destino real. */
  metaCinturaCm?: number | null,
): MetasDelMes {
  const lista = [...(points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (lista.length < 2) return { medidas: [], desde: null };

  const actual = lista[lista.length - 1]!;
  const previos = lista.slice(0, -1);

  /**
   * De dónde arranca el mes.
   *
   * Primero se busca el punto más viejo DENTRO de la ventana; si el único que
   * cae ahí es el de hoy —que es lo que pasa cuando alguien se estrena y su
   * check-in anterior fue hace meses— se usa el inmediatamente anterior, sin
   * importar su edad. La alternativa era no enseñar nada, y no enseñar nada
   * cuando sí hay dos mediciones es peor que enseñar un tramo largo diciendo
   * desde cuándo va.
   */
  const inicio =
    previos.find((punto) => diasEntre(punto.date, hoy) <= VENTANA_DIAS) ??
    previos[previos.length - 1];
  if (!inicio) return { medidas: [], desde: null };

  const ritmo = RITMOS[goal] ?? RITMOS.SALUD!;
  const medidas: MetaMedida[] = [];

  function agrega(
    label: string,
    desde: number | null,
    hasta: number | null,
    delta: number,
    unidad: string,
  ) {
    if (desde === null || hasta === null) return;
    const meta = Math.round((desde + delta) * 10) / 10;
    medidas.push({
      label,
      inicio: Math.round(desde * 10) / 10,
      actual: Math.round(hasta * 10) / 10,
      meta,
      unidad,
      progreso: progresoHacia(desde, hasta, meta),
    });
  }

  // La cintura se mide contra el escalón del glidepath cuando existe: ese sale
  // del destino real (la mitad de tu estatura) y no de un ritmo de catálogo.
  agrega(
    "Cintura",
    inicio.waistCm,
    actual.waistCm,
    metaCinturaCm != null && inicio.waistCm != null ? metaCinturaCm - inicio.waistCm : ritmo.cinturaCm,
    "cm",
  );
  agrega(
    "Peso",
    inicio.weightKg,
    actual.weightKg,
    inicio.weightKg === null ? 0 : (inicio.weightKg * ritmo.pesoPct) / 100,
    "kg",
  );
  agrega(
    "Brazos",
    promedioPar(inicio.armLeftCm, inicio.armRightCm),
    promedioPar(actual.armLeftCm, actual.armRightCm),
    ritmo.brazoCm,
    "cm",
  );
  agrega(
    "Piernas",
    promedioPar(inicio.legLeftCm, inicio.legRightCm),
    promedioPar(actual.legLeftCm, actual.legRightCm),
    ritmo.piernaCm,
    "cm",
  );

  return { medidas, desde: inicio.date };
}

/** Medidas de cinta: se toman una vez al mes, no cada semana. */
const MENSUALES = new Set(["Brazos", "Piernas"]);

/**
 * Las metas del mes en el formato del riel, con números y **con dirección**.
 *
 * Lo que falta se dice con verbo, no solo con cifra. "3.4 kg más" en un plan
 * de pérdida de grasa se lee como que hay que subir 3.4 kg —lo contrario de lo
 * que el plan pide—, y ese malentendido lo reportó la primera persona que vio
 * la tarjeta. Con "3.4 kg por bajar" el signo deja de ser una adivinanza.
 */
export function brechasDelMes(metas: MetaMedida[]): Brecha[] {
  return metas.map((medida) => {
    const falta = Math.round((medida.meta - medida.actual) * 10) / 10;
    const magnitud = Math.abs(falta);
    const sostener = Math.abs(medida.meta - medida.inicio) < 0.05;

    return {
      label: medida.label,
      avance: medida.progreso,
      actual: `${medida.actual} ${medida.unidad}`,
      meta: `${medida.meta} ${medida.unidad}`,
      cadencia: MENSUALES.has(medida.label) ? "mensual" : "semanal",
      nota:
        medida.progreso >= 1
          ? "cumplida"
          : sostener
            ? `sostener alrededor de ${medida.meta} ${medida.unidad}`
            : `faltan ${magnitud} ${medida.unidad} ${falta < 0 ? "por bajar" : "por subir"}`,
    };
  });
}
