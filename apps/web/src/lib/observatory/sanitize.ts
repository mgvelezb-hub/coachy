/**
 * Filtro de privacidad del observatorio (Fase 7).
 *
 * El ciclo menstrual es de la atleta. El admin necesita saber que una semana
 * **no es concluyente** para no leerla como estancamiento; no necesita saber
 * por qué, y no tiene por qué enterarse de en qué fase del ciclo está.
 *
 * El motor, en cambio, sí nombra la fase en la explicación de su regla R1
 * ("semana en fase lútea o menstruación..."). Ese texto se guarda en
 * `decisions.rules` y en `decisions.explanation`, y llega tal cual al mensaje de
 * la atleta — donde sí corresponde. Antes de pintarlo en `/admin` pasa por aquí.
 *
 * Módulo puro.
 */

/** Cómo se nombra una semana no concluyente en la vista del admin. */
export const INCONCLUSIVE_LABEL = "semana no concluyente";

/**
 * Términos del ciclo, con y sin acento. Se reemplazan por la etiqueta neutra.
 * El orden importa: las frases largas primero, para no dejar restos.
 */
const CYCLE_PHRASES: RegExp[] = [
  /\bfase\s+l[uú]tea\s+o\s+menstruaci[oó]n\b/gi,
  /\bfase\s+menstrual\s+o\s+l[uú]tea\b/gi,
  /\bfase\s+l[uú]tea\b/gi,
  /\bfase\s+folicular\b/gi,
  /\bfase\s+del\s+ciclo\b/gi,
  /\bl[uú]tea\b/gi,
  /\bfolicular\b/gi,
  /\bovulaci[oó]n\b/gi,
  /\bmenstruaci[oó]n\b/gi,
  /\bmenstrual(es)?\b/gi,
  /\bperiodo\s+menstrual\b/gi,
  /\bciclo\s+menstrual\b/gi,
];

/**
 * Quita cualquier mención a la fase del ciclo de un texto destinado al admin.
 *
 * Es deliberadamente burdo: prefiere una frase que se lea raro a una frase que
 * revele un dato de salud. Nunca se aplica al texto que ve la atleta.
 */
export function sanitizeForAdmin(text: string | null | undefined): string {
  if (!text) return "";

  let out = text;
  for (const phrase of CYCLE_PHRASES) {
    out = out.replace(phrase, INCONCLUSIVE_LABEL);
  }

  // Dos reemplazos seguidos ("lútea o menstruación") dejan la etiqueta repetida.
  const repeated = new RegExp(
    `${INCONCLUSIVE_LABEL}(\\s*(o|y|,)\\s*${INCONCLUSIVE_LABEL})+`,
    "gi",
  );
  return out.replace(repeated, INCONCLUSIVE_LABEL);
}
