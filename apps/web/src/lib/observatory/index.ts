/**
 * Observatorio del admin (Fase 3).
 *
 * `/admin` dejó de ser una bandeja de aprobación: con el autopiloto encendido
 * el admin observa. Aquí vive todo lo que se puede afirmar contando —
 * tendencias, pronóstico, adherencia, fuerza, timeline de decisiones,
 * propuestas — y las cuatro señales que sí ameritan avisarle.
 *
 * Los módulos `trend`, `signals`, `proposals` y `sanitize` son puros y están
 * probados; `data` y `escalation` son los únicos que tocan la base.
 */

export {
  loadObservatory,
  findOutOfConfig,
  weeksInCurrentPhase,
  type ObservatoryData,
  type WeekRow,
  type TimelineEntry,
  type StrengthWeek,
  type PersonalRecord,
  type AdherenceSummary,
} from "@/lib/observatory/data";

export {
  runEscalationCheck,
  runEscalationSweep,
  pendingEscalations,
  type EscalationResult,
  type AdminEscalationNotice,
} from "@/lib/observatory/escalation";

export {
  detectEscalations,
  SAFETY_SYMPTOMS,
  type EscalationSignal,
  type EscalationSignalId,
} from "@/lib/observatory/signals";

export {
  forecast,
  forecastWindow,
  linearFit,
  FORECAST_MIN_WEEKS,
  FORECAST_MAX_WEEKS,
  TWO_WEEKS_WARNING,
  type Forecast,
  type TrendPoint,
} from "@/lib/observatory/trend";

export { buildProposals, type Proposal } from "@/lib/observatory/proposals";

export { sanitizeForAdmin, INCONCLUSIVE_LABEL } from "@/lib/observatory/sanitize";
