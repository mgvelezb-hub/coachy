import { z } from "zod";

import { CYCLE_PHASES, STRENGTH_TRENDS, SYMPTOMS } from "@/lib/validation/checkin";

/**
 * Formato del JSON privado que el admin sube en /admin/import.
 *
 * Es la única vía para meter historial real a la app: el repo es público y no
 * lleva seeds con datos de personas.
 */

const PHASES = [
  "REINTRO",
  "BASE",
  "CUT",
  "CUT_AGRESIVO",
  "REFEED",
  "ESTABILIZACION",
  "MANTENIMIENTO",
] as const;

const importedCheckInSchema = z.object({
  date: z.iso.date("Fecha inválida (usa YYYY-MM-DD)"),
  weightKg: z.number().min(25).max(400).nullable().optional(),
  waistCm: z.number().min(10).max(250).nullable().optional(),
  legLeftCm: z.number().min(10).max(250).nullable().optional(),
  legRightCm: z.number().min(10).max(250).nullable().optional(),
  armLeftCm: z.number().min(10).max(250).nullable().optional(),
  armRightCm: z.number().min(10).max(250).nullable().optional(),
  inflammation: z.number().int().min(1).max(5).default(3),
  energy: z.number().int().min(1).max(5).default(3),
  hunger: z.number().int().min(1).max(5).default(3),
  satiety: z.number().int().min(1).max(5).default(3),
  sleep: z.number().int().min(1).max(5).default(3),
  strengthRpe: z.number().int().min(1).max(10).nullable().optional(),
  strengthTrend: z.enum(STRENGTH_TRENDS).nullable().optional(),
  dietCompliance: z.number().int().min(0).max(100).default(100),
  trainingCompliance: z.number().int().min(0).max(100).default(100),
  symptoms: z.array(z.enum(SYMPTOMS)).default([]),
  cyclePhase: z.enum(CYCLE_PHASES).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),

  /** Decisión que se tomó esa semana, si se conoce. */
  decision: z
    .object({
      phase: z.enum(PHASES),
      kcal: z.number().int().min(800).max(6000),
      proteinG: z.number().int().min(30).max(400),
      fatG: z.number().int().min(15).max(250),
      carbsG: z.number().int().min(0).max(800),
      fiberG: z.number().int().min(0).max(120).nullable().optional(),
      explanation: z.string().max(4000).default(""),
      rules: z
        .array(z.object({ id: z.string(), explanation: z.string() }))
        .default([]),
      /** Histórico = ya validado por una persona. */
      status: z.enum(["PENDIENTE", "APROBADA", "CORREGIDA"]).default("APROBADA"),
    })
    .optional(),
});

export const athleteImportSchema = z.object({
  /** Email del atleta destino; debe existir ya como usuario registrado. */
  athleteEmail: z.email("Email inválido"),
  checkIns: z
    .array(importedCheckInSchema)
    .min(1, "Incluye al menos un check-in")
    .max(500, "Máximo 500 check-ins por archivo"),
  /** Ejemplos de tono aprobados, para el few-shot de Coachy (Fase 2). */
  trainingExamples: z
    .array(
      z.object({
        context: z.record(z.string(), z.unknown()),
        approvedResponse: z.string().min(1),
        source: z.enum(["COACH", "ADMIN"]).default("COACH"),
      }),
    )
    .default([]),
});

export type AthleteImport = z.infer<typeof athleteImportSchema>;
export type ImportedCheckIn = z.infer<typeof importedCheckInSchema>;

export type ImportParse =
  | { ok: true; data: AthleteImport }
  | { ok: false; errors: string[] };

export function parseAthleteImport(text: string): ImportParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`JSON inválido: ${(error as Error).message}`] };
  }

  const parsed = athleteImportSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };

  return {
    ok: false,
    errors: parsed.error.issues.slice(0, 25).map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

/** Ejemplo mínimo que se muestra en la UI del importador. */
export const IMPORT_EXAMPLE = `{
  "athleteEmail": "atleta@ejemplo.com",
  "checkIns": [
    {
      "date": "2026-02-16",
      "waistCm": 90,
      "weightKg": 75,
      "legLeftCm": 60,
      "legRightCm": 63,
      "armLeftCm": 33,
      "armRightCm": 34,
      "inflammation": 3,
      "energy": 4,
      "hunger": 2,
      "satiety": 4,
      "sleep": 3,
      "strengthTrend": "SUBE",
      "dietCompliance": 80,
      "trainingCompliance": 90,
      "symptoms": [],
      "comment": "",
      "decision": {
        "phase": "BASE",
        "kcal": 1750,
        "proteinG": 130,
        "fatG": 45,
        "carbsG": 200,
        "explanation": "Cintura bajando, peso igual: recomposición. Se mantiene el plan."
      }
    }
  ],
  "trainingExamples": []
}`;
