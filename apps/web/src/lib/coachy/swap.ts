import type { Prisma } from "@prisma/client";

/**
 * Transformación pura de un intercambio de equivalencia sobre el JSON del
 * motor (`MealPlan.mealsJson` / `equivalencesJson`).
 *
 * Antes, elegir una equivalencia en el menú era de solo lectura: la app
 * mostraba la opción pero nada se guardaba, así que un refresh la perdía. Esta
 * función es el corazón de que el cambio SÍ se quede — la usa
 * `POST /api/v1/nutricion/swap`, que solo se encarga de cargar/guardar con
 * Prisma; la transformación en sí no sabe nada de la base, así que se prueba
 * sin levantar Postgres.
 *
 * El intercambio es REVERSIBLE a propósito: la opción elegida se reemplaza en
 * la equivalencia por el alimento que salió, con sus gramos originales — así
 * volver a tocar "cambiar" y elegir el original regresa exactamente a donde
 * estaba. Nunca se inventan gramos: los que entran son siempre los que ya
 * traía la opción elegida en el JSON guardado.
 */

export class SwapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapError";
  }
}

export interface SwapInput {
  slot: string;
  forName: string;
  toName: string;
}

export interface SwapResult {
  mealsJson: Prisma.JsonValue;
  equivalencesJson: Prisma.JsonValue;
}

type JsonRecord = Record<string, unknown>;

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

/**
 * Aplica el intercambio sobre el JSON guardado y regresa las dos copias ya
 * actualizadas (`mealsJson` completo y `equivalencesJson` aplanado). Lanza
 * `SwapError` — nunca inventa un hueco — si el `slot`, el `forName` o el
 * `toName` no existen tal cual en lo guardado.
 */
export function applySwap(
  mealsJson: Prisma.JsonValue,
  equivalencesJson: Prisma.JsonValue,
  input: SwapInput,
): SwapResult {
  const meals = asRecordArray(mealsJson);
  const meal = meals.find((entry) => entry.slot === input.slot);
  if (!meal) {
    throw new SwapError(`No existe la comida "${input.slot}" en este menú.`);
  }

  const items = asRecordArray(meal.items);
  const itemIndex = items.findIndex((item) => item.name === input.forName);
  if (itemIndex === -1) {
    throw new SwapError(`"${input.forName}" no está en la comida "${input.slot}".`);
  }
  const item = items[itemIndex]!;

  const equivalences = asRecordArray(meal.equivalences);
  const equivIndex = equivalences.findIndex((entry) => entry.forName === input.forName);
  if (equivIndex === -1) {
    throw new SwapError(`"${input.forName}" no tiene equivalencias en la comida "${input.slot}".`);
  }
  const equivalence = equivalences[equivIndex]!;

  const options = asRecordArray(equivalence.options);
  const optionIndex = options.findIndex((option) => option.name === input.toName);
  if (optionIndex === -1) {
    throw new SwapError(`"${input.toName}" no es una opción para "${input.forName}".`);
  }
  const option = options[optionIndex]!;

  const originalName = item.name;
  const originalGrams = item.grams;

  // El item se vuelve la elección: la equivalencia deja de ser lectura.
  const newItem: JsonRecord = { name: option.name, grams: option.grams, free: false };
  const newItems = items.map((entry, index) => (index === itemIndex ? newItem : entry));

  // La equivalencia de ese hueco ahora se busca desde la elección, y la
  // opción que se tomó se reemplaza por el alimento original — así la
  // próxima vez que se abra, "volver" está entre las opciones.
  const newOptions = options.map((entry, index) =>
    index === optionIndex ? { name: originalName, grams: originalGrams } : entry,
  );
  const newEquivalence: JsonRecord = { ...equivalence, forName: option.name, options: newOptions };
  const newEquivalences = equivalences.map((entry, index) =>
    index === equivIndex ? newEquivalence : entry,
  );

  const newMeal: JsonRecord = { ...meal, items: newItems, equivalences: newEquivalences };
  const newMeals = meals.map((entry) => (entry === meal ? newMeal : entry));

  // `equivalencesJson` es la copia aplanada con `slot` — mismo intercambio,
  // localizado por slot + forName. Si no está (JSON viejo o inconsistente),
  // se deja tal cual: `mealsJson` ya es la fuente de verdad de la vista.
  const flat = asRecordArray(equivalencesJson);
  const flatIndex = flat.findIndex(
    (entry) => entry.slot === input.slot && entry.forName === input.forName,
  );
  const newFlat =
    flatIndex === -1
      ? flat
      : flat.map((entry, index) =>
          index === flatIndex ? { ...entry, forName: option.name, options: newOptions } : entry,
        );

  return {
    mealsJson: newMeals as unknown as Prisma.JsonValue,
    equivalencesJson: newFlat as unknown as Prisma.JsonValue,
  };
}
