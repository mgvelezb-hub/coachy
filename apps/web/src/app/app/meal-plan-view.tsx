"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Dieta vigente: Menú 1 / Menú 2, equivalencias por comida y lista de súper.
 *
 * Los datos llegan ya serializados desde el servidor — el motor no viaja al
 * navegador solo para pintar gramos.
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

function Meal({ meal }: { meal: MenuMealView }): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{meal.label}</h3>
        <span className="text-xs text-muted-foreground">{meal.timeHint}</span>
      </div>

      <ul className="space-y-1 text-sm">
        {meal.items.map((item) => (
          <li key={item.name} className="flex justify-between gap-3">
            <span>{item.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.free ? "libre" : `${item.grams} g`}
            </span>
          </li>
        ))}
      </ul>

      {meal.equivalences.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            ¿No tienes algo? Equivalencias
          </summary>
          <ul className="mt-2 space-y-1.5">
            {meal.equivalences.map((equivalence) => (
              <li key={equivalence.forName}>
                <span className="font-medium">{equivalence.forName}</span>{" "}
                <span className="text-muted-foreground">
                  ={" "}
                  {equivalence.options
                    .map((option) => `${option.name} ${option.grams} g`)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function MealPlanView({
  menus,
  groceries,
}: {
  menus: MenuView[];
  groceries: GroceryItemView[];
}): React.JSX.Element {
  const first = menus[0];
  if (!first) return <p className="text-sm text-muted-foreground">Todavía no hay menú.</p>;

  return (
    <Tabs defaultValue={String(first.menuNumber)} className="space-y-3">
      <TabsList className="grid w-full grid-cols-3">
        {menus.map((menu) => (
          <TabsTrigger key={menu.menuNumber} value={String(menu.menuNumber)}>
            Menú {menu.menuNumber}
          </TabsTrigger>
        ))}
        <TabsTrigger value="super">Súper</TabsTrigger>
      </TabsList>

      {menus.map((menu) => (
        <TabsContent key={menu.menuNumber} value={String(menu.menuNumber)} className="space-y-3">
          {menu.meals.map((meal) => (
            <Meal key={`${menu.menuNumber}-${meal.slot}`} meal={meal} />
          ))}
        </TabsContent>
      ))}

      <TabsContent value="super">
        <ul className="space-y-1 text-sm">
          {groceries.map((item) => (
            <li key={item.name} className="flex justify-between gap-3 border-b py-1">
              <span>{item.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.grams} g {item.unit ? `· ${item.unit}` : ""}
              </span>
            </li>
          ))}
          {groceries.length === 0 ? (
            <li className="text-muted-foreground">Sin lista todavía.</li>
          ) : null}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
