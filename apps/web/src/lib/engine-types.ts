/**
 * Puente hacia los tipos del motor.
 *
 * `packages/engine` es la fuente de verdad; la app nunca redefine sus tipos.
 * Este archivo existe solo para que el resto de `apps/web` importe desde un
 * punto único: si el paquete cambia de nombre, se toca aquí y nada más.
 */
export type {
  CheckIn as EngineCheckIn,
  CyclePhase as EngineCyclePhase,
  DietStyle as EngineDietStyle,
  Supplement as EngineSupplement,
  Decision as EngineDecision,
  EngineConfig,
  MacroTargets,
  MealSlot,
  Phase,
  Profile as EngineProfile,
  RuleHit,
  StrengthTrend as EngineStrengthTrend,
} from "engine";
