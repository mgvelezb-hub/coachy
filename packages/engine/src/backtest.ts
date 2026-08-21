import history from '../data/coach-history.json';
import { DEFAULT_CONFIG, type EngineConfig } from './config.js';
import { decide } from './adjust.js';
import type {
  CheckIn,
  Decision,
  DecisionCategory,
  Profile,
  Scale5,
  StrengthTrend,
  PhotoTrend,
} from './types.js';

/** Una semana del fixture: solo senales abstractas + la decision esperada. */
export interface BacktestWeek {
  week: string;
  waistCm?: number;
  weightKg?: number;
  photosTrend?: PhotoTrend;
  inflammation: number;
  energy: number;
  hunger: number;
  sleep?: number;
  strengthTrend: StrengthTrend;
  compliance: number;
  symptoms?: string[];
  newInjury?: boolean;
  activeInjury?: boolean;
  daysWithoutTraining?: number;
  contextChange?: boolean;
  aggressiveRequest?: boolean;
  weeksSincePhaseChange?: number;
  expected: DecisionCategory;
}

export interface BacktestRow {
  week: string;
  expected: DecisionCategory;
  got: DecisionCategory;
  match: boolean;
  phase: string;
  kcal: number;
  rules: string[];
}

export interface BacktestReport {
  rows: BacktestRow[];
  matches: number;
  total: number;
  accuracy: number;
  decisions: Decision[];
}

/**
 * Perfil de referencia del backtest: generico, sin datos personales.
 * Mujer 75 kg / 1.62 m / 28 anos, 4 dias de pesas, 105 min de cardio.
 */
export const REFERENCE_PROFILE: Profile = {
  sex: 'female',
  ageYears: 28,
  heightCm: 162,
  weightKg: 75,
  strengthDaysPerWeek: 4,
  cardioMinPerWeek: 105,
  work: 'sedentario',
  mealsPerDay: 4,
  trainingTime: 'manana',
  budget: 'medio',
};

export const BACKTEST_WEEKS: BacktestWeek[] = (history as { weeks: BacktestWeek[] }).weeks;

function toCheckIn(week: BacktestWeek): CheckIn {
  const checkIn: CheckIn = {
    date: week.week,
    inflammation: week.inflammation as Scale5,
    energy: week.energy as Scale5,
    hunger: week.hunger as Scale5,
    strengthTrend: week.strengthTrend,
    dietCompliancePct: week.compliance,
    symptoms: week.symptoms ?? [],
  };
  if (week.sleep !== undefined) checkIn.sleep = week.sleep as Scale5;
  if (week.waistCm !== undefined) checkIn.waistCm = week.waistCm;
  if (week.weightKg !== undefined) checkIn.weightKg = week.weightKg;
  if (week.photosTrend !== undefined) checkIn.photosTrend = week.photosTrend;
  if (week.newInjury !== undefined) checkIn.newInjury = week.newInjury;
  if (week.activeInjury !== undefined) checkIn.activeInjury = week.activeInjury;
  if (week.daysWithoutTraining !== undefined) checkIn.daysWithoutTraining = week.daysWithoutTraining;
  if (week.contextChange !== undefined) checkIn.contextChange = week.contextChange;
  if (week.aggressiveRequest !== undefined) checkIn.aggressiveRequest = week.aggressiveRequest;
  return checkIn;
}

/** MENU_REFRESH cuenta como HOLD de fase (metrica del plan). */
export function normalizeCategory(category: DecisionCategory): DecisionCategory {
  return category === 'MENU_REFRESH' ? 'HOLD' : category;
}

/**
 * Corre `decide` semana a semana acumulando historial y compara la categoria
 * con la decision real del coach.
 */
export function runBacktest(
  weeks: BacktestWeek[] = BACKTEST_WEEKS,
  profile: Profile = REFERENCE_PROFILE,
  config: EngineConfig = DEFAULT_CONFIG,
): BacktestReport {
  const rows: BacktestRow[] = [];
  const decisions: Decision[] = [];
  const historyAcc: CheckIn[] = [];

  for (const week of weeks) {
    historyAcc.push(toCheckIn(week));
    const decision = decide(historyAcc, profile, config);
    decisions.push(decision);
    rows.push({
      week: week.week,
      expected: week.expected,
      got: decision.category,
      match: normalizeCategory(week.expected) === normalizeCategory(decision.category),
      phase: decision.phase,
      kcal: decision.targets.kcal,
      rules: decision.rulesFired.map((r) => r.id),
    });
  }

  const matches = rows.filter((r) => r.match).length;
  return {
    rows,
    matches,
    total: rows.length,
    accuracy: rows.length === 0 ? 0 : matches / rows.length,
    decisions,
  };
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

export function formatReport(report: BacktestReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Backtest del motor de dietas — 19 semanas de historial real (senales abstractas)');
  lines.push('');
  lines.push(
    `${pad('semana', 12)}${pad('esperado', 16)}${pad('motor', 16)}${pad('ok', 4)}${pad('fase', 16)}${pad('kcal', 7)}reglas`,
  );
  lines.push('-'.repeat(96));
  for (const row of report.rows) {
    lines.push(
      pad(row.week, 12) +
        pad(row.expected, 16) +
        pad(row.got, 16) +
        pad(row.match ? 'OK' : 'X', 4) +
        pad(row.phase, 16) +
        pad(String(row.kcal), 7) +
        row.rules.join(','),
    );
  }
  lines.push('-'.repeat(96));
  const pct = (report.accuracy * 100).toFixed(1);
  lines.push(`Coincidencia: ${report.matches}/${report.total} = ${pct}%  (meta >= 80%)`);
  const misses = report.rows.filter((r) => !r.match);
  if (misses.length > 0) {
    lines.push('');
    lines.push('Divergencias:');
    for (const m of misses) {
      lines.push(`  ${m.week}: esperado ${m.expected}, motor ${m.got} (reglas: ${m.rules.join(',')})`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

const isMain =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /backtest\.(ts|js)$/.test(process.argv[1]);

if (isMain) {
  const report = runBacktest();
  process.stdout.write(formatReport(report));
  if (report.accuracy < 0.8) process.exitCode = 1;
}
