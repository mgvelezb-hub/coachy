import { describe, expect, it } from 'vitest';
import { generateMenu } from '../src/menu.js';
import { distribute } from '../src/meals.js';
import { kcalForDeficit, macrosFor } from '../src/calc.js';
import { DEFAULT_CONFIG, pickDeficit } from '../src/config.js';
import { FOODS, findFood } from '../src/foods.js';
import { CALIBRATION_PROFILE } from './helpers.js';
import type { Phase, Profile } from '../src/types.js';

/**
 * Dietas alternativas (Fase 8).
 *
 * Cada estilo cambia UNA cosa, y estas pruebas cuidan justamente que no
 * cambie las otras: el ayuno no debe tocar los gramos, la vegetariana no debe
 * tocar la formula, y la keto no debe tocar la proteina.
 */

const P = CALIBRATION_PROFILE;

function planFor(profile: Profile, phase: Phase = 'BASE', seed = 42) {
  const kcal = kcalForDeficit(profile, pickDeficit(phase, DEFAULT_CONFIG), DEFAULT_CONFIG);
  const macros = macrosFor(phase, profile, kcal, DEFAULT_CONFIG);
  const slots = distribute(macros, profile, phase);
  return { macros, slots, plan: generateMenu(slots, profile, DEFAULT_CONFIG, seed, { phase }) };
}

describe('ayuno intermitente', () => {
  it('mueve los horarios a la ventana y no toca los gramos', () => {
    const estandar = planFor(P);
    const ayuno = planFor({ ...P, diet: 'ayuno', fastingWindow: { startHour: 12, endHour: 20 } });

    expect(ayuno.macros).toEqual(estandar.macros);
    expect(ayuno.slots.map((slot) => slot.proteinG)).toEqual(
      estandar.slots.map((slot) => slot.proteinG),
    );

    const horas = ayuno.slots.map((slot) => Number(slot.timeHint.slice(0, 2)));
    expect(Math.min(...horas)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...horas)).toBeLessThanOrEqual(20);
  });

  it('conserva el orden de las comidas del dia', () => {
    const { slots } = planFor({ ...P, diet: 'ayuno', fastingWindow: { startHour: 13, endHour: 21 } });
    const minutos = slots.map((slot) => Number(slot.timeHint.slice(0, 2)) * 60 + Number(slot.timeHint.slice(3)));
    expect([...minutos].sort((a, b) => a - b)).toEqual(minutos);
  });

  it('una ventana imposible se ignora en vez de inventar horarios', () => {
    const rota = planFor({ ...P, diet: 'ayuno', fastingWindow: { startHour: 20, endHour: 8 } });
    const estandar = planFor(P);
    expect(rota.slots.map((slot) => slot.timeHint)).toEqual(
      estandar.slots.map((slot) => slot.timeHint),
    );
  });
});

describe('vegetariana', () => {
  it('no mete carne, pollo ni pescado en el menu', () => {
    const profile: Profile = { ...P, diet: 'vegetariana' };
    const ids = [1, 7, 42, 99, 2026].flatMap((seed) => {
      const { plan } = planFor(profile, 'BASE', seed);
      return plan.menus.flatMap((menu) => menu.meals.flatMap((meal) => meal.items.map((i) => i.foodId)));
    });

    const animales = ids.filter((id) => findFood(id)?.tags.includes('no_vegetariano'));
    expect(animales).toEqual([]);
  });

  it('sigue cubriendo la proteina del dia', () => {
    const profile: Profile = { ...P, diet: 'vegetariana' };
    const { macros, plan } = planFor(profile);
    const proteina = plan.menus[0]!.meals.flatMap((meal) => meal.items).reduce((sum, item) => {
      const food = findFood(item.foodId);
      return sum + ((food?.proteinPer100 ?? 0) * item.grams) / 100;
    }, 0);

    // El solver redondea gramos; con 10 % de holgura sigue siendo "cubre".
    expect(proteina).toBeGreaterThan(macros.proteinG * 0.9);
  });

  it('el catalogo tiene proteina vegetariana suficiente para armar semanas', () => {
    const proteinas = FOODS.filter(
      (food) =>
        !food.tags.includes('no_vegetariano') &&
        (food.role === 'proteina_magra' || food.role === 'proteina_grasa'),
    );
    expect(proteinas.length).toBeGreaterThanOrEqual(8);
  });
});

describe('keto', () => {
  it('topa el carbohidrato y manda las kcal sobrantes a la grasa', () => {
    const estandar = planFor(P);
    const keto = planFor({ ...P, diet: 'keto' });

    expect(keto.macros.carbG).toBeLessThanOrEqual(DEFAULT_CONFIG.ketoCarbMaxG);
    expect(keto.macros.fatG).toBeGreaterThan(estandar.macros.fatG);
  });

  it('no sube la proteina "porque sobran calorias"', () => {
    const estandar = planFor(P);
    const keto = planFor({ ...P, diet: 'keto' });
    expect(keto.macros.proteinG).toBe(estandar.macros.proteinG);
  });

  it('respeta las kcal objetivo', () => {
    const kcal = kcalForDeficit(
      { ...P, diet: 'keto' },
      pickDeficit('BASE', DEFAULT_CONFIG),
      DEFAULT_CONFIG,
    );
    const macros = macrosFor('BASE', { ...P, diet: 'keto' }, kcal, DEFAULT_CONFIG);
    // El redondeo de macros mueve unas pocas kcal; 3 % es el margen del motor.
    expect(Math.abs(macros.kcal - kcal) / kcal).toBeLessThan(0.03);
  });
});

describe('menu fijo', () => {
  // El formato de cualquier coach de gimnasio en Mexico: un solo menu para la
  // semana. La variedad diaria que rota el motor es ruido para quien prepara
  // su comida el domingo y la repite.
  it('los dos menus son el mismo dia', () => {
    const { plan } = planFor({ ...P, diet: 'menu_fijo' });
    expect(plan.menus[1].meals).toEqual(plan.menus[0].meals);
    expect(plan.menus[1].totals).toEqual(plan.menus[0].totals);
  });

  it('la lista de super compra ese unico menu los siete dias', () => {
    const fijo = planFor({ ...P, diet: 'menu_fijo' });
    const unaComida = fijo.plan.menus[0].meals[0]!.items[0]!;
    const renglon = fijo.plan.shoppingList.find((i) => i.name === unaComida.name)!;

    expect(renglon.grams).toBeGreaterThanOrEqual(unaComida.grams * 7 - 5);
    expect(renglon.grams).toBeLessThanOrEqual(unaComida.grams * 7 + 5);
  });

  it('no cambia los macros: sigue siendo el mismo metodo', () => {
    const estandar = planFor(P);
    const fijo = planFor({ ...P, diet: 'menu_fijo' });
    expect(fijo.macros).toEqual(estandar.macros);
    for (const macro of ['proteinG', 'carbG', 'fatG', 'kcal'] as const) {
      expect(Math.abs(fijo.plan.menus[0].deviationPct[macro])).toBeLessThanOrEqual(5);
    }
  });

  it('lo dice en las notas', () => {
    const { plan } = planFor({ ...P, diet: 'menu_fijo' });
    expect(plan.notas.join(' ')).toMatch(/mismo menu los siete dias/i);
  });
});
