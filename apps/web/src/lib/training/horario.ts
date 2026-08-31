/**
 * A qué hora entrena una persona, y qué significa eso para su comida.
 *
 * Vive aquí y no en la ruta que lo guarda porque un archivo `route.ts` de Next
 * solo puede exportar los handlers de HTTP: cualquier otro export rompe la
 * compilación con "does not match the required types of a Next.js Route".
 */

/** Los cuatro horarios que reconoce el perfil (`TrainingTime` en Prisma). */
export const TRAINING_TIMES = ["MANANA", "MEDIODIA", "TARDE", "NOCHE"] as const;

export type TrainingTimeValue = (typeof TRAINING_TIMES)[number];

/**
 * El motor solo distingue mañana de tarde: es lo único que cambia el reparto
 * de carbohidratos del día. Mediodía cuenta como mañana y noche como tarde.
 *
 * Sirve para saber si un cambio de horario obliga a rearmar el menú: pasar de
 * mañana a mediodía mueve la etiqueta, pero de mañana a noche mueve la
 * estructura completa del día.
 */
export function bloqueDelMotor(hora: string): "manana" | "tarde" {
  return hora === "TARDE" || hora === "NOCHE" ? "tarde" : "manana";
}
