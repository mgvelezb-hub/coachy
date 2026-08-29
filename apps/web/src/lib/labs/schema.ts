import { z } from "zod";

/**
 * Estudios cargados por la atleta (Fase 8).
 *
 * La regla de toda esta capa: **se guarda y se grafica, no se interpreta.**
 * No hay rangos de referencia propios ni umbrales del producto. Si el
 * laboratorio imprimió su rango, se captura y se dibuja; si no, el valor se
 * grafica solo y nadie opina.
 *
 * Lo único que sí se revisa es la **coherencia interna del reporte**, que no
 * es clínica: si un InBody dice 33.5 % de grasa y su propia masa libre de
 * grasa implica 39 %, el reporte se contradice a sí mismo y no debe alimentar
 * el perfil. Ese caso pasó de verdad con el InBody de mayo.
 */

export const LAB_KINDS = ["INBODY", "QUIMICA"] as const;
export type LabKind = (typeof LAB_KINDS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va en formato YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)), "fecha inexistente");

export const labValueSchema = z
  .object({
    /** Identificador estable del parámetro: `glucosa`, `fat_pct`, ... */
    key: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_]+$/, "la llave va en minúsculas, sin espacios"),
    /** Cómo lo llama el laboratorio, tal cual viene impreso. */
    label: z.string().trim().min(1).max(80),
    value: z.number().finite(),
    unit: z.string().trim().max(20).default(""),
    /** Rango de referencia DEL LABORATORIO. Nunca uno nuestro. */
    refLow: z.number().finite().nullable().default(null),
    refHigh: z.number().finite().nullable().default(null),
  })
  .refine(
    (value) => value.refLow === null || value.refHigh === null || value.refLow <= value.refHigh,
    { message: "el rango del laboratorio está invertido" },
  );

export type LabValue = z.infer<typeof labValueSchema>;

export const labResultSchema = z.object({
  kind: z.enum(LAB_KINDS),
  /** La fecha del estudio, no la de captura. */
  takenOn: isoDate,
  values: z.array(labValueSchema).min(1, "un estudio sin valores no es un estudio").max(60),
  /** Ruta en Storage del PDF, si se subió. */
  filePath: z.string().trim().max(300).nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export type LabResultInput = z.infer<typeof labResultSchema>;

/** Llaves de InBody que el perfil sabe usar. */
export const INBODY_KEYS = {
  weight: "peso_kg",
  fatPct: "grasa_pct",
  leanMass: "masa_libre_grasa_kg",
  visceral: "grasa_visceral",
} as const;

export type CoherenceCheck = {
  /** El reporte cuadra consigo mismo. */
  coherent: boolean;
  /** Qué no cuadra, dicho sin diagnosticar nada. */
  reason: string | null;
};

/**
 * ¿El InBody cuadra consigo mismo?
 *
 * Peso, porcentaje de grasa y masa libre de grasa son tres números con una
 * relación aritmética: `masa libre = peso × (1 − grasa%)`. Si no se cumple,
 * uno de los tres está mal capturado o mal medido, y usarlo para el perfil
 * arrastraría el error a todo el motor.
 *
 * No dice cuál está mal —no hay manera de saberlo— y no dice nada de salud:
 * solo que ese reporte no se puede usar como fuente.
 */
export function checkInbodyCoherence(values: LabValue[]): CoherenceCheck {
  const find = (key: string): number | null =>
    values.find((value) => value.key === key)?.value ?? null;

  const weight = find(INBODY_KEYS.weight);
  const fatPct = find(INBODY_KEYS.fatPct);
  const leanMass = find(INBODY_KEYS.leanMass);

  if (weight === null || fatPct === null || leanMass === null) {
    return { coherent: true, reason: null };
  }

  const implied = weight * (1 - fatPct / 100);
  const impliedFatPct = weight > 0 ? (1 - leanMass / weight) * 100 : 0;
  // Un kilo de holgura cubre el redondeo del propio aparato.
  if (Math.abs(implied - leanMass) <= 1) return { coherent: true, reason: null };

  return {
    coherent: false,
    reason:
      `El reporte no cuadra consigo mismo: dice ${fatPct.toFixed(1)} % de grasa, ` +
      `pero con ${weight.toFixed(1)} kg y ${leanMass.toFixed(1)} kg de masa libre de grasa ` +
      `saldría ${impliedFatPct.toFixed(1)} %. Se guarda y se grafica, pero no se usa para tu perfil.`,
  };
}

/**
 * Valores fuera del rango que imprimió el laboratorio.
 *
 * Es una lectura del documento, no una interpretación: se compara el número
 * contra el rango del propio estudio y se enumera lo que cae fuera. La app no
 * dice qué significa ni qué hacer — eso es de un médico.
 */
export function outsideLabRange(values: LabValue[]): LabValue[] {
  return values.filter(
    (value) =>
      (value.refLow !== null && value.value < value.refLow) ||
      (value.refHigh !== null && value.value > value.refHigh),
  );
}

/** El aviso que acompaña a cualquier estudio. Se muestra siempre, sin excepción. */
export const CLINICAL_DISCLAIMER =
  "Holy Gains guarda y grafica tus estudios; no los interpreta ni sustituye una consulta. " +
  "Lo que salga fuera del rango de tu laboratorio lo revisa un médico.";
