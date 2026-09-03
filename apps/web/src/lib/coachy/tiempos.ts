import type { Profile } from "@prisma/client";

import { currentMealPlan } from "@/lib/coachy/menu";
import type { TiempoDeComida } from "@/lib/coachy/horarios";

/**
 * Los tiempos del menú vigente, en el orden del motor, con su hora efectiva.
 *
 * Vive separado de las rutas porque tres lugares lo necesitan con el mismo
 * significado exacto: el `GET` y el `PUT` de horarios (para pintar y para
 * validar) y las propuestas de aprendizaje (para saber contra qué candados
 * recortar). Duplicarlo sería el clásico "arreglé el orden aquí, se me
 * olvidó allá".
 */
export async function tiemposVigentes(
  userId: string,
  profile: Profile | null,
  horarios: Record<string, string>,
): Promise<TiempoDeComida[]> {
  if (!profile) return [];

  const nutrition = await currentMealPlan(userId, profile).catch(() => null);
  const meals = nutrition?.plans[0]?.mealsJson;
  if (!Array.isArray(meals)) return [];

  return meals.map((raw) => {
    const meal = raw as Record<string, unknown>;
    const slot = String(meal.slot ?? "");
    return {
      slot,
      label: String(meal.label ?? slot),
      hora: horarios[slot] ?? String(meal.timeHint ?? ""),
      propia: horarios[slot] !== undefined,
    };
  });
}
