import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadConfig } from '../src/config.js';
import { atPhaseCap, deeperPhase, emptySignals, maxWeeksFor, nextPhase, phaseAfterCap } from '../src/phases.js';

const C = DEFAULT_CONFIG;

describe('maquina de fases (spec §3) — una prueba por transicion', () => {
  it('REINTRO -> BASE con adherencia >= 80% y sin sintomas', () => {
    const t = nextPhase('REINTRO', emptySignals({ compliance: 0.85 }), 1, C);
    expect(t.phase).toBe('BASE');
    expect(t.reason).toBe('REINTRO_ADHERENCIA_OK');
  });

  it('REINTRO se queda si la adherencia no llega', () => {
    const t = nextPhase('REINTRO', emptySignals({ compliance: 0.6 }), 1, C);
    expect(t.phase).toBe('REINTRO');
    expect(t.changed).toBe(false);
  });

  it('REINTRO -> BASE al tope de semanas', () => {
    const t = nextPhase('REINTRO', emptySignals({ compliance: 0.5, hasActiveSymptoms: true }), maxWeeksFor('REINTRO', C), C);
    expect(t.phase).toBe('BASE');
    expect(t.reason).toBe('REINTRO_TOPE');
  });

  it('BASE -> CUT por estancamiento', () => {
    const t = nextPhase('BASE', emptySignals({ stallWeeks: 2 }), 5, C);
    expect(t.phase).toBe('CUT');
    expect(t.reason).toBe('BASE_ESTANCAMIENTO');
  });

  it('BASE -> REFEED por sintomas de adaptacion', () => {
    const t = nextPhase('BASE', emptySignals({ stallWeeks: 2, adaptationSymptoms: true }), 5, C);
    expect(t.phase).toBe('REFEED');
    expect(t.reason).toBe('BASE_SINTOMAS_ADAPTACION');
  });

  it('BASE continua si hay progreso', () => {
    const t = nextPhase('BASE', emptySignals({ progress: true }), 5, C);
    expect(t.changed).toBe(false);
  });

  it('CUT -> CUT_AGRESIVO por estancamiento con buena energia y fuerza', () => {
    const t = nextPhase('CUT', emptySignals({ stallWeeks: 2 }), 3, C);
    expect(t.phase).toBe('CUT_AGRESIVO');
    expect(t.reason).toBe('CUT_ESTANCAMIENTO_SIN_SINTOMAS');
  });

  it('CUT -> REFEED por estancamiento con sintomas', () => {
    const t = nextPhase('CUT', emptySignals({ stallWeeks: 2, adaptationSymptoms: true }), 3, C);
    expect(t.phase).toBe('REFEED');
    expect(t.reason).toBe('CUT_ESTANCAMIENTO_CON_SINTOMAS');
  });

  it('CUT -> REFEED al tope de 6 semanas', () => {
    const t = nextPhase('CUT', emptySignals(), maxWeeksFor('CUT', C), C);
    expect(t.phase).toBe('REFEED');
    expect(t.reason).toBe('CUT_TOPE');
  });

  it('CUT_AGRESIVO -> REFEED por sintomas', () => {
    const t = nextPhase('CUT_AGRESIVO', emptySignals({ adaptationSymptoms: true }), 1, C);
    expect(t.phase).toBe('REFEED');
    expect(t.reason).toBe('CUT_AGRESIVO_SINTOMAS');
  });

  it('CUT_AGRESIVO -> REFEED al tope de semanas', () => {
    const t = nextPhase('CUT_AGRESIVO', emptySignals(), maxWeeksFor('CUT_AGRESIVO', C), C);
    expect(t.phase).toBe('REFEED');
    expect(t.reason).toBe('CUT_AGRESIVO_TOPE');
  });

  it('REFEED -> ESTABILIZACION siempre', () => {
    const t = nextPhase('REFEED', emptySignals(), maxWeeksFor('REFEED', C), C);
    expect(t.phase).toBe('ESTABILIZACION');
    expect(t.reason).toBe('REFEED_SIEMPRE_ESTABILIZACION');
  });

  it('ESTABILIZACION -> BASE si la tendencia es buena', () => {
    const t = nextPhase('ESTABILIZACION', emptySignals({ progress: true }), maxWeeksFor('ESTABILIZACION', C), C);
    expect(t.phase).toBe('BASE');
  });

  it('ESTABILIZACION -> CUT si la tendencia es plana', () => {
    const t = nextPhase('ESTABILIZACION', emptySignals({ progress: false }), maxWeeksFor('ESTABILIZACION', C), C);
    expect(t.phase).toBe('CUT');
  });

  it('MANTENIMIENTO -> REINTRO al reiniciar', () => {
    const t = nextPhase('MANTENIMIENTO', emptySignals({ restart: true }), 20, C);
    expect(t.phase).toBe('REINTRO');
    expect(t.reason).toBe('REINICIO');
  });

  it('cualquier fase -> MANTENIMIENTO si deja de entrenar', () => {
    const t = nextPhase('CUT', emptySignals({ daysWithoutTraining: 14 }), 2, C);
    expect(t.phase).toBe('MANTENIMIENTO');
    expect(t.reason).toBe('SIN_ENTRENO_PROLONGADO');
  });

  it('cualquier fase -> MANTENIMIENTO al alcanzar la meta', () => {
    const t = nextPhase('CUT', emptySignals({ goalReached: true }), 2, C);
    expect(t.phase).toBe('MANTENIMIENTO');
    expect(t.reason).toBe('META_ALCANZADA');
  });
});

describe('utilidades de fase', () => {
  it('atPhaseCap usa los topes de la config', () => {
    const config = loadConfig({ maxWeeks: { CUT_AGRESIVO: 3 } });
    expect(atPhaseCap('CUT_AGRESIVO', 2, config)).toBe(false);
    expect(atPhaseCap('CUT_AGRESIVO', 3, config)).toBe(true);
  });

  it('phaseAfterCap de BASE no cambia (BASE no tiene tope real)', () => {
    expect(phaseAfterCap('BASE', emptySignals(), C).changed).toBe(false);
  });

  it('deeperPhase recorre la escalera de deficit', () => {
    expect(deeperPhase('BASE')).toBe('CUT');
    expect(deeperPhase('CUT')).toBe('CUT_AGRESIVO');
    expect(deeperPhase('CUT_AGRESIVO')).toBe('CUT_AGRESIVO');
    expect(deeperPhase('ESTABILIZACION')).toBe('CUT');
    expect(deeperPhase('MANTENIMIENTO')).toBe('REINTRO');
  });
});
