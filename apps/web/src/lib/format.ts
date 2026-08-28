import type { Prisma } from "@prisma/client";

/**
 * La zona de la atleta, no la del servidor.
 *
 * Vercel corre en UTC: a las 6 de la tarde en CDMX el servidor ya cree que es
 * mañana, y el gimnasio abría la sesión del día siguiente. Ninguna fecha del
 * sistema puede depender de dónde corra el proceso, así que todo el cálculo
 * de "qué día es hoy" pasa por aquí.
 *
 * Es una constante y no una preferencia por atleta a propósito: hoy todas
 * entrenan en México. El día que haya una fuera, este es el único lugar que
 * hay que volver dinámico (leerlo del perfil), y por eso vive solo.
 */
export const APP_TIMEZONE = "America/Mexico_City";

/** `YYYY-MM-DD` de un instante, leído en la zona de la atleta. */
const ISO_DATE_IN_TZ = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha ISO (YYYY-MM-DD) del día que es en México en ese instante. */
export function toISODate(date: Date): string {
  // en-CA formatea justo como YYYY-MM-DD.
  return ISO_DATE_IN_TZ.format(date);
}

const WEEKDAY_IN_TZ = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Día de la semana (0=domingo) en la zona de la atleta, no en la del servidor. */
export function weekdayIn(date: Date): number {
  return WEEKDAY_INDEX[WEEKDAY_IN_TZ.format(date)] ?? date.getUTCDay();
}

/** Parsea YYYY-MM-DD como fecha local a mediodía UTC (evita saltos de día). */
export function fromISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

/**
 * El ISO de una columna `date` de Postgres.
 *
 * Prisma devuelve las columnas `@db.Date` como medianoche **UTC**. Leerlas con
 * `toISODate` (que es hora local) las corre un día hacia atrás en cualquier
 * zona al oeste de Greenwich — en Vercel no se nota porque el runtime va en
 * UTC, y en una laptop en CDMX el gimnasio abriría la sesión de mañana. Para
 * una columna de solo fecha, la lectura correcta es la UTC.
 */
export function isoFromDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** El domingo de la semana de `date` (el check-in es dominical). */
export function sundayOf(date: Date): Date {
  // El día de la semana se lee en México, no en el servidor: si no, un jueves
  // por la noche en CDMX (viernes en UTC) devolvería el domingo equivocado.
  return fromISODate(shiftISODate(toISODate(date), -weekdayIn(date)));
}

/** Suma (o resta) días a un `YYYY-MM-DD` sin que la zona horaria meta ruido. */
export function shiftISODate(iso: string, days: number): string {
  const base = new Date(`${iso}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const LONG_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function formatLongDate(date: Date): string {
  return LONG_DATE.format(date);
}

export function formatShortDate(date: Date): string {
  return SHORT_DATE.format(date);
}

/** Decimal de Prisma → number, con null seguro. Para gráficas y JSON. */
export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function formatCm(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} cm`;
}

export function formatKg(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} kg`;
}

const PHASE_LABEL: Record<string, string> = {
  REINTRO: "Reintro",
  BASE: "Base",
  CUT: "Corte",
  CUT_AGRESIVO: "Corte agresivo",
  REFEED: "Recarga",
  ESTABILIZACION: "Estabilización",
  MANTENIMIENTO: "Mantenimiento",
};

export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}
