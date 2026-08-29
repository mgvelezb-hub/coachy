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
  if (food.maxG !== undefined) return food.maxG;
  if (food.role === 'suplemento') return 20;
  if (food.kcalPer100 >= 700) return 40;
  if (food.kcalPer100 >= 450) return 80;
  if (food.kcalPer100 >= 250) return 250;
  return 400;
}

/**
 * Paso de redondeo por alimento. Los alimentos muy densos (aceites, semillas,
 * polvos) se redondean al gramo: 5 g de aceite son 45 kcal y romperian el target.
 */
function roundingFor(food: Food, config: EngineConfig): number {
  return food.kcalPer100 >= config.denseFoodKcalPer100 ? 1 : config.menuGramRoundingG;
}

export interface MenuOptions {
  phase?: Phase;
  /** Menos ingredientes y mas repeticion (regla de adherencia). */
  simplify?: boolean;
  /** Dias por semana que se usa cada menu, para la lista de super. */
  daysPerMenu?: number;
}

interface EligibleOptions {
  /** Solo alimentos verdes de bajo carbohidrato (vegetales libres). */
  freeVegetable?: boolean;
  /** Slot peri-entreno: nada que haya que cocinar. */
  quickOnly?: boolean;
  /** Comida o cena: sin polvos ni suplementos. */
  noSupplements?: boolean;
}

function eligible(
  pool: Food[],
  profile: Profile,
  config: EngineConfig,
  role: FoodRole,
  options: EligibleOptions = {},
): Food[] {
  const excluded = [...(profile.excludedFoods ?? []), ...(profile.allergies ?? [])];
  const filtered = pool.filter((food) => {
    if (food.role !== role) return false;
    if (options.freeVegetable && food.carbPer100 > config.freeVegetableMaxCarbPer100) return false;
    if (options.noSupplements && food.tags.includes('suplemento')) return false;
    if (matchesAny(food, excluded)) return false;
    // Escalera de precio: bajo = solo lo más barato, medio = hasta el
    // intermedio, alto = sin tope.
    const topeDeCosto = profile.budget === 'bajo' ? 1 : profile.budget === 'medio' ? 2 : 3;
    if (food.costRel > topeDeCosto) return false;
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
  // El tope de tiempo de cocina es una preferencia, no una restricción dura:
  // si deja un rol sin con qué comer —el caso real es la proteína, que casi
  // siempre se cocina—, manda comer. Un menú sin proteína no es un menú que
  // respeta tu agenda, es un menú roto.
  const quickEnough =
    profile.maxPrepMin === undefined
      ? filtered
      : filtered.filter((f) => f.prepMin <= (profile.maxPrepMin as number));
  const byPrep = quickEnough.length > 0 ? quickEnough : filtered;

  if (options.quickOnly) {
    const quick = byPrep.filter((f) => f.tags.includes('rapido'));
    if (quick.length > 0) return quick;
  }
  return byPrep;
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
  config: EngineConfig,
): void {
  const proteinSlot = slots.find((s) => !s.fixed && s.food.proteinPer100 >= 8);
  const carbSlot = slots.find((s) => !s.fixed && s.food.carbPer100 >= 10 && s !== proteinSlot);
  const carbSlot2 = slots.find(
    (s) => !s.fixed && s.food.carbPer100 >= 10 && s !== proteinSlot && s !== carbSlot,
  );
  const fatSlot = slots.find(
    (s) =>
      !s.fixed &&
      s.food.fatPer100 >= 10 &&
      s !== proteinSlot &&
      s !== carbSlot &&
      s !== carbSlot2,
  );

  if (carbSlot2) {
    // El primero se lleva lo que puede; el segundo cierra.
    carbSlot2.grams = maxGrams(carbSlot2.food);
  }

  for (let iter = 0; iter < 24; iter += 1) {
    if (fatSlot) {
      const others = sum(slots.filter((s) => s !== fatSlot), 'f');
      fatSlot.grams = clampGrams(((target.f - others) * 100) / fatSlot.food.fatPer100, fatSlot.food);
    }
    if (carbSlot) {
      const others = sum(slots.filter((s) => s !== carbSlot), 'c');
      carbSlot.grams = clampGrams(((target.c - others) * 100) / carbSlot.food.carbPer100, carbSlot.food);
    }
    if (carbSlot2) {
      const others = sum(slots.filter((s) => s !== carbSlot2), 'c');
      carbSlot2.grams = clampGrams(
        ((target.c - others) * 100) / carbSlot2.food.carbPer100,
        carbSlot2.food,
      );
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
    slot.grams = Math.max(0, roundTo(slot.grams, roundingFor(slot.food, config)));
  }

  // Pase de reparacion: ajusta el carbo y luego la grasa en pasos de `roundingG`.
  for (const slot of [carbSlot, carbSlot2, fatSlot, proteinSlot]) {
    if (!slot) continue;
    const step0 = roundingFor(slot.food, config);
    let best = error(slots, target);
    for (let step = 0; step < 12; step += 1) {
      const up = { ...slot, grams: slot.grams + step0 };
      const down = { ...slot, grams: Math.max(0, slot.grams - step0) };
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

/**
 * Error relativo (no absoluto): 6 g de grasa de mas pesan mucho mas que
 * 6 g de carbohidrato de mas, porque el target de grasa es cinco veces menor.
 */
function error(slots: Slot[], target: { p: number; c: number; f: number }): number {
  const rel = (got: number, want: number): number => (got - want) / Math.max(want, 8);
  const p = rel(sum(slots, 'p'), target.p);
  const c = rel(sum(slots, 'c'), target.c);
  const f = rel(sum(slots, 'f'), target.f);
  return p * p * 2 + c * c + f * f * 1.5;
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
    .slice(0, config.equivalencesPerItem + 3)
    .map((f) => ({
      foodId: f.id,
      name: f.name,
      grams: Math.max(
        roundingFor(f, config),
        roundTo((slot.grams * base) / f[key], roundingFor(f, config)),
      ),
    }))
    .filter((option) => {
      const food = pool.find((f) => f.id === option.foodId);
      if (food === undefined || option.grams > maxGrams(food)) return false;

      // Los gramos se redondean al múltiplo del alimento, y ese redondeo puede
      // empujar la equivalencia fuera del ±10% que promete. Se revisa DESPUÉS
      // de redondear, que es como la va a comer quien la siga: una porción que
      // se pasa del 10% ya no es equivalente, es otra comida.
      const objetivo = (slot.grams * base) / 100;
      const real = (option.grams * food[key]) / 100;
      const desviacion = objetivo <= 0 ? 0 : Math.abs(real - objetivo) / objetivo;
      return desviacion <= config.equivalenceMaxDeviation;
    })
    .slice(0, config.equivalencesPerItem);
  if (options.length === 0) return null;
  return { forFoodId: slot.food.id, forName: slot.food.name, options };
}

/**
 * Deja solo los alimentos que pueden cubrir el macro del slot sin pasarse de
 * su tope de gramos, y con densidad suficiente para no ser un relleno.
 * Si ninguno califica, devuelve la lista original.
 */
function feasible(
  candidates: Food[],
  key: 'proteinPer100' | 'carbPer100' | 'fatPer100',
  targetG: number,
  minDensity: number,
): Food[] {
  const ok = candidates.filter(
    (f) => f[key] >= minDensity && (maxGrams(f) * f[key]) / 100 >= targetG * 0.9,
  );
  return ok.length > 0 ? ok : candidates;
}

function slotCarbRole(slotId: MealSlot['id']): FoodRole {
  if (slotId === 'PRE') return 'carbo_pre';
  if (slotId === 'POST') return 'carbo_post';
  return 'carbo_complejo';
}

interface Residual {
  p: number;
  c: number;
  f: number;
}

function buildMeal(
  slot: MealSlot,
  profile: Profile,
  config: EngineConfig,
  random: () => number,
  avoid: Set<string>,
  pool: Food[],
  options: MenuOptions,
  residual: Residual,
): { meal: MenuMeal; slots: Slot[] } {
  const slots: Slot[] = [];
  const periWorkout = slot.id === 'PRE' || slot.id === 'POST';
  const filters: EligibleOptions = { quickOnly: periWorkout, noSupplements: !periWorkout };

  if (slot.freeVegetables && config.freeVegetableGramsPerMeal > 0) {
    const veg = pick(
      eligible(pool, profile, config, 'vegetal_libre', { freeVegetable: true }),
      profile,
      random,
      avoid,
    );
    if (veg) {
      slots.push({ food: veg, grams: config.freeVegetableGramsPerMeal, fixed: true });
      avoid.add(veg.id);
    }
  }

  if (slot.id === 'PRE' && slot.allowDenseCarb && !options.simplify) {
    const fruit = pick(eligible(pool, profile, config, 'fruta', filters), profile, random, avoid);
    if (fruit) {
      slots.push({ food: fruit, grams: fruit.servingG ?? 100, fixed: true });
      avoid.add(fruit.id);
    }
  }

  const wantsFat = slot.fatG > 0;
  const proteinRole: FoodRole = wantsFat && random() < 0.35 ? 'proteina_grasa' : 'proteina_magra';
  const proteinPool = feasible(
    eligible(pool, profile, config, proteinRole, filters),
    'proteinPer100',
    slot.proteinG,
    10,
  );
  const protein =
    pick(proteinPool, profile, random, avoid) ??
    pick(
      feasible(
        eligible(pool, profile, config, 'proteina_magra', filters),
        'proteinPer100',
        slot.proteinG,
        10,
      ),
      profile,
      random,
      avoid,
    );
  if (protein) {
    slots.push({ food: protein, grams: 100, fixed: false });
    avoid.add(protein.id);
  }

  if (slot.carbG > 0 && slot.allowDenseCarb) {
    const carbTarget = slot.carbG - (slot.id === 'PRE' ? 20 : 0);
    const carb = pick(
      feasible(
        eligible(pool, profile, config, slotCarbRole(slot.id), filters),
        'carbPer100',
        carbTarget,
        10,
      ),
      profile,
      random,
      avoid,
    );
    if (carb) {
      slots.push({ food: carb, grams: 100, fixed: false });
      avoid.add(carb.id);
      // Un solo alimento no siempre alcanza el carbo del slot (topes de gramos):
      // en ese caso se agrega un segundo carbohidrato del mismo rol.
      const reach = (maxGrams(carb) * carb.carbPer100) / 100;
      if (reach < carbTarget * 0.95) {
        const second = pick(
          feasible(
            eligible(pool, profile, config, slotCarbRole(slot.id), filters),
            'carbPer100',
            carbTarget - reach,
            10,
          ),
          profile,
          random,
          avoid,
        );
        if (second && second.id !== carb.id) {
          slots.push({ food: second, grams: 50, fixed: false });
          avoid.add(second.id);
        }
      }
    }
  }

  if (wantsFat) {
    const fat = pick(
      feasible(eligible(pool, profile, config, 'grasa', filters), 'fatPer100', slot.fatG, 10),
      profile,
      random,
      avoid,
    );
    if (fat) {
      slots.push({ food: fat, grams: 15, fixed: false });
      avoid.add(fat.id);
    }
  }

  // El residual arrastra lo que las comidas anteriores se pasaron o se quedaron
  // cortas (p. ej. la grasa que traen la avena o el pollo del pre-entreno).
  const cap = (targetG: number, carry: number): number =>
    Math.min(Math.max(0, targetG - carry), targetG * 1.8 + 5);
  const effective = {
    p: cap(slot.proteinG, residual.p),
    c: cap(slot.carbG, residual.c),
    f: cap(slot.fatG, residual.f),
  };
  solveGrams(slots, effective, config);

  const kept = slots.filter((s) => s.grams > 0);
  const items = kept.map((s) => toItem(s, s.fixed && s.food.role === 'vegetal_libre'));

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

  residual.p += totals.proteinG - slot.proteinG;
  residual.c += totals.carbG - slot.carbG;
  residual.f += totals.fatG - slot.fatG;

  return {
    meal: {
      slot: slot.id,
      label: slot.label,
      timeHint: slot.timeHint,
      items,
      equivalences: [],
      totals,
      target: {
        kcal: slot.kcal,
        proteinG: slot.proteinG,
        carbG: slot.carbG,
        fatG: slot.fatG,
        fiberG: 0,
      },
    },
    slots,
  };
}

/** Reconstruye items y totales de una comida a partir de sus gramos. */
function refreshMeal(meal: MenuMeal, slots: Slot[], pool: Food[], profile: Profile, config: EngineConfig): void {
  const kept = slots.filter((s) => s.grams > 0);
  meal.items = kept.map((s) => toItem(s, s.fixed && s.food.role === 'vegetal_libre'));
  meal.equivalences = kept
    .map((s) => equivalencesFor(s, pool, profile, config))
    .filter((e): e is Equivalence => e !== null);
  meal.totals = meal.items.reduce<MacroTargets>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteinG: round1(acc.proteinG + item.proteinG),
      carbG: round1(acc.carbG + item.carbG),
      fatG: round1(acc.fatG + item.fatG),
      fiberG: round1(acc.fiberG + item.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );
}

/**
 * Reparacion a nivel dia: ajusta gramos en pasos del redondeo del alimento
 * hasta que los macros del menu completo caen lo mas cerca posible del target.
 */
function repairDay(all: Slot[], target: { p: number; c: number; f: number }, config: EngineConfig): void {
  const movable = all.filter((s) => !s.fixed && s.grams > 0);
  for (let pass = 0; pass < 40; pass += 1) {
    let improved = false;
    const scale = pass < 4 ? 8 : pass < 10 ? 3 : 1;
    for (const slot of movable) {
      const step = roundingFor(slot.food, config) * scale;
      let best = error(all, target);
      for (const delta of [step, -step]) {
        const grams = slot.grams + delta;
        if (grams <= 0 || grams > maxGrams(slot.food)) continue;
        const previous = slot.grams;
        slot.grams = grams;
        const candidate = error(all, target);
        if (candidate < best - 1e-9) {
          best = candidate;
          improved = true;
        } else {
          slot.grams = previous;
        }
      }
    }
    if (!improved && scale === 1) break;
  }
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
  const residual: Residual = { p: 0, c: 0, f: 0 };
  const built = slots.map((slot) =>
    buildMeal(slot, profile, config, random, avoid, pool, options, residual),
  );
  const allSlots = built.flatMap((b) => b.slots);
  repairDay(allSlots, { p: target.proteinG, c: target.carbG, f: target.fatG }, config);
  const meals = built.map((b) => b.meal);
  for (const b of built) refreshMeal(b.meal, b.slots, pool, profile, config);
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
