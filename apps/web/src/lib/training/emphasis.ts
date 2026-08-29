import "server-only";

import { GOAL_KIND, parseGoalReadings, type GoalAction } from "@/lib/coachy/goal";
import { prisma } from "@/lib/prisma";
import type { MuscleGroup } from "@/lib/training/types";

/**
 * Del objetivo a la rutina: qué grupo lleva prioridad esta semana.
 *
 * Es la pieza que faltaba para que subir fotos sirva de algo más que leer un
 * texto. El análisis contra la referencia ya decidía una acción por zona
 * —"súmale volumen a pierna", "abre la semana con espalda"— y esas acciones se
 * quedaban en la pantalla. Aquí se traducen a grupos musculares y el generador
 * les da un ejercicio extra en los días que los tocan.
 *
 * Lo que NO hace: cambiar el split, los días, ni las cargas. Un análisis de
 * fotos puede inclinar el volumen; no puede reescribir la programación ni
 * decidir cuánto peso levantas.
 */

/** Acciones que sí mueven volumen, y a qué grupo. */
const GRUPO_POR_ACCION: Partial<Record<GoalAction, MuscleGroup[]>> = {
  mas_volumen_gluteo: ["PIERNA"],
  mas_volumen_pierna: ["PIERNA"],
  mas_volumen_espalda: ["ESPALDA"],
  priorizar_espalda: ["ESPALDA"],
  mas_volumen_brazo: ["BICEP", "TRICEP"],
};

/**
 * Los grupos con prioridad, según el último análisis contra la referencia.
 *
 * Sale del caché del análisis (la conversación marcada como `rumbo_objetivo`),
 * no de una llamada nueva: el objetivo se relee cada quincena y el generador
 * corre cada semana, así que pedirle al modelo otra lectura aquí gastaría por
 * gusto. Sin análisis todavía, la lista viene vacía y la rutina se arma como
 * siempre.
 */
export async function emphasisFor(userId: string): Promise<MuscleGroup[]> {
  const filas = await prisma.conversation
    .findMany({
      where: { userId, role: "COACHY" },
      orderBy: { date: "desc" },
      take: 20,
      select: { contextJson: true },
    })
    .catch(() => []);

  for (const fila of filas) {
    const raw = fila.contextJson as Record<string, unknown> | null;
    if (!raw || raw.kind !== GOAL_KIND) continue;

    const grupos = new Set<MuscleGroup>();
    for (const lectura of parseGoalReadings(raw.readings)) {
      // Solo lo que está lejos o a medio camino mueve la aguja: una zona que
      // ya está cerca no necesita más volumen, necesita sostenerse.
      if (lectura.brecha === "cerca") continue;
      for (const grupo of GRUPO_POR_ACCION[lectura.accion] ?? []) grupos.add(grupo);
    }
    return [...grupos];
  }

  return [];
}
