import type { Prisma } from "@prisma/client";

/**
 * Aplanado del JSON del motor (`MealPlan.mealsJson` / `groceryListJson`) a lo
 * que pinta la pantalla de alimentación.
 *
 * Compartido entre el home (`src/app/app/page.tsx`) y `GET /api/v1/nutrition`
 * (app nativa): un solo lugar para que web y app nunca diverjan en cómo se
 * lee el JSON del motor. Funciones puras, sin Prisma ni `server-only`: no
 * hacen falta, solo transforman el `Json` que ya trajo el caller.
 */

export interface MenuItemView {
  name: string;
  grams: number;
  free: boolean;
}

export interface MenuMealView {
  slot: string;
  label: string;
  timeHint: string;
  allowDenseCarb: boolean;
  items: MenuItemView[];
  equivalences: Array<{ forName: string; options: Array<{ name: string; grams: number }> }>;
}

export interface MenuView {
  menuNumber: number;
  meals: MenuMealView[];
}

export interface GroceryItemView {
  name: string;
  grams: number;
  unit: string;
}

/** El JSON del motor, aplanado a lo que necesita la vista. */
export function toMenuView(menuNumber: number, mealsJson: Prisma.JsonValue): MenuView {
  const meals = Array.isArray(mealsJson) ? mealsJson : [];

  return {
    menuNumber,
    meals: meals.map((raw) => {
      const meal = raw as Record<string, unknown>;
      const items = Array.isArray(meal.items) ? meal.items : [];
      const equivalences = Array.isArray(meal.equivalences) ? meal.equivalences : [];

      return {
        slot: String(meal.slot ?? ""),
        label: String(meal.label ?? ""),
        timeHint: String(meal.timeHint ?? ""),
        allowDenseCarb: meal.allowDenseCarb !== false,
        items: items.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            name: String(row.name ?? ""),
            grams: Number(row.grams ?? 0),
            free: row.free === true,
          };
        }),
        equivalences: equivalences.map((equivalence) => {
          const row = equivalence as Record<string, unknown>;
          const options = Array.isArray(row.options) ? row.options : [];
          return {
            forName: String(row.forName ?? ""),
            options: options.map((option) => {
              const item = option as Record<string, unknown>;
              return { name: String(item.name ?? ""), grams: Number(item.grams ?? 0) };
            }),
          };
        }),
      } satisfies MenuMealView;
    }),
  };
}

export function toGroceries(json: Prisma.JsonValue): GroceryItemView[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      name: String(item.name ?? ""),
      grams: Number(item.grams ?? 0),
      unit: String(item.unit ?? ""),
    };
  });
}
