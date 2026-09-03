import { describe, expect, it } from 'vitest';
import { generateMenu, incompatibles } from '../../src/menu.js';
import { distribute } from '../../src/meals.js';
import { kcalForDeficit, macrosFor } from '../../src/calc.js';
import { DEFAULT_CONFIG, pickDeficit } from '../../src/config.js';
import { findFood } from '../../src/foods.js';
import type { Phase, Profile } from '../../src/types.js';

/**
 * Golden de realismo: cinco personas reales, siete dias cada una.
 *
 * NO congelan gramos. Un golden de gramos exactos se rompe con cualquier
 * mejora del solver y obliga a "actualizar el esperado" sin mirar si el menu
 * quedo mejor o peor, que es justo lo contrario de lo que un golden sirve.
 * Lo que congelan son las promesas: que cada porcion sea una porcion que
 * alguien se sirve, que el platillo tenga sentido, y que el dia cuadre.
 */

interface Caso {
  nombre: string;
  profile: Profile;
  phase: Phase;
}

const CASOS: Caso[] = [
  {
    // Mau: 120 kg, 1.82 m, cinco dias de pesas, quiere bajar grasa.
    nombre: 'Mau, 120 kg, 5 dias de pesas, bajando grasa',
    phase: 'CUT',
    profile: {
      sex: 'male',
      ageYears: 38,
      heightCm: 182,
      weightKg: 120,
      strengthDaysPerWeek: 5,
      cardioMinPerWeek: 90,
      work: 'sedentario',
      mealsPerDay: 4,
      trainingTime: 'manana',
      budget: 'medio',
      favoriteFoods: ['pechuga de pollo', 'arroz', 'aguacate'],
    },
  },
  {
    // Irma: 62 kg, entrena cuatro dias, come cinco veces y cocina poco.
    nombre: 'Irma, 62 kg, 4 dias de pesas',
    phase: 'BASE',
    profile: {
      sex: 'female',
      ageYears: 34,
      heightCm: 160,
      weightKg: 62,
      strengthDaysPerWeek: 4,
      cardioMinPerWeek: 120,
      work: 'activo',
      mealsPerDay: 4,
      trainingTime: 'manana',
      budget: 'medio',
      maxPrepMin: 20,
    },
  },
  {
    nombre: 'cinco comidas al dia',
    phase: 'BASE',
    profile: {
      sex: 'female',
      ageYears: 29,
      heightCm: 168,
      weightKg: 70,
      strengthDaysPerWeek: 5,
      cardioMinPerWeek: 150,
      work: 'sedentario',
      mealsPerDay: 5,
      trainingTime: 'tarde',
      budget: 'alto',
    },
  },
  {
    nombre: 'principiante sin gimnasio',
    phase: 'REINTRO',
    profile: {
      sex: 'male',
      ageYears: 45,
      heightCm: 175,
      weightKg: 95,
      strengthDaysPerWeek: 0,
      cardioMinPerWeek: 60,
      work: 'sedentario',
      mealsPerDay: 3,
      trainingTime: 'manana',
      budget: 'bajo',
    },
  },
  {
    nombre: 'keto',
    phase: 'BASE',
    profile: {
      sex: 'female',
      ageYears: 41,
      heightCm: 165,
      weightKg: 78,
      strengthDaysPerWeek: 3,
      cardioMinPerWeek: 90,
      work: 'sedentario',
      mealsPerDay: 4,
      trainingTime: 'tarde',
      budget: 'medio',
      diet: 'keto',
    },
  },
];

const DIAS = [1, 2, 3, 4, 5, 6, 7];

function diaDe(caso: Caso, dia: number) {
  const kcal = kcalForDeficit(caso.profile, pickDeficit(caso.phase, DEFAULT_CONFIG), DEFAULT_CONFIG);
  const macros = macrosFor(caso.phase, caso.profile, kcal, DEFAULT_CONFIG);
  const slots = distribute(macros, caso.profile, caso.phase);
  const plan = generateMenu(slots, caso.profile, DEFAULT_CONFIG, 100 + dia, { phase: caso.phase });
  // Los dos menus son las dos variantes de la semana: cada dia toca una.
  return { macros, menu: plan.menus[dia % 2]! };
}

describe.each(CASOS)('$nombre', (caso) => {
  it('ninguna porcion es una pizca ni un exceso', () => {
    for (const dia of DIAS) {
      for (const meal of diaDe(caso, dia).menu.meals) {
        for (const item of meal.items) {
          const food = findFood(item.foodId)!;
          if (!food.serving) continue;
          const min = food.serving.minUnits * food.serving.gramsPerUnit;
          const max = food.serving.maxUnits * food.serving.gramsPerUnit;
          const donde = `${item.name} dia ${dia} ${meal.slot}`;
          expect(item.grams, donde).toBeGreaterThanOrEqual(Math.floor(min));
          expect(item.grams, donde).toBeLessThanOrEqual(Math.ceil(max));
        }
      }
    }
  });

  it('ninguna comida rompe la composicion del platillo', () => {
    const { composicion } = DEFAULT_CONFIG;
    const familias = [
      ['grasa_anadida', composicion.grasaAnadidaMaxGPorComida],
      ['leguminosa', composicion.leguminosaMaxGPorComida],
      ['cereal_cocido', composicion.cerealCocidoMaxGPorComida],
      ['fruto_seco', composicion.frutoSecoMaxGPorComida],
    ] as const;

    for (const dia of DIAS) {
      for (const meal of diaDe(caso, dia).menu.meals) {
        const foods = meal.items.map((i) => findFood(i.foodId)!);
        const donde = `dia ${dia} ${meal.slot}`;

        for (const [familia, tope] of familias) {
          const gramos = meal.items
            .filter((i) => findFood(i.foodId)!.tags.includes(familia))
            .reduce((acc, i) => acc + i.grams, 0);
          expect(gramos, `${familia} en ${donde}`).toBeLessThanOrEqual(tope);
        }
        expect(
          foods.filter((f) => f.tags.includes('grasa_anadida')).length,
          `grasas anadidas en ${donde}`,
        ).toBeLessThanOrEqual(composicion.maxGrasasAnadidasPorComida);

        for (const a of foods) {
          for (const b of foods) {
            if (a === b) continue;
            expect(incompatibles(a, b, DEFAULT_CONFIG), `${a.name} + ${b.name} en ${donde}`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  it('ninguna comida pasa de seis alimentos', () => {
    for (const dia of DIAS) {
      for (const meal of diaDe(caso, dia).menu.meals) {
        expect(meal.items.length, `dia ${dia} ${meal.slot}`).toBeLessThanOrEqual(
          DEFAULT_CONFIG.maxFoodsPerMeal,
        );
      }
    }
  });

  it('el dia cuadra: kcal +-5 % y proteina +-5 g', () => {
    for (const dia of DIAS) {
      const { macros, menu } = diaDe(caso, dia);
      expect(Math.abs(menu.deviationPct.kcal), `kcal dia ${dia}`).toBeLessThanOrEqual(5);
      expect(Math.abs(menu.totals.proteinG - macros.proteinG), `proteina dia ${dia}`).toBeLessThanOrEqual(5);
    }
  });

  it('cada alimento se puede leer sin traducir gramos', () => {
    for (const dia of DIAS) {
      for (const meal of diaDe(caso, dia).menu.meals) {
        for (const item of meal.items) {
          expect(item.display, `dia ${dia} ${item.name}`).toBeTruthy();
          expect(item.why.closes, `dia ${dia} ${item.name}`).toBeTruthy();
        }
      }
    }
  });
});
