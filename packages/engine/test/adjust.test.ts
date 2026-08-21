import { describe, expect, it } from 'vitest';
import { decide, decideAll, weeksBetween } from '../src/adjust.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/config.js';
import { normalizeCategory } from '../src/backtest.js';
import { CALIBRATION_PROFILE, checkIn, ruleIds } from './helpers.js';

const P = CALIBRATION_PROFILE;

describe('reglas de ajuste semanal (spec §4)', () => {
  it('R0 CAMBIO_DE_CONTEXTO — el atleta cambia comidas/tiempo', () => {
    const d = decide([checkIn('2026-01-04'), checkIn('2026-01-11', { contextChange: true })], P);
    expect(ruleIds(d.rulesFired)).toContain('R0');
    expect(d.category).toBe('CONTEXT_CHANGE');
    expect(d.targets.kcal).toBe(d.previousKcal);
  });

  it('R1 DATOS_NO_CONCLUYENTES — fase lutea sin caida de cintura', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { waistCm: 90 }),
        checkIn('2026-01-11', { waistCm: 90, cyclePhase: 'lutea' }),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R1');
    expect(d.category).toBe('HOLD');
    expect(d.inconclusiveWeek).toBe(true);
    expect(d.stallWeeks).toBe(0);
  });

  it('R2 SEGURIDAD_ELECTROLITOS — calambres en deficit profundo activan el protocolo', () => {
    const d = decide([checkIn('2026-01-04', { symptoms: ['calambres'] })], P, DEFAULT_CONFIG, {
      initialPhase: 'CUT',
    });
    expect(ruleIds(d.rulesFired)).toContain('R2');
    expect(d.electrolyteProtocol).toBe(true);
    expect(d.phase).toBe('CUT');
  });

  it('R2 SEGURIDAD_ELECTROLITOS — si persiste 2 semanas manda a REFEED', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { symptoms: ['calambres'], waistCm: 90 }),
        checkIn('2026-01-11', { symptoms: ['calambres'], waistCm: 90 }),
      ],
      P,
      DEFAULT_CONFIG,
      { initialPhase: 'CUT' },
    );
    expect(d.category).toBe('REFEED');
    expect(d.phase).toBe('REFEED');
  });

  it('R3 SEGURIDAD_LESION — lesion nueva congela la dieta y adapta el entreno', () => {
    const d = decide([checkIn('2026-01-04', { newInjury: true, symptoms: ['dolor_tobillo'] })], P);
    expect(ruleIds(d.rulesFired)).toContain('R3');
    expect(d.category).toBe('HOLD');
    expect(d.injuryTrainingProtocol).toBe(true);
    expect(d.targets.kcal).toBe(d.previousKcal);
  });

  it('R3 SEGURIDAD_ENFERMEDAD — semana enferma no mueve la dieta', () => {
    const d = decide([checkIn('2026-01-04', { symptoms: ['enfermedad'] })], P);
    expect(ruleIds(d.rulesFired)).toContain('R3');
    expect(d.category).toBe('HOLD');
    expect(d.inconclusiveWeek).toBe(true);
  });

  it('R4 SEGURIDAD_SIN_ENTRENO — sin entrenar manda a MANTENIMIENTO', () => {
    const d = decide([checkIn('2026-01-04', { daysWithoutTraining: 14 })], P);
    expect(ruleIds(d.rulesFired)).toContain('R4');
    expect(d.phase).toBe('MANTENIMIENTO');
    expect(d.deficitPct).toBeLessThanOrEqual(0.1 + 1e-6);
  });

  it('R5 SEGURIDAD_ADAPTACION — fuerza a la baja 2 semanas + hambre alta -> REFEED', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { strengthTrend: 'baja', hunger: 4, waistCm: 90 }),
        checkIn('2026-01-11', { strengthTrend: 'baja', hunger: 4, waistCm: 90 }),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R5');
    expect(d.category).toBe('REFEED');
  });

  it('R6 SEGURIDAD_RITMO_RAPIDO — bajar >1%/sem dos semanas sube kcal', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { weightKg: 80 }),
        checkIn('2026-01-11', { weightKg: 78.5 }),
        checkIn('2026-01-18', { weightKg: 77 }),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R6');
    expect(d.targets.kcal).toBeGreaterThan(d.previousKcal);
  });

  it('R7 ADHERENCIA — cumplimiento < 70% simplifica menu y no aprieta', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { waistCm: 90 }),
        checkIn('2026-01-11', { waistCm: 90, dietCompliancePct: 60, inflammation: 4 }),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R7');
    expect(d.category).toBe('HOLD');
    expect(d.simplifyMenu).toBe(true);
    expect(d.targets.kcal).toBe(d.previousKcal);
  });

  it('R8 PROGRESO — la cintura baja >= 0.5 cm/sem -> HOLD', () => {
    const d = decide(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', { waistCm: 89 })],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R8');
    expect(d.category).toBe('HOLD');
    expect(d.targets.kcal).toBe(d.previousKcal);
  });

  it('R8 PROGRESO — fotos que mejoran tambien cuentan', () => {
    const d = decide([checkIn('2026-01-04', { photosTrend: 'mejora', inflammation: 4 })], P);
    expect(ruleIds(d.rulesFired)).toContain('R8');
    expect(d.category).toBe('HOLD');
  });

  it('R9 RECOMPOSICION — cintura baja y peso igual -> HOLD sin tocar kcal', () => {
    const d = decide(
      [
        checkIn('2026-01-04', { waistCm: 90, weightKg: 75 }),
        checkIn('2026-01-11', { waistCm: 89.7, weightKg: 75 }),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R9');
    expect(d.category).toBe('HOLD');
    expect(d.targets.kcal).toBe(d.previousKcal);
  });

  it('R10 ESTANCAMIENTO_REFEED — sin progreso y con sintomas -> REFEED', () => {
    const stalled = { waistCm: 90, inflammation: 4 as const, energy: 2 as const, hunger: 4 as const };
    const d = decide(
      [
        checkIn('2026-01-04', { waistCm: 90 }),
        checkIn('2026-01-11', stalled),
        checkIn('2026-01-18', stalled),
      ],
      P,
    );
    expect(ruleIds(d.rulesFired)).toContain('R10');
    expect(d.category).toBe('REFEED');
    expect(d.targets.carbG).toBeGreaterThan(0);
  });

  it('R11 ESTANCAMIENTO_PROFUNDIZAR — sin progreso y sin sintomas -> TIGHTEN en carbos', () => {
    const flat = { waistCm: 90, inflammation: 2 as const, energy: 4 as const };
    const d = decideAll(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', flat), checkIn('2026-01-18', flat)],
      P,
    );
    const last = d[2]!;
    const before = d[1]!;
    expect(ruleIds(last.rulesFired)).toContain('R11');
    expect(last.category).toBe('TIGHTEN');
    expect(last.targets.kcal).toBeLessThanOrEqual(before.targets.kcal - DEFAULT_CONFIG.kcalAdjustStep + 10);
    expect(last.targets.kcal).toBeGreaterThanOrEqual(before.targets.kcal - DEFAULT_CONFIG.kcalAdjustStep - 10);
    // Proteina y grasa no se tocan: todo el recorte va en carbohidratos.
    expect(last.targets.proteinG).toBe(before.targets.proteinG);
    expect(last.targets.fatG).toBe(before.targets.fatG);
    expect(last.targets.carbG).toBeLessThan(before.targets.carbG);
  });

  it('R11 escala de fase cuando el escalon deja el deficit fuera de la banda', () => {
    const flat = { waistCm: 90, inflammation: 4 as const, energy: 4 as const };
    const d = decide([checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', flat)], P, DEFAULT_CONFIG, {
      initialPhase: 'CUT',
    });
    expect(d.phase).toBe('CUT_AGRESIVO');
    expect(d.category).toBe('CUT_AGRESIVO');
  });

  it('R12 TOPE_DE_FASE — CUT_AGRESIVO al tope pasa a REFEED', () => {
    const d = decide([checkIn('2026-01-18', { photosTrend: 'igual' })], P, DEFAULT_CONFIG, {
      initialPhase: 'CUT_AGRESIVO',
      initialPhaseStartDate: '2026-01-04',
    });
    expect(ruleIds(d.rulesFired)).toContain('R12');
    expect(d.phase).toBe('REFEED');
    expect(d.category).toBe('REFEED');
  });

  it('R13 REFRESCO_DE_MENU — dos semanas sin cambio de menu -> MENU_REFRESH', () => {
    const d = decideAll(
      [
        checkIn('2026-01-04', { waistCm: 90 }),
        checkIn('2026-01-11', { waistCm: 89 }),
        checkIn('2026-01-18', { waistCm: 88 }),
        checkIn('2026-01-25', { waistCm: 87 }),
      ],
      P,
    );
    expect(d[1]!.category).toBe('HOLD');
    expect(d[2]!.category).toBe('MENU_REFRESH');
    expect(d[2]!.menuRefresh).toBe(true);
    // Mismos macros, solo cambian los alimentos.
    expect(d[2]!.targets).toEqual(d[1]!.targets);
    expect(d[3]!.category).toBe('HOLD');
  });

  it('R14 SIN_SENALES_DE_CAMBIO — semana neutra mantiene el plan', () => {
    const d = decide(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', { waistCm: 89.9 })],
      P,
    );
    expect(d.category).toBe('HOLD');
    expect(d.targets.kcal).toBe(d.previousKcal);
  });
});

describe('casos compuestos del plan', () => {
  it('peso igual + cintura baja -> HOLD por recomposicion', () => {
    const d = decide(
      [
        checkIn('2026-02-07', { waistCm: 90.5, weightKg: 75 }),
        checkIn('2026-02-14', { waistCm: 90, weightKg: 75 }),
      ],
      P,
    );
    expect(d.category).toBe('HOLD');
    expect(d.targets.kcal).toBe(d.previousKcal);
    expect(d.explicacion).toMatch(/mantiene|menu/i);
  });

  it('estancamiento + inflamacion >= 4 con mas sintomas -> REFEED', () => {
    const bad = { waistCm: 90, inflammation: 4 as const, hunger: 4 as const, sleep: 2 as const };
    const d = decide(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', bad), checkIn('2026-01-18', bad)],
      P,
    );
    expect(d.category).toBe('REFEED');
  });

  it('cumplimiento 60% -> HOLD y simplificar, aunque haya estancamiento', () => {
    const lazy = { waistCm: 90, dietCompliancePct: 60, inflammation: 4 as const };
    const d = decide(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', lazy), checkIn('2026-01-18', lazy)],
      P,
    );
    expect(normalizeCategory(d.category)).toBe('HOLD');
    expect(d.simplifyMenu).toBe(true);
  });
});

describe('invariantes de la decision', () => {
  it('nunca baja del piso de kcal ni del piso de proteina', () => {
    const flat = { waistCm: 90, inflammation: 2 as const, energy: 4 as const };
    const weeks = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.parse('2026-01-04') + i * 7 * 86400000).toISOString().slice(0, 10);
      return checkIn(date, flat);
    });
    for (const d of decideAll(weeks, P)) {
      expect(d.targets.kcal).toBeGreaterThanOrEqual(Math.floor(1461.5 * 0.85));
      expect(d.targets.proteinG).toBeGreaterThanOrEqual(1.6 * P.weightKg);
      expect(d.targets.fatG).toBeGreaterThanOrEqual(0.5 * P.weightKg);
    }
  });

  it('decide() es puro: mismo historial, misma decision', () => {
    const history = [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', { waistCm: 89 })];
    expect(decide(history, P)).toEqual(decide(history, P));
  });

  it('decide() lanza con historial vacio', () => {
    expect(() => decide([], P)).toThrow();
  });

  it('la config puede cambiar el escalon de ajuste', () => {
    const config = loadConfig({ kcalAdjustStep: 150 });
    const flat = { waistCm: 90, inflammation: 2 as const };
    const d = decideAll(
      [checkIn('2026-01-04', { waistCm: 90 }), checkIn('2026-01-11', flat), checkIn('2026-01-18', flat)],
      P,
      config,
    );
    // El redondeo de macros a 5 g cuantiza el objetivo en pasos de 20 kcal.
    expect(d[2]!.targets.kcal).toBeLessThanOrEqual(d[1]!.targets.kcal - 140);
    expect(d[2]!.targets.kcal).toBeGreaterThanOrEqual(d[1]!.targets.kcal - 160);
  });

  it('weeksBetween cuenta semanas ISO', () => {
    expect(weeksBetween('2026-01-04', '2026-01-11')).toBe(1);
    expect(weeksBetween('2026-05-06', '2026-05-17')).toBe(2);
  });
});
