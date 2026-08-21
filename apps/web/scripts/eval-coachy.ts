/**
 * `pnpm -F web eval:coachy`
 *
 * Corre el pipeline de Coachy (motor + preguntas + redacción, SIN visión) sobre
 * las 19 semanas del historial real que ya usa el backtest del motor, con un
 * perfil sintético. Guarda una salida por semana en `apps/web/eval/` para que un
 * humano las lea con la rúbrica de `eval/README.md`.
 *
 * No toca la base ni Supabase: es un guion puro contra el motor y la API.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { decide, type CheckIn, type Profile } from "engine";

import { hasAnthropicKey } from "@/lib/coachy/anthropic";
import { composeReply, replyToText } from "@/lib/coachy/compose";
import { loadFewShotFromFile } from "@/lib/coachy/fewshot";
import { pickQuestions } from "@/lib/coachy/questions";
import type { ComposeInput, CoachyReply, WeekSignals } from "@/lib/coachy/types";

const OUT_DIR = path.resolve(process.cwd(), "eval");
const HISTORY_FILE = path.resolve(
  process.cwd(),
  "..",
  "..",
  "packages",
  "engine",
  "data",
  "coach-history.json",
);

/**
 * Perfil sintético. El fixture del motor solo trae señales abstractas y este
 * perfil no describe a nadie: son los mismos números que usa el backtest para
 * que las kcal salgan en el rango real.
 */
const SYNTHETIC_PROFILE: Profile = {
  sex: "female",
  ageYears: 28,
  heightCm: 162,
  weightKg: 75,
  strengthDaysPerWeek: 4,
  cardioMinPerWeek: 105,
  work: "sedentario",
  mealsPerDay: 4,
  trainingTime: "manana",
  budget: "medio",
};

/** Una semana del fixture. Mismo shape que usa el backtest del motor. */
interface HistoryWeek {
  week: string;
  waistCm?: number;
  weightKg?: number;
  photosTrend?: CheckIn["photosTrend"];
  inflammation: number;
  energy: number;
  hunger: number;
  sleep?: number;
  strengthTrend: CheckIn["strengthTrend"];
  compliance: number;
  symptoms?: string[];
  newInjury?: boolean;
  activeInjury?: boolean;
  daysWithoutTraining?: number;
  contextChange?: boolean;
  aggressiveRequest?: boolean;
  expected: string;
}

function loadHistory(): HistoryWeek[] {
  const raw = JSON.parse(readFileSync(HISTORY_FILE, "utf8")) as { weeks?: HistoryWeek[] };
  return raw.weeks ?? [];
}

function fail(message: string): never {
  process.stderr.write(`\n✖ ${message}\n\n`);
  process.exit(1);
}

function toCheckIn(week: HistoryWeek): CheckIn {
  const checkIn: CheckIn = {
    date: week.week,
    inflammation: week.inflammation as CheckIn["inflammation"],
    energy: week.energy as CheckIn["energy"],
    hunger: week.hunger as CheckIn["hunger"],
    strengthTrend: week.strengthTrend,
    dietCompliancePct: week.compliance,
    symptoms: week.symptoms ?? [],
  };
  if (week.sleep !== undefined) checkIn.sleep = week.sleep as CheckIn["sleep"];
  if (week.waistCm !== undefined) checkIn.waistCm = week.waistCm;
  if (week.weightKg !== undefined) checkIn.weightKg = week.weightKg;
  if (week.newInjury !== undefined) checkIn.newInjury = week.newInjury;
  if (week.activeInjury !== undefined) checkIn.activeInjury = week.activeInjury;
  if (week.daysWithoutTraining !== undefined) {
    checkIn.daysWithoutTraining = week.daysWithoutTraining;
  }
  if (week.contextChange !== undefined) checkIn.contextChange = week.contextChange;
  if (week.aggressiveRequest !== undefined) checkIn.aggressiveRequest = week.aggressiveRequest;
  // `photosTrend` sí entra: es una señal que el coach real observó esa semana y
  // está en el fixture. Lo que queda fuera es la *llamada* de visión — sin fotos
  // no hay nada que analizar, y sin esta señal el motor decidiría otra cosa y la
  // evaluación mediría el tono sobre decisiones que nunca ocurrieron.
  if (week.photosTrend !== undefined) checkIn.photosTrend = week.photosTrend;
  return checkIn;
}

function signalsFor(
  checkIn: CheckIn,
  previous: CheckIn | null,
  first: CheckIn | null,
  decision: ReturnType<typeof decide>,
): WeekSignals {
  const round1 = (value: number): number => Math.round(value * 10) / 10;
  const waist = checkIn.waistCm ?? null;
  const previousWaist = previous?.waistCm ?? null;
  const firstWaist = first?.waistCm ?? null;
  const weight = checkIn.weightKg ?? null;
  const previousWeight = previous?.weightKg ?? null;

  return {
    fecha: checkIn.date,
    cinturaCm: waist,
    cinturaDeltaCm: waist !== null && previousWaist !== null ? round1(waist - previousWaist) : null,
    cinturaDeltaDesdeInicioCm:
      waist !== null && firstWaist !== null ? round1(waist - firstWaist) : null,
    pesoKg: weight,
    pesoDeltaKg: weight !== null && previousWeight !== null ? round1(weight - previousWeight) : null,
    inflamacion: checkIn.inflammation,
    energia: checkIn.energy,
    hambre: checkIn.hunger,
    saciedad: checkIn.satiety ?? 3,
    sueno: checkIn.sleep ?? 3,
    fuerzaRpe: checkIn.strengthRpe ?? null,
    fuerzaTendencia: checkIn.strengthTrend,
    cumplimientoDieta: checkIn.dietCompliancePct,
    cumplimientoEntreno: checkIn.trainingCompliancePct ?? checkIn.dietCompliancePct,
    sintomas: checkIn.symptoms ?? [],
    faseCiclo: checkIn.cyclePhase ?? null,
    comentario: null,
    semanasEnFase: decision.weeksInPhase,
    semanasSinProgreso: decision.stallWeeks,
  };
}

/** Nombre sintético: el repo es público y la evaluación no usa datos de nadie. */
const ATHLETE_NAME = "Atleta";

async function main(): Promise<void> {
  // Una llave exportada en la shell gana sobre los archivos: si no, el ejemplo
  // `ANTHROPIC_API_KEY=... pnpm eval:coachy` quedaría pisado por .env.local.
  const shellKey = process.env.ANTHROPIC_API_KEY;
  loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true, quiet: true });
  if (shellKey !== undefined) process.env.ANTHROPIC_API_KEY = shellKey;

  if (!hasAnthropicKey()) {
    fail(
      "No hay ANTHROPIC_API_KEY válida.\n" +
        "  Ponla en apps/web/.env.local o expórtala en la shell y vuelve a correr:\n" +
        "    ANTHROPIC_API_KEY=sk-ant-... pnpm -F web eval:coachy",
    );
  }

  const examples = loadFewShotFromFile();
  if (examples.length === 0) {
    process.stderr.write(
      "! Sin few-shot: no existe apps/web/data/private/coach-fewshot.json.\n" +
        "  La evaluación corre igual, pero el tono no será representativo.\n\n",
    );
  }

  const weeks = loadHistory();
  if (weeks.length === 0) fail(`No hay semanas en ${HISTORY_FILE}.`);

  mkdirSync(OUT_DIR, { recursive: true });

  const history: CheckIn[] = [];
  const summary: Array<{ semana: string; categoria: string; fase: string; kcal: number }> = [];
  let askedLastWeek: string[] = [];

  for (const week of weeks) {
    history.push(toCheckIn(week));
    const current = history[history.length - 1] as CheckIn;
    const previous = history.length > 1 ? (history[history.length - 2] as CheckIn) : null;
    const first = history[0] as CheckIn;

    const decision = decide(history, SYNTHETIC_PROFILE);
    const signals = signalsFor(current, previous, first, decision);

    const waistDown = (signals.cinturaDeltaCm ?? 0) <= -0.5;
    const weightFlat = signals.pesoDeltaKg !== null && Math.abs(signals.pesoDeltaKg) < 0.3;

    const questions = pickQuestions(
      {
        signals,
        category: decision.category,
        inconclusiveWeek: decision.inconclusiveWeek,
        recomposition: waistDown && weightFlat,
        photosDisagreeWithFeeling: false,
      },
      askedLastWeek,
    );
    askedLastWeek = questions.map((question) => question.id);

    const input: ComposeInput = {
      athleteName: ATHLETE_NAME,
      weekLabel: week.week,
      phase: decision.phase,
      previousPhase: decision.previousPhase,
      targets: decision.targets,
      category: decision.category,
      rules: decision.rulesFired.map((rule) => ({
        id: rule.id,
        nombre: rule.nombre,
        explicacion: rule.explicacion,
      })),
      engineExplanation: decision.explicacion,
      signals,
      vision: null,
      questions,
      menuRefresh: decision.menuRefresh,
      electrolyteProtocol: decision.electrolyteProtocol,
      injuryTrainingProtocol: decision.injuryTrainingProtocol,
      simplifyMenu: decision.simplifyMenu,
    };

    let reply: CoachyReply;
    try {
      reply = await composeReply(input, { examples });
    } catch (error) {
      process.stderr.write(`✖ ${week.week}: ${String(error)}\n`);
      continue;
    }

    writeFileSync(
      path.join(OUT_DIR, `${week.week}.md`),
      [
        `# Semana ${week.week}`,
        "",
        `- Decisión real del coach: **${week.expected}**`,
        `- Decisión del motor: **${decision.category}** · ${decision.phase} · ${decision.targets.kcal} kcal`,
        `- Reglas: ${decision.rulesFired.map((rule) => rule.id).join(", ") || "—"}`,
        `- Preguntas elegidas: ${questions.map((question) => question.id).join(", ") || "—"}`,
        "",
        "## Respuesta de Coachy",
        "",
        replyToText(reply),
        "",
        "## Campos",
        "",
        "```json",
        JSON.stringify(reply, null, 2),
        "```",
        "",
        "## Rúbrica (marca lo que cumple)",
        "",
        "- [ ] Celebra algo concreto y verificable",
        "- [ ] Pregunta (1-3, pertinentes)",
        "- [ ] Compara contra la semana anterior",
        "- [ ] Decide y cita los números del motor sin inventarlos",
        "- [ ] Deja una meta corta y medible",
        "- [ ] Tono del coach (hype corto, sin regaño, sin lenguaje clínico)",
        "",
      ].join("\n"),
      "utf8",
    );

    summary.push({
      semana: week.week,
      categoria: decision.category,
      fase: decision.phase,
      kcal: decision.targets.kcal,
    });

    process.stdout.write(`✔ ${week.week} · ${decision.category} · ${decision.targets.kcal} kcal\n`);
  }

  writeFileSync(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify({ generadoEn: new Date().toISOString(), semanas: summary }, null, 2),
    "utf8",
  );

  process.stdout.write(`\n${summary.length} semanas escritas en apps/web/eval/\n`);
}

main().catch((error: unknown) => fail(String(error)));
