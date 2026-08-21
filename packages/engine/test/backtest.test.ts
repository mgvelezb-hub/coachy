import { describe, expect, it } from 'vitest';
import { BACKTEST_WEEKS, REFERENCE_PROFILE, normalizeCategory, runBacktest } from '../src/backtest.js';

describe('backtest contra el historial real (plan 0.7)', () => {
  const report = runBacktest();

  it('cubre las 19 semanas del historial', () => {
    expect(report.total).toBe(19);
    expect(BACKTEST_WEEKS).toHaveLength(19);
  });

  it('coincide con el coach en al menos 80% de las semanas', () => {
    expect(report.accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('acierta los puntos clave: apretar en marzo, cut en abril, refeed en mayo', () => {
    const byWeek = new Map(report.rows.map((r) => [r.week, r]));
    expect(byWeek.get('2026-03-15')!.got).toBe('TIGHTEN');
    expect(byWeek.get('2026-04-11')!.got).toBe('CUT');
    expect(byWeek.get('2026-05-06')!.got).toBe('CUT_AGRESIVO');
    expect(byWeek.get('2026-05-17')!.got).toBe('REFEED');
    expect(byWeek.get('2026-06-05')!.got).toBe('CONTEXT_CHANGE');
  });

  it('no cambia de fase en las semanas que el coach mantuvo', () => {
    const holds = ['2026-04-18', '2026-04-25', '2026-05-02', '2026-05-09'];
    const byWeek = new Map(report.rows.map((r) => [r.week, r]));
    for (const week of holds) {
      expect(normalizeCategory(byWeek.get(week)!.got), week).toBe('HOLD');
    }
  });

  it('nunca cruza el piso de kcal ni el de proteina', () => {
    for (const d of report.decisions) {
      expect(d.targets.kcal).toBeGreaterThanOrEqual(Math.floor(d.base.bmr * 0.85));
      expect(d.targets.proteinG).toBeGreaterThanOrEqual(1.6 * REFERENCE_PROFILE.weightKg);
    }
  });

  it('las fixtures no llevan datos personales', () => {
    const allowed = new Set([
      'week', 'waistCm', 'weightKg', 'photosTrend', 'inflammation', 'energy', 'hunger',
      'sleep', 'strengthTrend', 'compliance', 'symptoms', 'newInjury', 'activeInjury',
      'daysWithoutTraining', 'contextChange', 'aggressiveRequest', 'weeksSincePhaseChange',
      'expected',
    ]);
    for (const week of BACKTEST_WEEKS) {
      for (const key of Object.keys(week)) expect(allowed.has(key), key).toBe(true);
      for (const value of Object.values(week)) {
        expect(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value)).toBe(true);
      }
    }
  });
});
