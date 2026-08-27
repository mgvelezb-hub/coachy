/**
 * Convención de `clientId` de una serie — CONTRATO con el servidor.
 *
 * Exacta a la de la web (apps/web/src/app/app/entrenamiento/training-session.tsx,
 * función `queuePayload`): `${workoutId}:${exerciseIndex}:${setIndex}`.
 *
 * El servidor la usa para el borrado selectivo al sustituir un ejercicio
 * (apps/web/src/lib/training/substitute-write.ts hace `deleteMany` con
 * `clientId: { startsWith: "{workoutId}:{exerciseIndex}:" }`), así que el
 * prefijo tiene que coincidir carácter por carácter.
 */
export function clientIdFor(workoutId: string, exerciseIndex: number, setIndex: number): string {
  return `${workoutId}:${exerciseIndex}:${setIndex}`;
}

/** El prefijo que identifica todas las series de un ejercicio dentro de una sesión. */
export function exercisePrefix(workoutId: string, exerciseIndex: number): string {
  return `${workoutId}:${exerciseIndex}:`;
}
