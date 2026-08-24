import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { loadCatalog, parseStoredPlan } from "@/lib/training/db";
import { isAllowedSubstitute, withSubstitute } from "@/lib/training/substitutes";

/**
 * Cambiar un ejercicio de una sesión ya materializada.
 *
 * Llega por la misma cola que las series (`POST /api/training/sync`), no por
 * una ruta aparte: en el gimnasio no hay señal, y un cambio que solo funciona
 * con red no sirve justo cuando se necesita. El teléfono aplica el cambio en su
 * copia local y encola la instrucción; aquí se materializa cuando vuelve la red.
 *
 * Dos propiedades sostienen eso:
 *
 * 1. **Es idempotente.** Si el plan ya tiene ese ejercicio en ese lugar, no se
 *    hace nada — la cola puede reenviar la misma instrucción veinte veces.
 * 2. **Se validan las dos cosas**: que la sesión sea de quien la manda y que el
 *    ejercicio elegido sea uno de los que la pantalla podía ofrecer. El
 *    teléfono manda un id; el servidor no le cree.
 *
 * Las series ya capturadas **del ejercicio que se va** se borran: su `client_id`
 * empieza con `{workout}:{índice}:` y esas cargas eran de otra máquina. Las del
 * resto de la sesión no se tocan.
 */

export type SubstitutionInput = { exerciseIndex: number; exerciseId: string };

export type SubstitutionResult = {
  exerciseIndex: number;
  ok: boolean;
  /** Nombre del ejercicio que quedó en ese lugar. */
  name: string | null;
  /** Por qué no se pudo, cuando no se pudo. */
  reason?: "sesión no encontrada" | "índice inválido" | "ejercicio inexistente" | "no equivalente";
};

export async function applySubstitutions(
  userId: string,
  workoutId: string,
  substitutions: SubstitutionInput[],
): Promise<SubstitutionResult[]> {
  if (substitutions.length === 0) return [];

  // El filtro por `userId` es la defensa real: Prisma ignora RLS.
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    select: { id: true, exercisesJson: true },
  });

  if (!workout) {
    return substitutions.map((substitution) => ({
      exerciseIndex: substitution.exerciseIndex,
      ok: false,
      name: null,
      reason: "sesión no encontrada" as const,
    }));
  }

  const catalog = await loadCatalog();
  const plan = parseStoredPlan(workout.exercisesJson);
  const results: SubstitutionResult[] = [];
  const replaced = new Set<number>();

  for (const substitution of substitutions) {
    const current = plan.exercises[substitution.exerciseIndex];
    if (!current) {
      results.push({
        exerciseIndex: substitution.exerciseIndex,
        ok: false,
        name: null,
        reason: "índice inválido",
      });
      continue;
    }

    // Ya está puesto: la cola reenvió lo mismo. Nada que hacer, y sobre todo
    // nada que borrar — las series de hoy son del ejercicio nuevo.
    if (current.exerciseId === substitution.exerciseId) {
      results.push({ exerciseIndex: substitution.exerciseIndex, ok: true, name: current.name });
      continue;
    }

    const candidate = catalog.find((option) => option.id === substitution.exerciseId);
    if (!candidate) {
      results.push({
        exerciseIndex: substitution.exerciseIndex,
        ok: false,
        name: current.name,
        reason: "ejercicio inexistente",
      });
      continue;
    }

    if (!isAllowedSubstitute(current, candidate, catalog)) {
      results.push({
        exerciseIndex: substitution.exerciseIndex,
        ok: false,
        name: current.name,
        reason: "no equivalente",
      });
      continue;
    }

    plan.exercises[substitution.exerciseIndex] = withSubstitute(current, candidate);
    replaced.add(substitution.exerciseIndex);
    results.push({ exerciseIndex: substitution.exerciseIndex, ok: true, name: candidate.name });
  }

  if (replaced.size === 0) return results;

  await prisma.workout.update({
    where: { id: workout.id },
    data: {
      exercisesJson: {
        dayKind: plan.dayKind,
        schemeLabel: plan.schemeLabel,
        cardioMinutes: plan.cardioMinutes,
        exercises: plan.exercises,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.workoutSet.deleteMany({
    where: {
      workoutId: workout.id,
      OR: [...replaced].map((index) => ({ clientId: { startsWith: `${workout.id}:${index}:` } })),
    },
  });

  return results;
}
