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
  /** "3 tortillas de maíz" cuando el alimento se sirve por pieza. */
  portion: string | null;
}

export interface MenuMealView {
  slot: string;
  label: string;
  timeHint: string;
  allowDenseCarb: boolean;
  items: MenuItemView[];
  equivalences: Array<{
    forName: string;
    options: Array<{
      name: string;
      grams: number;
      portion: string | null;
      /** true si esa opción sola se sale del ±10 %: sirve, pero no es igual. */
      aproximada?: boolean;
    }>;
    /** true si alguna de sus opciones es aproximada; la app lo advierte. */
    aproximada?: boolean;
  }>;
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
import { porcionNatural } from "@/lib/coachy/porciones";

export function toMenuView(
  menuNumber: number,
  mealsJson: Prisma.JsonValue,
  /**
   * Horarios propios `{slot: "HH:MM"}`. Los tiempos que la persona movió
   * pisan la hora sugerida por el motor; los demás se quedan como estaban.
   */
  horarios: Record<string, string> = {},
): MenuView {
  const meals = Array.isArray(mealsJson) ? mealsJson : [];

  return {
    menuNumber,
    meals: meals.map((raw) => {
      const meal = raw as Record<string, unknown>;
      const items = Array.isArray(meal.items) ? meal.items : [];
      const equivalences = Array.isArray(meal.equivalences) ? meal.equivalences : [];

      const slot = String(meal.slot ?? "");

      return {
        slot,
        label: String(meal.label ?? ""),
        timeHint: horarios[slot] ?? String(meal.timeHint ?? ""),
        allowDenseCarb: meal.allowDenseCarb !== false,
        items: items.map((item) => {
          const row = item as Record<string, unknown>;
          const name = String(row.name ?? "");
          const grams = Number(row.grams ?? 0);
          return {
            name,
            grams,
            free: row.free === true,
            // Lo que se compra por pieza se dice en piezas: nadie pesa una
            // tortilla, y "90 g" obliga a dividir para saber si son tres.
            portion: porcionNatural(name, grams),
          };
        }),
        equivalences: equivalences.map((equivalence) => {
          const row = equivalence as Record<string, unknown>;
          const options = Array.isArray(row.options) ? row.options : [];
          return {
            forName: String(row.forName ?? ""),
            options: options.map((option) => {
              const item = option as Record<string, unknown>;
              const nombre = String(item.name ?? "");
              const gramos = Number(item.grams ?? 0);
              return {
                name: nombre,
                grams: gramos,
                portion: porcionNatural(nombre, gramos),
                // Los menús guardados antes de que existiera la marca no la
                // traen: ausente se lee como exacta, que es lo que eran.
                ...(item.aproximada === true ? { aproximada: true } : {}),
              };
            }),
            ...(row.aproximada === true ? { aproximada: true } : {}),
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
