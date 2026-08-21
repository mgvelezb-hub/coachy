/**
 * Tipos publicos del motor. Todo el motor es puro: sin IO, sin DB, sin Next.
 * Unidades: kg, cm, gramos enteros, kcal, fechas ISO `YYYY-MM-DD`.
 */

export type Sex = 'female' | 'male';
export type WorkActivity = 'sedentario' | 'activo';
export type Budget = 'bajo' | 'medio';
export type TrainingTime = 'manana' | 'tarde';

export type Phase =
  | 'REINTRO'
  | 'BASE'
  | 'CUT'
  | 'CUT_AGRESIVO'
  | 'REFEED'
  | 'ESTABILIZACION'
  | 'MANTENIMIENTO';

export const PHASES: readonly Phase[] = [
  'REINTRO',
  'BASE',
  'CUT',
  'CUT_AGRESIVO',
  'REFEED',
  'ESTABILIZACION',
  'MANTENIMIENTO',
] as const;

/** Categoria de la decision semanal (la que mide el backtest). */
export type DecisionCategory =
  | 'HOLD'
  | 'MENU_REFRESH'
  | 'TIGHTEN'
  | 'CUT'
  | 'CUT_AGRESIVO'
  | 'REFEED'
  | 'CONTEXT_CHANGE';

export type CyclePhase = 'folicular' | 'ovulacion' | 'lutea' | 'menstruacion' | 'na';
export type StrengthTrend = 'sube' | 'igual' | 'baja';
export type PhotoTrend = 'mejora' | 'igual' | 'retroceso' | 'no_comparable';

/** Escala 1-5 usada en las sensaciones del check-in. */
export type Scale5 = 1 | 2 | 3 | 4 | 5;

/** Sintomas relevantes para las reglas de seguridad. Lista abierta. */
export type Symptom =
  | 'mareo'
  | 'calambres'
  | 'dolor_espalda'
  | 'dolor_pie'
  | 'dolor_tobillo'
  | 'enfermedad'
  | 'insomnio'
  | 'antojo_fuerte'
  | (string & {});

export interface ProfileConditions {
  glucosaAlta?: boolean;
  lesionActiva?: boolean;
  cicloMenstrualTracking?: boolean;
}

export interface Profile {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** InBody u otra medicion directa. Si falta se estima. */
  leanMassKg?: number;
  strengthDaysPerWeek: number;
  cardioMinPerWeek: number;
  work: WorkActivity;
  mealsPerDay: number;
  liquidMeals?: number;
  trainingTime: TrainingTime;
  budget: Budget;
  favoriteFoods?: string[];
  excludedFoods?: string[];
  allergies?: string[];
  conditions?: ProfileConditions;
  /** Minutos disponibles por sesion de cocina; el generador prefiere recetas mas rapidas si es bajo. */
  maxPrepMin?: number;
}

/** Cambio de contexto declarado por el atleta (no es un resultado corporal). */
export interface ContextChange {
  mealsPerDay?: number;
  minutesPerSession?: number;
  trainingChanged?: boolean;
}

export interface CheckIn {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  weightKg?: number;
  waistCm?: number;
  legLeftCm?: number;
  legRightCm?: number;
  armLeftCm?: number;
  armRightCm?: number;
  photosTrend?: PhotoTrend;
  strengthRpe?: number;
  strengthTrend: StrengthTrend;
  inflammation: Scale5;
  energy: Scale5;
  hunger: Scale5;
  satiety?: Scale5;
  sleep?: Scale5;
  /** 0-100 */
  dietCompliancePct: number;
  /** 0-100 */
  trainingCompliancePct?: number;
  symptoms?: Symptom[];
  cyclePhase?: CyclePhase;
  /** Lesion que aparece esta semana (dispara protocolo de lesion). */
  newInjury?: boolean;
  /** Lesion que sigue activa pero ya conocida. */
  activeInjury?: boolean;
  /** Dias consecutivos sin entrenar. */
  daysWithoutTraining?: number;
  /** El atleta declara un cambio de contexto (menos tiempo, menos comidas, deja el cross...). */
  contextChange?: boolean | ContextChange;
  /** El atleta pide explicitamente apretar (deadline, evento). */
  aggressiveRequest?: boolean;
  /** Meta alcanzada -> mantenimiento. */
  goalReached?: boolean;
  /** Reinicio tras pausa larga -> REINTRO. */
  restart?: boolean;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
}

export type MealSlotId = 'PRE' | 'POST' | 'DESAYUNO' | 'COMIDA' | 'CENA' | 'SNACK';

export interface MealSlot {
  id: MealSlotId;
  /** Etiqueta en espanol para la UI. */
  label: string;
  /** Sugerencia de hora `HH:MM`. */
  timeHint: string;
  proteinG: number;
  carbG: number;
  fatG: number;
  kcal: number;
  /** false = "0 carbos densos" (CUT_AGRESIVO en comida y cena). */
  allowDenseCarb: boolean;
  /** Vegetales verdes libres en este slot. */
  freeVegetables: boolean;
}

export interface RuleHit {
  id: string;
  nombre: string;
  /** Texto neutro en espanol. Nunca consejo medico. */
  explicacion: string;
  /** Categoria que impone la regla, si impone alguna. */
  category?: DecisionCategory;
  /** Fase destino que impone la regla, si impone alguna. */
  phase?: Phase;
}

export interface LeanMassEstimate {
  kg: number;
  estimated: boolean;
  bodyFatPct: number;
  method: 'inbody' | 'us_navy' | 'deurenberg_bmi';
}

export interface EnergyBase {
  bmr: number;
  pal: number;
  tdee: number;
  leanMass: LeanMassEstimate;
}

export interface Decision {
  date: string;
  category: DecisionCategory;
  phase: Phase;
  previousPhase: Phase;
  previousKcal: number;
  deficitPct: number;
  targets: MacroTargets;
  meals: MealSlot[];
  rulesFired: RuleHit[];
  explicacion: string;
  /** Semana marcada no concluyente (ciclo, sin datos): no cuenta para estancamiento. */
  inconclusiveWeek: boolean;
  /** Protocolo de electrolitos activo. */
  electrolyteProtocol: boolean;
  /** Simplificar menu (menos ingredientes, mas repeticion). */
  simplifyMenu: boolean;
  /** Adaptar el entreno por lesion. */
  injuryTrainingProtocol: boolean;
  weeksInPhase: number;
  /** Semanas consecutivas concluyentes sin progreso. */
  stallWeeks: number;
  /** Semilla quincenal para el generador de menus. */
  menuSeed: number;
  /** Toca refrescar el menu (mismos macros, alimentos distintos). */
  menuRefresh: boolean;
  base: EnergyBase;
}

export type FoodRole =
  | 'proteina_magra'
  | 'proteina_grasa'
  | 'carbo_pre'
  | 'carbo_post'
  | 'carbo_complejo'
  | 'grasa'
  | 'vegetal_libre'
  | 'fruta'
  | 'suplemento';

export interface Food {
  id: string;
  /** Nombre en espanol. */
  name: string;
  role: FoodRole;
  /** Macros por 100 g de alimento tal como se consume. */
  proteinPer100: number;
  carbPer100: number;
  fatPer100: number;
  fiberPer100: number;
  kcalPer100: number;
  /** Indice glucemico (glucosa=100). null si no aplica (proteinas, grasas). */
  gi: number | null;
  /** Costo relativo 1 (barato) - 3 (caro). */
  costRel: 1 | 2 | 3;
  /** Minutos de preparacion. */
  prepMin: number;
  tags: string[];
  /** Tope razonable de gramos en una comida (miel, aceites, polvos). */
  maxG?: number;
  /** Gramos por porcion habitual, para la lista de super. */
  servingG?: number;
  /** Unidad de compra para la lista de super. */
  unit?: string;
}

export interface MenuItem {
  foodId: string;
  name: string;
  grams: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
  kcal: number;
  free: boolean;
}

export interface Equivalence {
  forFoodId: string;
  forName: string;
  options: Array<{ foodId: string; name: string; grams: number }>;
}

export interface MenuMeal {
  slot: MealSlotId;
  label: string;
  timeHint: string;
  items: MenuItem[];
  equivalences: Equivalence[];
  totals: MacroTargets;
  target: MacroTargets;
}

export interface Menu {
  id: 1 | 2;
  label: string;
  meals: MenuMeal[];
  totals: MacroTargets;
  /** Desviacion porcentual vs target por macro. */
  deviationPct: { kcal: number; proteinG: number; carbG: number; fatG: number };
}

export interface ShoppingItem {
  foodId: string;
  name: string;
  grams: number;
  unit: string;
  costRel: 1 | 2 | 3;
}

export interface MenuPlan {
  seed: number;
  target: MacroTargets;
  menus: [Menu, Menu];
  shoppingList: ShoppingItem[];
  /** Notas operativas neutras (electrolitos, vegetales libres, fibra). */
  notas: string[];
}
