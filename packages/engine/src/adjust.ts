import {
  DEFAULT_CONFIG,
  deficitRange,
  pickDeficit,
  type EngineConfig,
} from './config.js';
import {
  deficitForKcal,
  energyBase,
  kcalFloor,
  kcalForDeficit,
  macrosFor,
  withRefeedCarbs,
} from './calc.js';
import { distribute } from './meals.js';
import { atPhaseCap, deeperPhase, emptySignals, phaseAfterCap, type PhaseSignals } from './phases.js';
import type {
  CheckIn,
  Decision,
  DecisionCategory,
  MacroTargets,
  Phase,
  Profile,
  RuleHit,
} from './types.js';

const DAY_MS = 86_400_000;

export function weeksBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / (7 * DAY_MS));
}

function addWeeks(iso: string, weeks: number): string {
  const t = Date.parse(iso) + weeks * 7 * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

type Action =
  | 'HOLD'
  | 'REFEED'
  | 'DEEPEN'
  | 'MAINTENANCE'
  | 'RAISE'
  | 'CONTEXT_CHANGE'
  | 'PHASE_CAP';

interface Rule {
  id: string;
  nombre: string;
  run(ctx: WeekContext): (RuleHit & { action?: Action }) | null;
}

interface EngineState {
  phase: Phase;
  phaseStartDate: string;
  /** Fase inmediatamente anterior a un REFEED, para calcular la estabilizacion. */
  phaseBeforeRefeed: Phase;
  kcal: number;
  stallWeeks: number;
  lastMenuRefreshDate: string;
  strengthDownStreak: number;
  electrolyteStreak: number;
  fastLossStreak: number;
  lastWaist?: { date: string; cm: number };
  lastWeight?: { date: string; kg: number };
}

interface WeekContext {
  checkIn: CheckIn;
  previous?: CheckIn;
  profile: Profile;
  config: EngineConfig;
  state: EngineState;
  /** Fase vigente tras las transiciones automaticas. */
  phase: Phase;
  weeksInPhase: number;
  progress: boolean;
  progressSource: 'cintura' | 'fotos' | 'peso' | 'sensaciones' | 'ninguno';
  waistRatePerWeek: number | null;
  weightRatePctPerWeek: number | null;
  objectiveData: boolean;
  cycleInconclusive: boolean;
  inconclusive: boolean;
  stallWeeks: number;
  symptomCount: number;
  compliance: number;
  symptoms: string[];
  weeksSinceMenuRefresh: number;
}

function scale(value: number | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function countAdaptationSymptoms(checkIn: CheckIn, config: EngineConfig): number {
  let count = 0;
  if (checkIn.inflammation >= config.inflammationTightenThreshold) count += 1;
  if (checkIn.energy <= config.energyLowThreshold) count += 1;
  if (checkIn.hunger >= config.hungerHighThreshold) count += 1;
  if (scale(checkIn.sleep, 3) <= config.sleepLowThreshold) count += 1;
  return count;
}

// --------------------------------------------------------------------------
// Reglas (spec §4). Orden: no concluyente -> seguridad -> adherencia ->
// progreso -> estancamiento -> topes.
// --------------------------------------------------------------------------

const RULES: Rule[] = [
  {
    id: 'R0',
    nombre: 'CAMBIO_DE_CONTEXTO',
    run(ctx) {
      if (!ctx.checkIn.contextChange) return null;
      return {
        id: 'R0',
        nombre: 'CAMBIO_DE_CONTEXTO',
        explicacion:
          'Cambio de contexto declarado (comidas, tiempo o entreno). Se reestructura el plan con los mismos macros.',
        action: 'CONTEXT_CHANGE',
        category: 'CONTEXT_CHANGE',
      };
    },
  },
  {
    id: 'R1',
    nombre: 'DATOS_NO_CONCLUYENTES',
    run(ctx) {
      if (!ctx.cycleInconclusive) return null;
      return {
        id: 'R1',
        nombre: 'DATOS_NO_CONCLUYENTES',
        explicacion:
          'Semana en fase lutea o menstruacion sin caida de cintura: la retencion distorsiona la medida. Se mantiene el plan y la semana no cuenta para estancamiento.',
        action: 'HOLD',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R2',
    nombre: 'SEGURIDAD_ELECTROLITOS',
    run(ctx) {
      const deep = ctx.phase === 'CUT' || ctx.phase === 'CUT_AGRESIVO';
      const hasSymptom = ctx.symptoms.includes('mareo') || ctx.symptoms.includes('calambres');
      if (!deep || !hasSymptom) return null;
      if (ctx.state.electrolyteStreak + 1 >= ctx.config.weeksElectrolyteSymptomsForRefeed) {
        return {
          id: 'R2',
          nombre: 'SEGURIDAD_ELECTROLITOS',
          explicacion:
            'Mareo o calambres en deficit profundo por segunda semana. Se sube a semana de recarga y se mantiene el protocolo de electrolitos.',
          action: 'REFEED',
          category: 'REFEED',
        };
      }
      return {
        id: 'R2',
        nombre: 'SEGURIDAD_ELECTROLITOS',
        explicacion:
          'Mareo o calambres en deficit profundo: se activa el protocolo de electrolitos (salar comidas, agua mineral con sal).',
      };
    },
  },
  {
    id: 'R3',
    nombre: 'SEGURIDAD_LESION_O_ENFERMEDAD',
    run(ctx) {
      const sick = ctx.symptoms.includes('enfermedad');
      if (!ctx.checkIn.newInjury && !sick) return null;
      return {
        id: 'R3',
        nombre: 'SEGURIDAD_LESION_O_ENFERMEDAD',
        explicacion: ctx.checkIn.newInjury
          ? 'Lesion nueva: la dieta no se mueve y el entreno pasa a protocolo de lesion.'
          : 'Semana con enfermedad: la dieta no se mueve y la semana no cuenta para estancamiento.',
        action: 'HOLD',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R4',
    nombre: 'SEGURIDAD_SIN_ENTRENO',
    run(ctx) {
      const days = ctx.checkIn.daysWithoutTraining ?? 0;
      if (days < ctx.config.daysWithoutTrainingForMaintenance) return null;
      return {
        id: 'R4',
        nombre: 'SEGURIDAD_SIN_ENTRENO',
        explicacion: `${days} dias sin entrenar: se pasa a mantenimiento hasta retomar.`,
        action: 'MAINTENANCE',
        category: 'HOLD',
        phase: 'MANTENIMIENTO',
      };
    },
  },
  {
    id: 'R5',
    nombre: 'SEGURIDAD_ADAPTACION',
    run(ctx) {
      const streak = ctx.checkIn.strengthTrend === 'baja' ? ctx.state.strengthDownStreak + 1 : 0;
      if (streak < ctx.config.weeksStrengthDownForRefeed) return null;
      if (ctx.checkIn.hunger < ctx.config.hungerHighThreshold) return null;
      return {
        id: 'R5',
        nombre: 'SEGURIDAD_ADAPTACION',
        explicacion:
          'Fuerza a la baja varias semanas seguidas con hambre alta: senal de adaptacion. Semana de recarga.',
        action: 'REFEED',
        category: 'REFEED',
      };
    },
  },
  {
    id: 'R6',
    nombre: 'SEGURIDAD_RITMO_RAPIDO',
    run(ctx) {
      if (ctx.weightRatePctPerWeek === null) return null;
      const tooFast = -ctx.weightRatePctPerWeek > ctx.config.maxLossRatePctPerWeek;
      const streak = tooFast ? ctx.state.fastLossStreak + 1 : 0;
      if (streak < 2) return null;
      return {
        id: 'R6',
        nombre: 'SEGURIDAD_RITMO_RAPIDO',
        explicacion: `Perdida por encima de ${ctx.config.maxLossRatePctPerWeek}%/semana dos semanas seguidas: se suben ${ctx.config.kcalRaiseStepOnFastLoss} kcal para proteger masa magra.`,
        action: 'RAISE',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R7',
    nombre: 'ADHERENCIA',
    run(ctx) {
      if (ctx.compliance >= ctx.config.minComplianceToTighten) return null;
      return {
        id: 'R7',
        nombre: 'ADHERENCIA',
        explicacion: `Cumplimiento de dieta ${Math.round(ctx.compliance * 100)}%: no se profundiza. Se simplifica el menu (menos ingredientes, mas repeticion) y se mantienen las kcal.`,
        action: 'HOLD',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R8',
    nombre: 'PROGRESO',
    run(ctx) {
      if (!ctx.progress) return null;
      const detalle: Record<string, string> = {
        cintura: 'la cintura sigue bajando al ritmo objetivo',
        fotos: 'las fotos muestran mejora',
        peso: 'el peso baja al ritmo objetivo',
        sensaciones: 'sin medida objetiva, las sensaciones y la fuerza acompanan',
        ninguno: 'hay progreso',
      };
      return {
        id: 'R8',
        nombre: 'PROGRESO',
        explicacion: `Hay progreso: ${detalle[ctx.progressSource]}. Seguimos con la misma.`,
        action: 'HOLD',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R9',
    nombre: 'RECOMPOSICION',
    run(ctx) {
      if (ctx.waistRatePerWeek === null || ctx.waistRatePerWeek >= 0) return null;
      if (ctx.weightRatePctPerWeek === null || ctx.weightRatePctPerWeek < -0.2) return null;
      return {
        id: 'R9',
        nombre: 'RECOMPOSICION',
        explicacion:
          'La cintura baja y el peso se queda igual: es recomposicion. La cinta manda, no se ajustan kcal por bascula.',
        action: 'HOLD',
        category: 'HOLD',
      };
    },
  },
  {
    id: 'R10',
    nombre: 'ESTANCAMIENTO_REFEED',
    run(ctx) {
      if (!stallTrigger(ctx)) return null;
      if (ctx.symptomCount < ctx.config.symptomCountForRefeed) return null;
      return {
        id: 'R10',
        nombre: 'ESTANCAMIENTO_REFEED',
        explicacion:
          'Sin progreso y con senales de adaptacion (inflamacion, energia baja, hambre alta o sueno pobre): semana de recarga, todo el extra en carbohidratos.',
        action: 'REFEED',
        category: 'REFEED',
      };
    },
  },
  {
    id: 'R11',
    nombre: 'ESTANCAMIENTO_PROFUNDIZAR',
    run(ctx) {
      if (!stallTrigger(ctx)) return null;
      if (ctx.checkIn.energy < 3) return null;
      if (ctx.checkIn.strengthTrend === 'baja') return null;
      return {
        id: 'R11',
        nombre: 'ESTANCAMIENTO_PROFUNDIZAR',
        explicacion: `Sin progreso y sin senales de adaptacion: se profundiza ${ctx.config.kcalAdjustStep} kcal, todas en carbohidratos. Proteina y grasa no se tocan.`,
        action: 'DEEPEN',
      };
    },
  },
  {
    id: 'R12',
    nombre: 'TOPE_DE_FASE',
    run(ctx) {
      if (!atPhaseCap(ctx.phase, ctx.weeksInPhase, ctx.config)) return null;
      const target = phaseAfterCap(ctx.phase, signalsFor(ctx), ctx.config);
      if (!target.changed) return null;
      return {
        id: 'R12',
        nombre: 'TOPE_DE_FASE',
        explicacion: `La fase ${ctx.phase} llego a su tope de ${ctx.config.maxWeeks[ctx.phase]} semana(s): pasa a ${target.phase}.`,
        action: 'PHASE_CAP',
        phase: target.phase,
      };
    },
  },
];

function stallTrigger(ctx: WeekContext): boolean {
  if (ctx.compliance < ctx.config.minComplianceToTighten) return false;
  if (ctx.progress) return false;
  if (ctx.stallWeeks >= ctx.config.weeksForStall) return true;
  // Metodologia del coach: "estancamiento o inflamacion -> cambio de fase".
  return ctx.checkIn.inflammation >= ctx.config.inflammationTightenThreshold;
}

function signalsFor(ctx: WeekContext): PhaseSignals {
  return emptySignals({
    stallWeeks: ctx.stallWeeks,
    progress: ctx.progress,
    compliance: ctx.compliance,
    symptomCount: ctx.symptomCount,
    adaptationSymptoms: ctx.symptomCount >= ctx.config.symptomCountForRefeed,
    energyOk: ctx.checkIn.energy >= 3,
    strengthOk: ctx.checkIn.strengthTrend !== 'baja',
    hasActiveSymptoms: ctx.symptoms.length > 0,
    newInjury: Boolean(ctx.checkIn.newInjury),
    daysWithoutTraining: ctx.checkIn.daysWithoutTraining ?? 0,
    restart: Boolean(ctx.checkIn.restart),
    goalReached: Boolean(ctx.checkIn.goalReached),
    aggressiveRequest: Boolean(ctx.checkIn.aggressiveRequest),
  });
}

// --------------------------------------------------------------------------

function estabilizacionKcal(state: EngineState, profile: Profile, config: EngineConfig): number {
  const previousDeficit = deficitForKcal(profile, state.kcal, config);
  const target = Math.max(0, previousDeficit - 0.05);
  const [min, max] = deficitRange('ESTABILIZACION', config);
  const clamped = Math.min(Math.max(target, min), max);
  return kcalForDeficit(profile, clamped, config);
}

function refeedKcal(state: EngineState, profile: Profile, config: EngineConfig): number {
  const [minDeficit, maxDeficit] = deficitRange('REFEED', config);
  const ceiling = kcalForDeficit(profile, minDeficit, config);
  const floorKcal = kcalForDeficit(profile, maxDeficit, config);
  const wanted = state.kcal + config.refeedExtraCarbG * 4;
  return Math.min(Math.max(wanted, floorKcal), ceiling);
}

function kcalOnEnterPhase(
  phase: Phase,
  state: EngineState,
  profile: Profile,
  config: EngineConfig,
): number {
  if (phase === 'REFEED') return refeedKcal(state, profile, config);
  if (phase === 'ESTABILIZACION') return estabilizacionKcal(state, profile, config);
  return kcalForDeficit(profile, pickDeficit(phase, config), config);
}

function initialState(first: CheckIn, profile: Profile, config: EngineConfig): EngineState {
  const phase: Phase = 'BASE';
  return {
    phase,
    phaseStartDate: first.date,
    phaseBeforeRefeed: phase,
    kcal: kcalForDeficit(profile, pickDeficit(phase, config), config),
    stallWeeks: 0,
    lastMenuRefreshDate: addWeeks(first.date, -config.menuRefreshWeeks),
    strengthDownStreak: 0,
    electrolyteStreak: 0,
    fastLossStreak: 0,
  };
}

function buildContext(
  checkIn: CheckIn,
  previous: CheckIn | undefined,
  profile: Profile,
  config: EngineConfig,
  state: EngineState,
): WeekContext {
  // Transicion automatica REFEED -> ESTABILIZACION (spec §3: "siempre").
  if (state.phase === 'REFEED') {
    const weeks = weeksBetween(state.phaseStartDate, checkIn.date);
    if (weeks >= config.maxWeeks.REFEED) {
      state.phaseStartDate = addWeeks(state.phaseStartDate, config.maxWeeks.REFEED);
      state.kcal = estabilizacionKcal(state, profile, config);
      state.phase = 'ESTABILIZACION';
    }
  }

  const phase = state.phase;
  const weeksInPhase = Math.max(0, weeksBetween(state.phaseStartDate, checkIn.date));

  let waistRatePerWeek: number | null = null;
  if (checkIn.waistCm !== undefined && state.lastWaist) {
    const weeks = Math.max(1, weeksBetween(state.lastWaist.date, checkIn.date));
    waistRatePerWeek = (checkIn.waistCm - state.lastWaist.cm) / weeks;
  }

  let weightRatePctPerWeek: number | null = null;
  if (checkIn.weightKg !== undefined && state.lastWeight && state.lastWeight.kg > 0) {
    const weeks = Math.max(1, weeksBetween(state.lastWeight.date, checkIn.date));
    weightRatePctPerWeek = ((checkIn.weightKg - state.lastWeight.kg) / state.lastWeight.kg / weeks) * 100;
  }

  const photos = checkIn.photosTrend;
  const objectiveData =
    waistRatePerWeek !== null ||
    weightRatePctPerWeek !== null ||
    (photos !== undefined && photos !== 'no_comparable');

  const progressWaist =
    waistRatePerWeek !== null && waistRatePerWeek <= config.waistProgressThresholdCmPerWeek;
  const progressWeight =
    weightRatePctPerWeek !== null &&
    weightRatePctPerWeek <= config.weightProgressThresholdPctPerWeek;
  const progressPhotos = photos === 'mejora';

  let progress = progressWaist || progressPhotos || progressWeight;
  let progressSource: WeekContext['progressSource'] = progressWaist
    ? 'cintura'
    : progressPhotos
      ? 'fotos'
      : progressWeight
        ? 'peso'
        : 'ninguno';

  if (!objectiveData && config.allowSubjectiveProgress) {
    // Jerarquia de senales del coach: sin cinta ni fotos, mandan sensacion y fuerza.
    if (checkIn.inflammation <= 2 && checkIn.strengthTrend === 'sube') {
      progress = true;
      progressSource = 'sensaciones';
    }
  }

  const cycle = checkIn.cyclePhase ?? 'na';
  const cycleInconclusive =
    (cycle === 'lutea' || cycle === 'menstruacion') &&
    (waistRatePerWeek === null || waistRatePerWeek > config.inconclusiveWaistDeltaCm);

  const symptoms = checkIn.symptoms ?? [];
  const sick = symptoms.includes('enfermedad');
  const inconclusive = cycleInconclusive || !objectiveData || sick;

  const countsForStall = !inconclusive && !progress && !checkIn.newInjury;
  const stallWeeks = progress ? 0 : countsForStall ? state.stallWeeks + 1 : state.stallWeeks;

  return {
    checkIn,
    previous,
    profile,
    config,
    state,
    phase,
    weeksInPhase,
    progress,
    progressSource,
    waistRatePerWeek,
    weightRatePctPerWeek,
    objectiveData,
    cycleInconclusive,
    inconclusive,
    stallWeeks,
    symptomCount: countAdaptationSymptoms(checkIn, config),
    compliance: (checkIn.dietCompliancePct ?? 100) / 100,
    symptoms,
    weeksSinceMenuRefresh: weeksBetween(state.lastMenuRefreshDate, checkIn.date),
  };
}

function categoryFor(
  action: Action | undefined,
  imposed: DecisionCategory | undefined,
  fromPhase: Phase,
  toPhase: Phase,
  fromKcal: number,
  toKcal: number,
): DecisionCategory {
  if (imposed) return imposed;
  if (action === 'CONTEXT_CHANGE') return 'CONTEXT_CHANGE';
  if (toPhase === 'REFEED') return 'REFEED';
  const tightened = toKcal < fromKcal - 1;
  if (toPhase !== fromPhase && tightened) {
    if (toPhase === 'CUT' || toPhase === 'CUT_AGRESIVO') return toPhase;
  }
  if (tightened) return 'TIGHTEN';
  return 'HOLD';
}

function applyDeepen(
  ctx: WeekContext,
): { phase: Phase; kcal: number } {
  const { profile, config, state, phase } = ctx;
  const wanted = state.kcal - config.kcalAdjustStep;
  const [minDeficit, maxDeficit] = deficitRange(phase, config);
  const bandFloor = kcalForDeficit(profile, maxDeficit, config);
  if (wanted >= bandFloor - 1e-6) {
    return { phase, kcal: Math.max(wanted, kcalFloor(profile, config)) };
  }
  // El escalon deja el deficit fuera de la banda: toca cambiar de fase.
  const next = deeperPhase(phase);
  const [nextMin, nextMax] = deficitRange(next, config);
  const nextCeiling = kcalForDeficit(profile, nextMin, config);
  const nextFloor = kcalForDeficit(profile, nextMax, config);
  void minDeficit;
  const kcal = Math.min(Math.max(wanted, nextFloor), nextCeiling);
  return { phase: next, kcal: Math.max(kcal, kcalFloor(profile, config)) };
}

function buildTargets(
  phase: Phase,
  profile: Profile,
  kcal: number,
  config: EngineConfig,
  waistCm: number | undefined,
): MacroTargets {
  const base = macrosFor(phase, profile, kcal, config, { waistCm });
  return phase === 'REFEED' ? base : base;
}

function explain(category: DecisionCategory, phase: Phase, targets: MacroTargets): string {
  const head: Record<DecisionCategory, string> = {
    HOLD: 'Se mantiene el plan.',
    MENU_REFRESH: 'Mismos macros, menu nuevo.',
    TIGHTEN: 'Se aprietan las calorias dentro de la misma fase.',
    CUT: 'Se pasa a fase de corte.',
    CUT_AGRESIVO: 'Se pasa a corte agresivo con carbohidratos solo peri-entreno.',
    REFEED: 'Semana de recarga: el extra va completo a carbohidratos.',
    CONTEXT_CHANGE: 'Se reestructura el plan por cambio de contexto.',
  };
  return `${head[category]} Fase ${phase}: ${targets.kcal} kcal, ${targets.proteinG} g de proteina, ${targets.carbG} g de carbohidratos, ${targets.fatG} g de grasa, minimo ${targets.fiberG} g de fibra.`;
}

function decideWeek(
  checkIn: CheckIn,
  previous: CheckIn | undefined,
  profile: Profile,
  config: EngineConfig,
  state: EngineState,
): Decision {
  const ctx = buildContext(checkIn, previous, profile, config, state);

  const hits: RuleHit[] = [];
  let action: Action | undefined;
  let imposedCategory: DecisionCategory | undefined;
  let imposedPhase: Phase | undefined;
  let electrolyteProtocol = false;
  let simplifyMenu = false;
  let injuryTrainingProtocol = Boolean(checkIn.newInjury || checkIn.activeInjury);

  for (const rule of RULES) {
    const hit = rule.run(ctx);
    if (!hit) continue;
    const { action: hitAction, ...record } = hit;
    hits.push(record);
    if (hit.id === 'R2') electrolyteProtocol = true;
    if (hit.id === 'R7') simplifyMenu = true;
    if (hit.id === 'R3') injuryTrainingProtocol = true;
    if (hitAction && !action) {
      action = hitAction;
      imposedCategory = hit.category;
      imposedPhase = hit.phase;
    }
  }

  const fromPhase = ctx.phase;
  const fromKcal = state.kcal;
  let toPhase: Phase = fromPhase;
  let toKcal = fromKcal;

  switch (action) {
    case 'REFEED':
      toPhase = 'REFEED';
      toKcal = refeedKcal(state, profile, config);
      break;
    case 'DEEPEN': {
      const deepened = applyDeepen(ctx);
      toPhase = deepened.phase;
      toKcal = deepened.kcal;
      break;
    }
    case 'MAINTENANCE':
      toPhase = 'MANTENIMIENTO';
      toKcal = kcalOnEnterPhase('MANTENIMIENTO', state, profile, config);
      break;
    case 'RAISE':
      toKcal = fromKcal + config.kcalRaiseStepOnFastLoss;
      break;
    case 'PHASE_CAP':
      toPhase = imposedPhase ?? fromPhase;
      toKcal = toPhase === fromPhase ? fromKcal : kcalOnEnterPhase(toPhase, state, profile, config);
      break;
    case 'CONTEXT_CHANGE':
    case 'HOLD':
    default:
      break;
  }

  toKcal = Math.max(toKcal, kcalFloor(profile, config));
  const phaseChanged = toPhase !== fromPhase;

  let category = categoryFor(action, imposedCategory, fromPhase, toPhase, fromKcal, toKcal);

  // Refresco de menu: solo puede convertir un HOLD en MENU_REFRESH.
  const changed = phaseChanged || Math.abs(toKcal - fromKcal) > 1 || category === 'CONTEXT_CHANGE';
  const refreshDue = ctx.weeksSinceMenuRefresh >= config.menuRefreshWeeks;
  const menuRefresh = changed || refreshDue;
  if (category === 'HOLD' && refreshDue) {
    category = 'MENU_REFRESH';
    hits.push({
      id: 'R13',
      nombre: 'REFRESCO_DE_MENU',
      explicacion: `Pasaron ${ctx.weeksSinceMenuRefresh} semanas con el mismo menu: se cambian los alimentos manteniendo los macros.`,
      category: 'MENU_REFRESH',
    });
  }
  if (hits.length === 0) {
    hits.push({
      id: 'R14',
      nombre: 'SIN_SENALES_DE_CAMBIO',
      explicacion: 'Ninguna regla pide cambio: se mantiene el plan.',
      category: 'HOLD',
    });
  }

  let targets = buildTargets(toPhase, profile, toKcal, config, checkIn.waistCm);
  if (toPhase === 'REFEED' && targets.carbG < config.refeedExtraCarbG) {
    targets = withRefeedCarbs(targets, config);
  }
  const meals = distribute(targets, profile, toPhase, config);
  const base = energyBase(profile, config, checkIn.waistCm);
  const deficitPct = deficitForKcal(profile, targets.kcal, config);

  // --- actualizar estado para la semana siguiente ---
  if (phaseChanged) {
    if (toPhase === 'REFEED') state.phaseBeforeRefeed = fromPhase;
    state.phase = toPhase;
    state.phaseStartDate = checkIn.date;
  }
  state.kcal = toKcal;
  state.stallWeeks = changed ? 0 : ctx.stallWeeks;
  state.strengthDownStreak = checkIn.strengthTrend === 'baja' ? state.strengthDownStreak + 1 : 0;
  const electroSymptom =
    (ctx.phase === 'CUT' || ctx.phase === 'CUT_AGRESIVO') &&
    (ctx.symptoms.includes('mareo') || ctx.symptoms.includes('calambres'));
  state.electrolyteStreak = electroSymptom ? state.electrolyteStreak + 1 : 0;
  state.fastLossStreak =
    ctx.weightRatePctPerWeek !== null &&
    -ctx.weightRatePctPerWeek > config.maxLossRatePctPerWeek
      ? state.fastLossStreak + 1
      : 0;
  if (checkIn.waistCm !== undefined) state.lastWaist = { date: checkIn.date, cm: checkIn.waistCm };
  if (checkIn.weightKg !== undefined) state.lastWeight = { date: checkIn.date, kg: checkIn.weightKg };
  if (menuRefresh) state.lastMenuRefreshDate = checkIn.date;

  const menuSeed = Math.floor(Date.parse(checkIn.date) / (config.menuRefreshWeeks * 7 * DAY_MS));

  return {
    date: checkIn.date,
    category,
    phase: toPhase,
    previousPhase: fromPhase,
    previousKcal: Math.round(fromKcal),
    deficitPct,
    targets,
    meals,
    rulesFired: hits,
    explicacion: explain(category, toPhase, targets),
    inconclusiveWeek: ctx.inconclusive,
    electrolyteProtocol: electrolyteProtocol || toPhase === 'CUT_AGRESIVO',
    simplifyMenu,
    injuryTrainingProtocol,
    weeksInPhase: phaseChanged ? 0 : ctx.weeksInPhase,
    stallWeeks: state.stallWeeks,
    menuSeed,
    menuRefresh,
    base,
  };
}

/**
 * Decision semanal. Recibe el historial completo ordenado por fecha y
 * devuelve la decision de la ultima semana. Funcion pura: reproduce el
 * estado desde el inicio del historial, sin efectos secundarios.
 */
export function decide(
  history: CheckIn[],
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
): Decision {
  const decisions = decideAll(history, profile, config);
  const last = decisions.at(-1);
  if (!last) throw new Error('decide() necesita al menos un check-in en el historial');
  return last;
}

/** Todas las decisiones semana a semana (lo que usa el backtest). */
export function decideAll(
  history: CheckIn[],
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
): Decision[] {
  if (history.length === 0) return [];
  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  if (!first) return [];
  const state = initialState(first, profile, config);
  const out: Decision[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const checkIn = ordered[i];
    if (!checkIn) continue;
    out.push(decideWeek(checkIn, ordered[i - 1], profile, config, state));
  }
  return out;
}
