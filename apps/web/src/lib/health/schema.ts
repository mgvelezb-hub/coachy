import { z } from "zod";

/**
 * Lo que manda el Atajo de iOS a `/api/health/ingest`.
 *
 * Todo menos la fecha es opcional: el reloj puede no traer sueño esa noche, o
 * la FC en reposo puede tardar días en calcularse. Medio dato sigue siendo
 * dato, y un campo faltante nunca borra el que ya estaba guardado.
 *
 * Los topes existen para que un atajo mal armado (o un dedo en el teclado) no
 * meta un día de 900 000 pasos que después arrastre el promedio del PAL.
 */

/** `YYYY-MM-DD`, y que sea una fecha de verdad. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va en formato YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)), "fecha inexistente");

/** Los atajos mandan números con decimales; se redondean a entero. */
const metric = (max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .transform((value) => Math.round(value))
    .nullish();

/** Igual que `metric`, pero conserva un decimal: hay indicadores donde el
 * .5 sí significa algo (un VO₂ máx de 38.5 no es 39). */
const metricDecimal = (max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .transform((value) => Math.round(value * 10) / 10)
    .nullish();

export const healthDaySchema = z.object({
  date: isoDate,
  steps: metric(200_000),
  activeKcal: metric(10_000),
  exerciseMin: metric(1_440),
  sleepMin: metric(1_440),
  restingHr: metric(220),
  /** SDNN en ms. Arriba de 300 ya no es una persona, es un artefacto. */
  hrvMs: metric(300),
  vo2max: metricDecimal(90),
  respiratoryRate: metricDecimal(60),
  spo2: metricDecimal(100),
  standHours: metric(24),
});

export type HealthDayPayload = z.infer<typeof healthDaySchema>;

/** El atajo puede mandar un día o varios (p. ej. al recuperar un hueco). */
export const healthIngestSchema = z.union([
  healthDaySchema,
  z.object({ days: z.array(healthDaySchema).min(1).max(60) }),
]);

/** Normaliza las dos formas a una lista de días. */
export function daysFromPayload(parsed: z.infer<typeof healthIngestSchema>): HealthDayPayload[] {
  return "days" in parsed ? parsed.days : [parsed];
}
