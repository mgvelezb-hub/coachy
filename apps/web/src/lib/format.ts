import type { Prisma } from "@prisma/client";

/** Fecha ISO (YYYY-MM-DD) en hora local, sin arrastrar zona horaria. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parsea YYYY-MM-DD como fecha local a mediodía UTC (evita saltos de día). */
export function fromISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

/** El domingo de la semana de `date` (el check-in es dominical). */
export function sundayOf(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(12, 0, 0, 0);
  return copy;
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
