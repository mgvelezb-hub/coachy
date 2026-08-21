import { readFileSync } from "node:fs";
import path from "node:path";

import type { FewShotExample } from "@/lib/coachy/types";
import { prisma } from "@/lib/prisma";

/**
 * Few-shot de tono.
 *
 * Fuente de verdad en producción: la tabla `training_examples`. Ahí caen los
 * ejemplos que el admin importa y, sobre todo, cada corrección suya — que es
 * como Coachy aprende (spec 03 §3.4).
 *
 * Fallback local: `apps/web/data/private/coach-fewshot.json`, una carpeta
 * ignorada por git. El repo es público: ese archivo nunca se versiona y en un
 * deploy simplemente no existe, así que allá manda la base.
 */

const PRIVATE_FILE = path.join("data", "private", "coach-fewshot.json");

/** Cuántos ejemplos caben en el prompt sin inflarlo de más. */
export const MAX_FEWSHOT = 20;

interface FewShotFile {
  examples?: unknown;
}

function isExample(value: unknown): value is FewShotExample {
  if (value === null || typeof value !== "object") return false;
  const example = value as Record<string, unknown>;
  return (
    typeof example.id === "string" &&
    typeof example.respuesta === "string" &&
    example.contexto !== null &&
    typeof example.contexto === "object"
  );
}

/** Lee el archivo privado. Devuelve `[]` si no existe: no es un error. */
export function loadFewShotFromFile(cwd: string = process.cwd()): FewShotExample[] {
  try {
    const raw = readFileSync(path.resolve(cwd, PRIVATE_FILE), "utf8");
    const parsed = JSON.parse(raw) as FewShotFile;
    if (!Array.isArray(parsed.examples)) return [];
    return parsed.examples.filter(isExample);
  } catch {
    return [];
  }
}

/**
 * Ejemplos para el prompt: primero los de la base (correcciones del admin al
 * frente, que son las que más pesan), y si no hay ninguno, el archivo privado.
 */
export async function loadFewShotExamples(userId?: string): Promise<FewShotExample[]> {
  const rows = await prisma.trainingExample.findMany({
    where: userId ? { OR: [{ userId }, { userId: null }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: MAX_FEWSHOT,
  });

  if (rows.length > 0) {
    // El orden de un enum en Postgres es el de su declaración, no el alfabético,
    // así que la prioridad de las correcciones se resuelve aquí y no en el SQL.
    const weight = (source: string): number => (source === "ADMIN" ? 0 : 1);
    return rows
      .sort((a, b) => weight(a.source) - weight(b.source))
      .map((row) => ({
        id: row.id,
        contexto: (row.contextJson ?? {}) as Record<string, unknown>,
        respuesta: row.approvedResponse,
      }));
  }

  return loadFewShotFromFile().slice(0, MAX_FEWSHOT);
}
