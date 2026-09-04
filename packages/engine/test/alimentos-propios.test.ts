import { describe, expect, it } from 'vitest';
import { generateMenu } from '../src/menu.js';
import { distribute } from '../src/meals.js';
import { kcalForDeficit, macrosFor } from '../src/calc.js';
import { DEFAULT_CONFIG, pickDeficit } from '../src/config.js';
import { catalogoCon } from '../src/foods.js';
import { CALIBRATION_PROFILE } from './helpers.js';
import type { Food, MenuPlan, Profile } from '../src/types.js';

/** El yogur de una marca que el catalogo no trae: lo dio de alta la persona. */
const YOGURT_MARCA: Food = {
  id: 'custom:11111111-1111-1111-1111-111111111111',
  name: 'Yogurt griego marca X',
  role: 'proteina_magra',
  proteinPer100: 10,
  carbPer100: 4,
  fatPer100: 0,
  fiberPer100: 0,
  kcalPer100: 56,
  gi: null,
  costRel: 2,
  prepMin: 0,
  tags: ['rapido', 'sin_cocinar', 'vegetariano'],
  serving: { unit: 'taza', gramsPerUnit: 240, minUnits: 0.5, maxUnits: 2 },
};

/** Un carbohidrato pre-entreno propio: su rol no cabe en la comida ni en la cena. */
const GEL_PROPIO: Food = {
  id: 'custom:22222222-2222-2222-2222-222222222222',
  name: 'Gel de carbohidrato marca X',
  role: 'carbo_pre',
  proteinPer100: 0,
  carbPer100: 70,
  fatPer100: 0,
  fiberPer100: 0,
  kcalPer100: 280,
  gi: 90,
  costRel: 2,
  prepMin: 0,
  tags: ['rapido', 'sin_cocinar', 'vegetariano'],
  serving: { unit: 'pieza', gramsPerUnit: 40, minUnits: 1, maxUnits: 2 },
};

function planCon(perfil: Profile, extraFoods: Food[], seed: number): MenuPlan {
  const kcal = kcalForDeficit(perfil, pickDeficit('BASE', DEFAULT_CONFIG), DEFAULT_CONFIG);
  const macros = macrosFor('BASE', perfil, kcal);
  const slots = distribute(macros, perfil, 'BASE');
  return generateMenu(slots, perfil, DEFAULT_CONFIG, seed, { phase: 'BASE', extraFoods });
}

/**
 * Dias de la semana en que ese alimento se come. Cada menu cubre 3.5 dias, asi
 * que salir en los dos es la semana entera y salir en uno son 3.5 dias.
 */
function diasCon(plan: MenuPlan, foodId: string): number {
  return (
    plan.menus.filter((menu) =>
      menu.meals.some((meal) => meal.items.some((i) => i.foodId === foodId)),
    ).length * 3.5
  );
}

/** En cuantos de los dos menus el alimento cae en el desayuno. */
function desayunosCon(plan: MenuPlan, foodId: string): number {
  return plan.menus.filter((menu) =>
    (menu.meals[0]?.items ?? []).some((i) => i.foodId === foodId),
  ).length;
}

const SEEDS = [1, 7, 42, 99, 2026];

describe('alimentos propios en el motor', () => {
  it('el catalogo del usuario suma los propios sin duplicar ids', () => {
    const catalogo = catalogoCon([YOGURT_MARCA, YOGURT_MARCA]);
    expect(catalogo.filter((f) => f.id === YOGURT_MARCA.id)).toHaveLength(1);
    expect(catalogo.length).toBeGreaterThan(1);
  });

  it('en la despensa, el yogur propio se come casi toda la semana', () => {
    const perfil: Profile = { ...CALIBRATION_PROFILE, pantry: [YOGURT_MARCA.id] };
    for (const seed of SEEDS) {
      const plan = planCon(perfil, [YOGURT_MARCA], seed);
      expect(diasCon(plan, YOGURT_MARCA.id)).toBeGreaterThanOrEqual(4);
    }
  });

  it('el propio puede caer en el desayuno, como cualquier proteina magra', () => {
    // No se exige TODOS los desayunos: la despensa pesa dentro de los
    // candidatos que ya pasaron plantilla y densidad, y ahi compite con el
    // yogur del catalogo. Lo que si se exige es que la plantilla del desayuno
    // no lo deje fuera por ser propio.
    const perfil: Profile = { ...CALIBRATION_PROFILE, pantry: [YOGURT_MARCA.id] };
    const desayunos = SEEDS.reduce(
      (total, seed) => total + desayunosCon(planCon(perfil, [YOGURT_MARCA], seed), YOGURT_MARCA.id),
      0,
    );
    expect(desayunos).toBeGreaterThan(0);
  });

  it('sin despensa el menu sigue cuadrando aunque el propio no salga', () => {
    for (const seed of SEEDS) {
      const plan = planCon(CALIBRATION_PROFILE, [YOGURT_MARCA], seed);
      for (const menu of plan.menus) {
        expect(Math.abs(menu.deviationPct.proteinG)).toBeLessThanOrEqual(15);
        expect(Math.abs(menu.deviationPct.kcal)).toBeLessThanOrEqual(15);
      }
    }
  });

  it('nunca sale en un slot cuya plantilla no admite su rol', () => {
    const perfil: Profile = { ...CALIBRATION_PROFILE, pantry: [GEL_PROPIO.id] };
    for (const seed of SEEDS) {
      const plan = planCon(perfil, [GEL_PROPIO], seed);
      for (const menu of plan.menus) {
        for (const meal of menu.meals) {
          if (meal.slot !== 'COMIDA' && meal.slot !== 'CENA') continue;
          expect(meal.items.map((i) => i.foodId)).not.toContain(GEL_PROPIO.id);
        }
      }
    }
  });

  it('el propio entra a la lista de super como cualquier otro', () => {
    const perfil: Profile = { ...CALIBRATION_PROFILE, pantry: [] };
    const plan = planCon({ ...perfil, pantry: [YOGURT_MARCA.id] }, [YOGURT_MARCA], 42);
    const enLista = plan.shoppingList.find((item) => item.foodId === YOGURT_MARCA.id);
    expect(enLista?.name).toBe(YOGURT_MARCA.name);
    // Ya esta en casa: la lista lo marca en vez de mandarlo a comprar.
    expect(enLista?.enDespensa).toBe(true);
  });
});
