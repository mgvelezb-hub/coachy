import { DEFAULT_CONFIG, type EngineConfig } from './config.js';
import type { Phase } from './types.js';

/** Senales que la maquina de fases necesita para decidir la transicion. */
export interface PhaseSignals {
  /** Semanas concluyentes consecutivas sin progreso. */
  stallWeeks: number;
  /** Hubo progreso esta semana (cinta, fotos o peso). */
  progress: boolean;
  /** 0-1 */
  compliance: number;
  /** inflamacion >= umbral, energia <= umbral, hambre >= umbral, sueno <= umbral. */
  symptomCount: number;
  /** Sintomas de adaptacion suficientes para preferir REFEED. */
  adaptationSymptoms: boolean;
  energyOk: boolean;
  strengthOk: boolean;
  /** Sintomas activos que impiden entrar a una fase mas agresiva. */
  hasActiveSymptoms: boolean;
  newInjury: boolean;
  daysWithoutTraining: number;
  restart: boolean;
  goalReached: boolean;
  /** El atleta pide apretar explicitamente. */
  aggressiveRequest: boolean;
}

export function emptySignals(overrides: Partial<PhaseSignals> = {}): PhaseSignals {
  return {
    stallWeeks: 0,
    progress: false,
    compliance: 1,
    symptomCount: 0,
    adaptationSymptoms: false,
    energyOk: true,
    strengthOk: true,
    hasActiveSymptoms: false,
    newInjury: false,
    daysWithoutTraining: 0,
    restart: false,
    goalReached: false,
    aggressiveRequest: false,
    ...overrides,
  };
}

export interface PhaseTransition {
  phase: Phase;
  changed: boolean;
  /** Id de la fila de la tabla de transiciones (spec §3). */
  reason: string;
}

/** Tope de semanas de la fase. */
export function maxWeeksFor(phase: Phase, config: EngineConfig = DEFAULT_CONFIG): number {
  return config.maxWeeks[phase];
}

export function atPhaseCap(
  phase: Phase,
  weeksInPhase: number,
  config: EngineConfig = DEFAULT_CONFIG,
): boolean {
  return weeksInPhase >= maxWeeksFor(phase, config);
}

/**
 * Transicion determinista de la fase que sigue al tope de la fase actual.
 * REFEED -> ESTABILIZACION es automatica ("siempre" en el spec §3).
 */
export function phaseAfterCap(
  phase: Phase,
  signals: PhaseSignals,
  config: EngineConfig = DEFAULT_CONFIG,
): PhaseTransition {
  switch (phase) {
    case 'REINTRO':
      return { phase: 'BASE', changed: true, reason: 'REINTRO_TOPE' };
    case 'CUT':
      return { phase: 'REFEED', changed: true, reason: 'CUT_TOPE' };
    case 'CUT_AGRESIVO':
      return { phase: 'REFEED', changed: true, reason: 'CUT_AGRESIVO_TOPE' };
    case 'REFEED':
      return { phase: 'ESTABILIZACION', changed: true, reason: 'REFEED_SIEMPRE_ESTABILIZACION' };
    case 'ESTABILIZACION':
      return signals.progress
        ? { phase: 'BASE', changed: true, reason: 'ESTABILIZACION_TENDENCIA_BUENA' }
        : { phase: 'CUT', changed: true, reason: 'ESTABILIZACION_TENDENCIA_PLANA' };
    default:
      return { phase, changed: false, reason: 'SIN_TOPE' };
  }
}

/**
 * Siguiente fase segun la tabla del spec §3.
 * Orden: contexto global (meta/pausa/lesion) -> tope de fase -> condiciones de salida.
 */
export function nextPhase(
  current: Phase,
  signals: PhaseSignals,
  weeksInPhase: number,
  config: EngineConfig = DEFAULT_CONFIG,
): PhaseTransition {
  if (signals.restart) {
    return current === 'REINTRO'
      ? { phase: 'REINTRO', changed: false, reason: 'REINICIO_YA_EN_REINTRO' }
      : { phase: 'REINTRO', changed: true, reason: 'REINICIO' };
  }

  if (signals.daysWithoutTraining >= config.daysWithoutTrainingForMaintenance) {
    return current === 'MANTENIMIENTO'
      ? { phase: 'MANTENIMIENTO', changed: false, reason: 'SIN_ENTRENO_YA_EN_MANTENIMIENTO' }
      : { phase: 'MANTENIMIENTO', changed: true, reason: 'SIN_ENTRENO_PROLONGADO' };
  }

  if (signals.goalReached) {
    return current === 'MANTENIMIENTO'
      ? { phase: 'MANTENIMIENTO', changed: false, reason: 'META_YA_EN_MANTENIMIENTO' }
      : { phase: 'MANTENIMIENTO', changed: true, reason: 'META_ALCANZADA' };
  }

  if (atPhaseCap(current, weeksInPhase, config)) {
    const capped = phaseAfterCap(current, signals, config);
    if (capped.changed) return capped;
  }

  const stalled = signals.stallWeeks >= config.weeksForStall;

  switch (current) {
    case 'REINTRO':
      if (signals.compliance >= 0.8 && !signals.hasActiveSymptoms) {
        return { phase: 'BASE', changed: true, reason: 'REINTRO_ADHERENCIA_OK' };
      }
      return { phase: 'REINTRO', changed: false, reason: 'REINTRO_CONTINUA' };

    case 'BASE':
      if (signals.adaptationSymptoms) {
        return { phase: 'REFEED', changed: true, reason: 'BASE_SINTOMAS_ADAPTACION' };
      }
      if (stalled) return { phase: 'CUT', changed: true, reason: 'BASE_ESTANCAMIENTO' };
      return { phase: 'BASE', changed: false, reason: 'BASE_CONTINUA' };

    case 'CUT':
      if (stalled && signals.adaptationSymptoms) {
        return { phase: 'REFEED', changed: true, reason: 'CUT_ESTANCAMIENTO_CON_SINTOMAS' };
      }
      if (stalled && signals.energyOk && signals.strengthOk) {
        return { phase: 'CUT_AGRESIVO', changed: true, reason: 'CUT_ESTANCAMIENTO_SIN_SINTOMAS' };
      }
      return { phase: 'CUT', changed: false, reason: 'CUT_CONTINUA' };

    case 'CUT_AGRESIVO':
      if (signals.adaptationSymptoms || !signals.energyOk || !signals.strengthOk) {
        return { phase: 'REFEED', changed: true, reason: 'CUT_AGRESIVO_SINTOMAS' };
      }
      return { phase: 'CUT_AGRESIVO', changed: false, reason: 'CUT_AGRESIVO_CONTINUA' };

    case 'REFEED':
      return { phase: 'REFEED', changed: false, reason: 'REFEED_CONTINUA' };

    case 'ESTABILIZACION':
      return { phase: 'ESTABILIZACION', changed: false, reason: 'ESTABILIZACION_CONTINUA' };

    case 'MANTENIMIENTO':
      return { phase: 'MANTENIMIENTO', changed: false, reason: 'MANTENIMIENTO_CONTINUA' };
  }
}

/**
 * Fase siguiente cuando el motor decide "profundizar" dentro del ciclo.
 * Se usa cuando el escalon de kcal deja el deficit fuera de la banda de la fase.
 */
export function deeperPhase(current: Phase): Phase {
  switch (current) {
    case 'MANTENIMIENTO':
      return 'REINTRO';
    case 'REINTRO':
      return 'BASE';
    case 'BASE':
      return 'CUT';
    case 'ESTABILIZACION':
      return 'CUT';
    case 'CUT':
      return 'CUT_AGRESIVO';
    case 'CUT_AGRESIVO':
      return 'CUT_AGRESIVO';
    case 'REFEED':
      return 'ESTABILIZACION';
  }
}
