import { DEFAULT_CONFIG, loadConfig, type ConfigOverrides, type EngineConfig } from "engine";

/**
 * Validación de la config del motor para el editor del admin.
 *
 * La fuente de verdad es `packages/engine`: aquí solo se envuelve `loadConfig`
 * para convertir sus errores en mensajes legibles en español. El admin escribe
 * *overrides* parciales; `loadConfig` los mezcla con los defaults y valida el
 * resultado completo, así que no puede guardarse una config que el motor
 * después rechace.
 */

export type { EngineConfig, ConfigOverrides };

export const DEFAULT_ENGINE_CONFIG: EngineConfig = DEFAULT_CONFIG;

export type ConfigValidation =
  | { ok: true; overrides: ConfigOverrides; resolved: EngineConfig }
  | { ok: false; errors: string[] };

/** Extrae los mensajes de un error de zod anidado, ya con su ruta. */
function readableErrors(error: unknown): string[] {
  const issues = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> })?.issues;

  if (Array.isArray(issues)) {
    return issues.slice(0, 25).map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }

  if (error instanceof Error) return [error.message];
  return ["Config inválida"];
}

/** Valida overrides ya parseados contra el esquema real del motor. */
export function validateEngineConfig(raw: unknown): ConfigValidation {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["La config debe ser un objeto JSON."] };
  }

  const overrides = raw as ConfigOverrides;

  try {
    const resolved = loadConfig(overrides);
    return { ok: true, overrides, resolved };
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return { ok: false, errors: readableErrors(cause ?? error) };
  }
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
