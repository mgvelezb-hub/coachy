import { z } from "zod";

/**
 * Config del motor (spec 02 §7). Editable por el admin sin tocar código.
 *
 * TODO(fase-2): cuando `@coachy/engine` exporte `loadConfig`, delegar la
 * validación ahí y dejar este archivo solo como re-export.
 */

const range = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([lo, hi]) => lo <= hi, { message: "El rango debe ir de menor a mayor" });

export const engineConfigSchema = z.object({
  deficits: z.object({
    REINTRO: range,
    BASE: range,
    CUT: range,
    CUT_AGRESIVO: range,
    REFEED: range,
  }),
  max_semanas: z.object({
    CUT: z.number().int().min(1).max(26),
    CUT_AGRESIVO: z.number().int().min(1).max(8),
    REFEED: z.number().int().min(1).max(4),
  }),
  proteina_g_por_kg_mlg: z.number().min(1).max(4),
  grasa_min_g_por_kg: z.number().min(0.2).max(1.5),
  paso_kcal_ajuste: z.number().int().min(25).max(500),
  refeed_extra_carbos_g: z.number().int().min(0).max(300),
  umbral_progreso_cintura_cm_sem: z.number().max(0),
  semanas_para_estancamiento: z.number().int().min(1).max(8),
  adherencia_minima_para_profundizar: z.number().min(0).max(1),
  tasa_perdida_max_pct_sem: z.number().min(0.1).max(5),
});

export type EngineConfig = z.infer<typeof engineConfigSchema>;

/** Defaults de la spec 02 §7. */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  deficits: {
    REINTRO: [0.1, 0.15],
    BASE: [0.2, 0.25],
    CUT: [0.25, 0.3],
    CUT_AGRESIVO: [0.3, 0.38],
    REFEED: [0.2, 0.25],
  },
  max_semanas: { CUT: 6, CUT_AGRESIVO: 3, REFEED: 1 },
  proteina_g_por_kg_mlg: 2.3,
  grasa_min_g_por_kg: 0.5,
  paso_kcal_ajuste: 125,
  refeed_extra_carbos_g: 75,
  umbral_progreso_cintura_cm_sem: -0.5,
  semanas_para_estancamiento: 2,
  adherencia_minima_para_profundizar: 0.7,
  tasa_perdida_max_pct_sem: 1.0,
};

export type ConfigValidation =
  | { ok: true; config: EngineConfig }
  | { ok: false; errors: string[] };

/** Valida un JSON de config y devuelve errores legibles en español. */
export function validateEngineConfig(raw: unknown): ConfigValidation {
  const parsed = engineConfigSchema.safeParse(raw);
  if (parsed.success) return { ok: true, config: parsed.data };

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

/** Parsea texto JSON y valida. Un JSON roto también es un error legible. */
export function parseEngineConfig(text: string): ConfigValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`JSON inválido: ${(error as Error).message}`] };
  }
  return validateEngineConfig(raw);
}
