import { describe, expect, it } from 'vitest';
import { distribute } from '../src/meals.js';
import { kcalForDeficit, macrosFor } from '../src/calc.js';
import { DEFAULT_CONFIG, pickDeficit } from '../src/config.js';
import { CALIBRATION_PROFILE } from './helpers.js';

const P = CALIBRATION_PROFILE;
const kcal = kcalForDeficit(P, pickDeficit('BASE', DEFAULT_CONFIG));
const macros = macrosFor('BASE', P, kcal);

describe('distribucion por comida (spec §5)', () => {
  it('reparte exactamente los macros del dia sin perder gramos', () => {
    const slots = distribute(macros, P, 'BASE');
    expect(slots.reduce((a, s) => a + s.proteinG, 0)).toBe(macros.proteinG);
    expect(slots.reduce((a, s) => a + s.carbG, 0)).toBe(macros.carbG);
    expect(slots.reduce((a, s) => a + s.fatG, 0)).toBe(macros.fatG);
  });

  it('con 4 comidas y entreno en la manana usa PRE/POST/COMIDA/CENA', () => {
    expect(distribute(macros, P, 'BASE').map((s) => s.id)).toEqual([
      'PRE',
      'POST',
      'COMIDA',
      'CENA',
    ]);
  });

  it('concentra el carbo peri-entreno: PRE + POST > 60% del carbo del dia', () => {
    const slots = distribute(macros, P, 'BASE');
    const peri = slots
      .filter((s) => s.id === 'PRE' || s.id === 'POST')
      .reduce((a, s) => a + s.carbG, 0);
    expect(peri / macros.carbG).toBeGreaterThan(0.6);
  });

  it('la grasa vive en comida y cena, no en pre/post', () => {
    const slots = distribute(macros, P, 'BASE');
    expect(slots.find((s) => s.id === 'PRE')!.fatG).toBe(0);
    expect(slots.find((s) => s.id === 'POST')!.fatG).toBe(0);
    expect(slots.find((s) => s.id === 'COMIDA')!.fatG).toBeGreaterThan(0);
  });

  it('CUT_AGRESIVO deja comida y cena sin carbo denso', () => {
    const slots = distribute(macros, P, 'CUT_AGRESIVO');
    const comida = slots.find((s) => s.id === 'COMIDA')!;
    const cena = slots.find((s) => s.id === 'CENA')!;
    expect(comida.carbG).toBe(0);
    expect(cena.carbG).toBe(0);
    expect(comida.allowDenseCarb).toBe(false);
    expect(cena.allowDenseCarb).toBe(false);
    // La proteina sigue en las 4 comidas.
    expect(slots.every((s) => s.proteinG > 0)).toBe(true);
  });

  it('vegetales libres en comida y cena', () => {
    const slots = distribute(macros, P, 'BASE');
    expect(slots.find((s) => s.id === 'COMIDA')!.freeVegetables).toBe(true);
    expect(slots.find((s) => s.id === 'CENA')!.freeVegetables).toBe(true);
  });

  it('soporta 3 comidas', () => {
    const slots = distribute(macros, { ...P, mealsPerDay: 3 }, 'BASE');
    expect(slots).toHaveLength(3);
    expect(slots.reduce((a, s) => a + s.proteinG, 0)).toBe(macros.proteinG);
  });

  it('soporta 5 comidas', () => {
    const slots = distribute(macros, { ...P, mealsPerDay: 5 }, 'BASE');
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.id)).toContain('SNACK');
    expect(slots.reduce((a, s) => a + s.carbG, 0)).toBe(macros.carbG);
  });

  it('con entreno en la tarde el desayuno toma el papel de comida baja en carbo', () => {
    const slots = distribute(macros, { ...P, trainingTime: 'tarde' }, 'BASE');
    const desayuno = slots.find((s) => s.id === 'DESAYUNO')!;
    const post = slots.find((s) => s.id === 'POST')!;
    expect(desayuno.fatG).toBeGreaterThan(0);
    expect(post.carbG).toBeGreaterThan(desayuno.carbG);
    expect(Date.parse(`2026-01-01T${post.timeHint}`)).toBeGreaterThan(
      Date.parse(`2026-01-01T${desayuno.timeHint}`),
    );
  });

  it('las kcal de cada slot cuadran con sus macros', () => {
    for (const slot of distribute(macros, P, 'BASE')) {
      expect(slot.kcal).toBe(slot.proteinG * 4 + slot.carbG * 4 + slot.fatG * 9);
    }
  });
});
