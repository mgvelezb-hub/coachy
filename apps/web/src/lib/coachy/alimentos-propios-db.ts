import "server-only";

import type { CustomFood } from "@prisma/client";
import type { Food } from "engine";

import { aFoodDelMotor, type FilaAlimentoPropio } from "@/lib/coachy/alimentos-propios";
import { prisma } from "@/lib/prisma";

/** La fila de Prisma con sus decimales ya en número. */
export function aFila(fila: CustomFood): FilaAlimentoPropio {
  return {
    id: fila.id,
    name: fila.name,
    role: fila.role,
    proteinPer100: Number(fila.proteinPer100),
    carbPer100: Number(fila.carbPer100),
    fatPer100: Number(fila.fatPer100),
    fiberPer100: Number(fila.fiberPer100),
    servingUnit: fila.servingUnit,
    gramsPerUnit: Number(fila.gramsPerUnit),
    minUnits: Number(fila.minUnits),
    maxUnits: Number(fila.maxUnits),
    tags: fila.tags,
  };
}

/**
 * Los alimentos que dio de alta esa persona, listos para el motor.
 *
 * Se lee en TODOS los caminos que arman menú —el check-in semanal, rearmar por
 * despensa, "regenerar mi menú"— porque un alimento propio que solo entra por
 * uno de ellos es un alimento que aparece y desaparece según por dónde se
 * pidió el menú.
 *
 * Un error aquí no puede dejar a nadie sin menú: si la consulta falla, se
 * genera con el catálogo de siempre, que es exactamente lo que había antes.
 */
export async function alimentosPropiosDe(userId: string): Promise<Food[]> {
  try {
    const filas = await prisma.customFood.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    return filas.map((fila) => aFoodDelMotor(aFila(fila)));
  } catch (error) {
    console.error("[coachy] no se pudieron leer los alimentos propios", error);
    return [];
  }
}
