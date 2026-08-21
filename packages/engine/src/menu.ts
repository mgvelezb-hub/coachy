import { DEFAULT_CONFIG, type EngineConfig } from './config.js';
import { roundTo } from './calc.js';
import { FOODS, matchesAny } from './foods.js';
import type {
  Equivalence,
  Food,
  FoodRole,
  MacroTargets,
  MealSlot,
  Menu,
  MenuItem,
  MenuMeal,
  MenuPlan,
  Phase,
  Profile,
  ShoppingItem,
} from './types.js';

const DENSE_CARB_ROLES: FoodRole[] = ['carbo_pre', 'carbo_post', 'carbo_complejo'];

/** PRNG determinista (mulberry32): misma semilla, mismo menu. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gramos maximos razonables por alimento, para no proponer 400 g de aceite. */
function maxGrams(food: Food): number {
  if (food.role === 'suplemento') return 20;
  if (food.kcalPer100 >= 700) return 40;
  if (food.kcalPer100 >= 450) return 80;
  if (food.kcalPer100 >= 250) return 200;
  return 400;
}

export interface MenuOptions {
  phase?: Phase;
  /** Menos ingredientes y mas repeticion (regla de adherencia). */
  simplify?: boolean;
  /** Dias por semana que se usa cada menu, para la lista de super. */
  daysPerMenu?: number;
}

function eligible(pool: Food[], profile: Profile, config: EngineConfig, role: FoodRole): Food[] {
  const excluded = [...(profile.excludedFoods ?? []), ...(profile.allergies ?? [])];
  return pool.filter((food) => {
    if (food.role !== role) return false;
    if (matchesAny(food, excluded)) return false;
    if (profile.budget === 'bajo' && food.costRel > 2) return false;
    if (profile.maxPrepMin !== undefined && food.prepMin > profile.maxPrepMin) return false;
    if (
      profile.conditions?.glucosaAlta &&
      DENSE_CARB_ROLES.includes(role) &&
      food.gi !== null &&
      food.gi > config.lowGiMax
    ) {
      return false;
    }
    return true;
  });
}

function pick(candidates: Food[], profile: Profile, random: () => number, avoid: Set<string>): Food | undefined {
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((f) => !avoid.has(f.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const weights = pool.map((f) => (matchesAny(f, profile.favoriteFoods) ? 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let ticket = random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    ticket -= weights[i] ?? 0;
    if (ticket <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

interface Slot {
  food: Food;
  grams: number;
  fixed: boolean;
}

function macrosOf(slot: Slot): { p: number; c: number; f: number; fib: number; kcal: number } {
  const k = slot.grams / 100;
  return {
    p: slot.food.proteinPer100 * k,
    c: slot.food.carbPer100 * k,
    f: slot.food.fatPer100 * k,
    fib: slot.food.fiberPer100 * k,
    kcal: slot.food.kcalPer100 * k,
  };
}

function sum(slots: Slot[], key: 'p' | 'c' | 'f'): number {
  return slots.reduce((acc, s) => acc + macrosOf(s)[key], 0);
}

/**
 * Resuelve gramos por Gauss-Seidel: cada alimento domina su propio macro
 * (proteina exacta, carbo ajusta, grasa cierra). Converge en pocas pasadas.
 */
function solveGrams(
  slots: Slot[],
  target: { p: number; c: number; f: number },
  roundingG: number,
): void {
  const proteinSlot = slots.find((s) => !s.fixed && s.food.proteinPer100 >= 8);
  const carbSlot = slots.find((s) => !s.fixed && s.food.carbPer100 >= 10 && s !== proteinSlot);
  const fatSlot = slots.find((s) => !s.fixed && s.food.fatPer100 >= 10 && s !== proteinSlot && s !== carbSlot);

  for (let iter = 0; iter < 24; iter += 1) {
    if (fatSlot) {
      const others = sum(slots.filter((s) => s !== fatSlot), 'f');
      fatSlot.grams = clampGrams(((target.f - others) * 100) / fatSlot.food.fatPer100, fatSlot.food);
    }
    if (carbSlot) {
      const others = sum(slots.filter((s) => s !== carbSlot), 'c');
      carbSlot.grams = clampGrams(((target.c - others) * 100) / carbSlot.food.carbPer100, carbSlot.food);
    }
    if (proteinSlot) {
      const others = sum(slots.filter((s) => s !== proteinSlot), 'p');
      proteinSlot.grams = clampGrams(
        ((target.p - others) * 100) / proteinSlot.food.proteinPer100,
        proteinSlot.food,
      );
    }
  }

  for (const slot of slots) {
    if (slot.fixed) continue;
    slot.grams = Math.max(0, roundTo(slot.grams, roundingG));
  }

  // Pase de reparacion: ajusta el carbo y luego la grasa en pasos de `roundingG`.
  for (const slot of [carbSlot, fatSlot, proteinSlot]) {
    if (!slot) continue;
    let best = error(slots, target);
    for (let step = 0; step < 8; step += 1) {
      const up = { ...slot, grams: slot.grams + roundingG };
      const down = { ...slot, grams: Math.max(0, slot.grams - roundingG) };
      const errUp = error(slots.map((s) => (s === slot ? up : s)), target);
      const errDown = error(slots.map((s) => (s === slot ? down : s)), target);
      if (errUp < best && errUp <= errDown && up.grams <= maxGrams(slot.food)) {
        slot.grams = up.grams;
        best = errUp;
      } else if (errDown < best) {
        slot.grams = down.grams;
        best = errDown;
      } else {
        break;
      }
    }
  }
}

function clampGrams(grams: number, food: Food): number {
  if (!Number.isFinite(grams)) return 0;
  return Math.min(Math.max(grams, 0), maxGrams(food));
}

function error(slots: Slot[], target: { p: number; c: number; f: number }): number {
  const p = sum(slots, 'p') - target.p;
  const c = sum(slots, 'c') - target.c;
  const f = sum(slots, 'f') - target.f;
  return p * p * 1.5 + c * c + f * f * 2;
}

function toItem(slot: Slot, free: boolean): MenuItem {
  const m = macrosOf(slot);
  return {
    foodId: slot.food.id,
    name: slot.food.name,
    grams: Math.round(slot.grams),
    proteinG: round1(m.p),
    carbG: round1(m.c),
    fatG: round1(m.f),
    fiberG: round1(m.fib),
    kcal: Math.round(m.kcal),
    free,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function primaryMacroOf(role: FoodRole): 'proteinPer100' | 'carbPer100' | 'fatPer100' {
  if (role === 'proteina_magra' || role === 'proteina_grasa') return 'proteinPer100';
  if (role === 'grasa') return 'fatPer100';
  return 'carbPer100';
}

function equivalencesFor(
  slot: Slot,
  pool: Food[],
  profile: Profile,
  config: EngineConfig,
): Equivalence | null {
  if (slot.food.role === 'vegetal_libre' || slot.food.role === 'suplemento') return null;
  const key = primaryMacroOf(slot.food.role);
  const base = slot.food[key];
  if (base <= 0 || slot.grams <= 0) return null;
  const options = eligible(pool, profile, config, slot.food.role)
    .filter((f) => f.id !== slot.food.id && f[key] > 0)
    .sort((a, b) => Math.abs(a[key] - base) - Math.abs(b[key] - base))
    .slice(0, config.equivalencesPerItem)
    .map((f) => ({
      foodId: f.id,
      name: f.name,
      grams: Math.max(
        config.menuGramRoundingG,
        roundTo((slot.grams * base) / f[key], config.menuGramRoundingG),
      ),
    }));
  if (options.length === 0) return null;
  return { forFoodId: slot.food.id, forName: slot.food.name, options };
}

function slotCarbRole(slotId: MealSlot['id']): FoodRole {
  if (slotId === 'PRE') return 'carbo_pre';
  if (slotId === 'POST') return 'carbo_post';
  return 'carbo_complejo';
}

function buildMeal(
  slot: MealSlot,
  profile: Profile,
  config: EngineConfig,
  random: () => number,
  avoid: Set<string>,
  pool: Food[],
  options: MenuOptions,
): MenuMeal {
  const slots: Slot[] = [];

  if (slot.freeVegetables && config.freeVegetableGramsPerMeal > 0) {
    const veg = pick(eligible(pool, profile, config, 'vegetal_libre'), profile, random, avoid);
    if (veg) {
      slots.push({ food: veg, grams: config.freeVegetableGramsPerMeal, fixed: true });
      avoid.add(veg.id);
    }
  }

  if (slot.id === 'PRE' && slot.allowDenseCarb && !options.simplify) {
    const fruit = pick(eligible(pool, profile, config, 'fruta'), profile, random, avoid);
    if (fruit) {
      slots.push({ food: fruit, grams: fruit.servingG ?? 100, fixed: true });
      avoid.add(fruit.id);
    }
  }

  const wantsFat = slot.fatG > 0;
  const proteinRole: FoodRole = wantsFat && random() < 0.35 ? 'proteina_grasa' : 'proteina_magra';
  const protein =
    pick(eligible(pool, profile, config, proteinRole), profile, random, avoid) ??
    pick(eligible(pool, profile, config, 'proteina_magra'), profile, random, avoid);
  if (protein) {
    slots.push({ food: protein, grams: 100, fixed: false });
    avoid.add(protein.id);
  }

  if (slot.carbG > 0 && slot.allowDenseCarb) {
    const carb = pick(eligible(pool, profile, config, slotCarbRole(slot.id)), profile, random, avoid);
    if (carb) {
      slots.push({ food: carb, grams: 100, fixed: false });
      avoid.add(carb.id);
    }
  }

  if (wantsFat) {
    const fat = pick(eligible(pool, profile, config, 'grasa'), profile, random, avoid);
    if (fat) {
      slots.push({ food: fat, grams: 15, fixed: false });
      avoid.add(fat.id);
    }
  }

  const fixedMacros = slots
    .filter((s) => s.fixed)
    .reduce(
      (acc, s) => {
        const m = macrosOf(s);
        return { p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
      },
      { p: 0, c: 0, f: 0 },
    );

  solveGrams(
    slots,
    {
      p: slot.proteinG,
      c: slot.carbG,
      f: slot.fatG,
    },
    config.menuGramRoundingG,
  );
  void fixedMacros;

  const items = slots.map((s) => toItem(s, s.fixed && s.food.role === 'vegetal_libre'));
  const equivalences = slots
    .map((s) => equivalencesFor(s, pool, profile, config))
    .filter((e): e is Equivalence => e !== null);

  const totals = items.reduce<MacroTargets>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteinG: round1(acc.proteinG + item.proteinG),
      carbG: round1(acc.carbG + item.carbG),
      fatG: round1(acc.fatG + item.fatG),
      fiberG: round1(acc.fiberG + item.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );

  return {
    slot: slot.id,
    label: slot.label,
    timeHint: slot.timeHint,
    items,
    equivalences,
    totals,
    target: {
      kcal: slot.kcal,
      proteinG: slot.proteinG,
      carbG: slot.carbG,
      fatG: slot.fatG,
      fiberG: 0,
    },
  };
}

function buildMenu(
  id: 1 | 2,
  slots: MealSlot[],
  profile: Profile,
  config: EngineConfig,
  seed: number,
  pool: Food[],
  options: MenuOptions,
  target: MacroTargets,
): Menu {
  const random = rng(seed);
  const avoid = new Set<string>();
  const meals = slots.map((slot) => buildMeal(slot, profile, config, random, avoid, pool, options));
  const totals = meals.reduce<MacroTargets>(
    (acc, meal) => ({
      kcal: acc.kcal + meal.totals.kcal,
      proteinG: round1(acc.proteinG + meal.totals.proteinG),
      carbG: round1(acc.carbG + meal.totals.carbG),
      fatG: round1(acc.fatG + meal.totals.fatG),
      fiberG: round1(acc.fiberG + meal.totals.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );
  const dev = (got: number, want: number): number =>
    want === 0 ? 0 : round1(((got - want) / want) * 100);
  return {
    id,
    label: `Menu ${id}`,
    meals,
    totals,
    deviationPct: {
      kcal: dev(totals.kcal, target.kcal),
      proteinG: dev(totals.proteinG, target.proteinG),
      carbG: dev(totals.carbG, target.carbG),
      fatG: dev(totals.fatG, target.fatG),
    },
  };
}

function shoppingList(menus: Menu[], pool: Food[], daysPerMenu: number): ShoppingItem[] {
  const acc = new Map<string, ShoppingItem>();
  for (const menu of menus) {
    for (const meal of menu.meals) {
      for (const item of meal.items) {
        const food = pool.find((f) => f.id === item.foodId);
        const grams = item.grams * daysPerMenu;
        const existing = acc.get(item.foodId);
        if (existing) {
          existing.grams += grams;
        } else {
          acc.set(item.foodId, {
            foodId: item.foodId,
            name: item.name,
            grams,
            unit: food?.unit ?? 'g',
            costRel: food?.costRel ?? 2,
          });
        }
      }
    }
  }
  return [...acc.values()]
    .map((i) => ({ ...i, grams: roundTo(i.grams, 5) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Genera los dos menus de la semana (mismos macros, alimentos distintos),
 * sus equivalencias y la lista de super.
 * `seed` es quincenal: mismo seed -> mismo menu; cambia cada 2 semanas.
 */
export function generateMenu(
  slots: MealSlot[],
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
  seed = 1,
  options: MenuOptions = {},
  pool: Food[] = FOODS,
): MenuPlan {
  const target = slots.reduce<MacroTargets>(
    (acc, slot) => ({
      kcal: acc.kcal + slot.kcal,
      proteinG: acc.proteinG + slot.proteinG,
      carbG: acc.carbG + slot.carbG,
      fatG: acc.fatG + slot.fatG,
      fiberG: 0,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );

  const menu1 = buildMenu(1, slots, profile, config, seed, pool, options, target);
  const menu2 = buildMenu(2, slots, profile, config, seed * 7919 + 13, pool, options, target);
  const daysPerMenu = options.daysPerMenu ?? 3.5;

  const notas: string[] = [
    'Los vegetales verdes son libres: puedes comer mas de los que indica el menu.',
    'Las equivalencias son intercambios del mismo rol; usa los gramos indicados.',
  ];
  if (options.phase === 'CUT_AGRESIVO') {
    notas.push('Comida y cena van sin carbohidrato denso.');
    notas.push('Protocolo de electrolitos: salar bien las comidas o agua mineral con sal y limon.');
  }
  if (profile.conditions?.glucosaAlta) {
    notas.push('Carbohidratos densos limitados a indice glucemico bajo.');
  }
  if (options.simplify) {
    notas.push('Menu simplificado: menos ingredientes y mas repeticion.');
  }

  return {
    seed,
    target,
    menus: [menu1, menu2],
    shoppingList: shoppingList([menu1, menu2], pool, daysPerMenu),
    notas,
  };
}
