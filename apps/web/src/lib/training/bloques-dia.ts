import { avisoDeRiesgo } from "@/lib/training/combinaciones";
import { prescribirSesion } from "@/lib/training/disciplinas";
import type { NivelDisciplina, ObjetivoAtleta } from "@/lib/training/disciplinas/tipos";
import type { OtherSession } from "@/lib/training/disciplines";
import { WEEK_DAYS, type WeekDay } from "@/lib/training/split";
import { DISCIPLINES, type DayKind, type Discipline } from "@/lib/training/types";

/**
 * Los bloques que se agregan EL DÍA, con el tiempo que sobra.
 *
 * EL CAMBIO DE MODELO: hasta ahora toda disciplina que se practicaba tenía
 * que caber en el plan semanal (`otherDisciplines`, con sesiones/semana y
 * modo). Eso funciona para lo que se entrena en serio —la disciplina base— y
 * es una mentira para todo lo demás: nadie sabe en lunes que el jueves va a
 * tener cuarenta minutos libres para nadar.
 *
 * Entonces: las bases se planean (siguen viviendo en `primaryDiscipline` +
 * `otherDisciplines`, con todo lo que la Fase 4/7 construyó para repartir
 * minutos y grupos), y lo demás se agrega el día, encima del día, sin tocar
 * el plan. Eso es `dayBlocks`.
 */

export const TIPOS_BLOQUE = ["ENTRENO", "LIBRE"] as const;
export type TipoBloque = (typeof TIPOS_BLOQUE)[number];

export type BloqueDelDia = {
  discipline: Discipline;
  /**
   * `ENTRENO`: Coachy prescribe la sesión de esa disciplina con los minutos
   * dados. `LIBRE`: solo se registra el tiempo y lo que marque el reloj —
   * inventarle una sesión a quien salió a jugar por gusto es exactamente lo
   * que hace que se deje de usar la app.
   */
  tipo: TipoBloque;
  minutos: number;
};

export type BloquesPorFecha = Record<string, BloqueDelDia[]>;

/** Un día no lleva más de dos bloques agregados: el día tiene el tamaño que tiene. */
const MAX_POR_DIA = 2;

const MIN_MINUTOS = 5;
const MAX_MINUTOS = 300;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `day_blocks` es JSON libre en la base: tolerante entrada por entrada, igual
 * que `other_disciplines`. Un bloque mal escrito se cae solo; no puede
 * llevarse el día entero.
 */
export function parseDayBlocks(raw: unknown): BloquesPorFecha {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const salida: BloquesPorFecha = {};
  for (const [fecha, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (!ES_FECHA.test(fecha) || !Array.isArray(lista)) continue;

    const bloques: BloqueDelDia[] = [];
    for (const crudo of lista) {
      const bloque = normalizaBloque(crudo);
      if (!bloque) continue;
      if (bloques.some((otro) => otro.discipline === bloque.discipline)) continue;
      bloques.push(bloque);
    }

    if (bloques.length > 0) salida[fecha] = bloques.slice(0, MAX_POR_DIA);
  }
  return salida;
}

function normalizaBloque(raw: unknown): BloqueDelDia | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const bloque = raw as Record<string, unknown>;

  const discipline = bloque.discipline;
  if (typeof discipline !== "string" || !(DISCIPLINES as readonly string[]).includes(discipline)) {
    return null;
  }
  const tipo = bloque.tipo;
  if (typeof tipo !== "string" || !(TIPOS_BLOQUE as readonly string[]).includes(tipo)) return null;

  const minutos = bloque.minutos;
  if (typeof minutos !== "number" || !Number.isFinite(minutos)) return null;
  if (minutos < MIN_MINUTOS || minutos > MAX_MINUTOS) return null;

  return {
    discipline: discipline as Discipline,
    tipo: tipo as TipoBloque,
    minutos: Math.trunc(minutos),
  };
}

/**
 * Agrega (o actualiza) un bloque de ese día.
 *
 * La misma disciplina no entra dos veces: se sobreescribe, que es lo que la
 * persona quiere decir cuando vuelve a agregar natación con otros minutos. Y
 * si el día ya llegó al tope, el más viejo sale — el bloque recién agregado es
 * el que refleja la decisión de ahorita.
 */
export function agregarBloqueDelDia(
  actual: BloquesPorFecha,
  fecha: string,
  bloque: BloqueDelDia,
): BloquesPorFecha {
  const previos = (actual[fecha] ?? []).filter((otro) => otro.discipline !== bloque.discipline);
  const siguientes = [...previos, bloque].slice(-MAX_POR_DIA);
  return { ...actual, [fecha]: siguientes };
}

/** Quita el bloque de esa disciplina. Sin bloques, la fecha desaparece. */
export function quitarBloqueDelDia(
  actual: BloquesPorFecha,
  fecha: string,
  discipline: Discipline,
): BloquesPorFecha {
  const restantes = (actual[fecha] ?? []).filter((bloque) => bloque.discipline !== discipline);
  const siguiente = { ...actual };
  if (restantes.length === 0) delete siguiente[fecha];
  else siguiente[fecha] = restantes;
  return siguiente;
}

/**
 * El aviso que se enseña AL AGREGAR, nunca para bloquear.
 *
 * Es el mismo criterio de la Fase 11: cuando la persona lo pide explícito,
 * negarle la combinación no la protege de nada — ya sabe que quiere squash
 * después del día de pierna. Lo que sí se debe es decírselo.
 */
export function avisoDeBloque(
  discipline: Discipline,
  contexto: { dayKind: DayKind | null },
): string | null {
  if (!contexto.dayKind) return null;
  return avisoDeRiesgo({ discipline: "PESAS", dayKind: contexto.dayKind }, { discipline });
}

/**
 * Los bloques de esa semana, ya como sesiones del día.
 *
 * Van con `orden: 2` porque son justo eso: lo que se pone ENCIMA del día, no
 * lo que lo define. El bloque de la disciplina base sigue siendo el primero.
 */
export function sesionesDeBloquesDelDia(
  bloques: BloquesPorFecha,
  monday: Date,
  entrada: {
    niveles: Partial<Record<Discipline, NivelDisciplina>>;
    objetivo: string;
    isoWeek: number;
    /** Qué días de la semana ya traen gimnasio: el bloque lo dice, día por día. */
    diasConGimnasio: WeekDay[];
  },
): OtherSession[] {
  const salida: OtherSession[] = [];
  const lunes = isoDe(monday);

  for (const [fecha, delDia] of Object.entries(bloques)) {
    const index = WEEK_DAYS.findIndex((_, position) => sumaDias(lunes, position) === fecha);
    if (index === -1) continue; // el bloque no cae en esta semana

    const weekday = WEEK_DAYS[index] as WeekDay;
    for (const bloque of delDia) {
      salida.push({
        date: fecha,
        weekday,
        discipline: bloque.discipline,
        minutes: bloque.minutos,
        sesion:
          bloque.tipo === "ENTRENO"
            ? prescribirSesion({
                discipline: bloque.discipline,
                nivel: entrada.niveles[bloque.discipline] ?? "PRINCIPIANTE",
                isoWeek: entrada.isoWeek,
                ordinal: 1,
                minutes: bloque.minutos,
                objetivo: entrada.objetivo as ObjetivoAtleta,
              })
            : null,
        note:
          bloque.tipo === "ENTRENO"
            ? "Bloque que agregaste este día: Coachy lo armó con los minutos que le diste."
            : "Bloque libre que agregaste este día: se registra el tiempo y lo que marque el reloj.",
        sharesDayWithGym: entrada.diasConGimnasio.includes(weekday),
        orden: 2,
      });
    }
  }

  return salida;
}

/** ISO de una fecha local, sin cruzar de día por zona horaria. */
function isoDe(date: Date): string {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

function sumaDias(iso: string, dias: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const fecha = new Date(year!, month! - 1, day!);
  fecha.setDate(fecha.getDate() + dias);
  return isoDe(fecha);
}
