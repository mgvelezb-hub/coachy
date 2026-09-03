/**
 * `pnpm -F web tsx scripts/paquete-validacion.ts` (o `npx tsx scripts/paquete-validacion.ts`
 * desde `apps/web/`).
 *
 * Genera el paquete de validación con expertos (Fase 5): un documento por
 * perfil anonimizado que una nutrióloga o un coach revisa en ~20 minutos,
 * con un cuestionario cerrado cuyas respuestas se convierten en golden
 * tests. Solo usa las funciones puras del motor (`packages/engine`) y de
 * `apps/web/src/lib/training`: no toca la base de datos ni Supabase, así que
 * corre igual con Postgres apagado.
 *
 * Los perfiles reales de los atletas NUNCA van al repo (ver
 * `validacion/README.md` y el `.gitignore`); este script solo produce los
 * documentos localmente.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_CONFIG,
  distribute,
  generateMenu,
  kcalForDeficit,
  macrosFor,
  pickDeficit,
  type MacroTargets,
  type MenuMeal,
  type Phase,
  type Profile,
} from "engine";

import { mondayOf, generateWeek } from "@/lib/training/generate";
import type {
  ExerciseOption,
  GeneratedWeek,
  HistoryWorkout,
  PlannedExercise,
  PlannedWorkout,
  TrainingProfile,
} from "@/lib/training/types";

const OUT_DIR = path.resolve(process.cwd(), "..", "..", "validacion");
const CATALOG_FILE = path.resolve(process.cwd(), "prisma", "exercises.json");

// ---------------------------------------------------------------------------
// Catálogo de ejercicios: el mismo JSON que usa el seed y los tests del
// generador (`apps/web/src/test/training-generate.test.ts`), sin tocar la DB.
// ---------------------------------------------------------------------------
const CATALOG: ExerciseOption[] = (
  JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as Array<
    Omit<ExerciseOption, "id" | "videoUrl">
  >
).map((row, i) => ({ ...row, id: `ex-${i}-${row.name}`, videoUrl: null }));

// ---------------------------------------------------------------------------
// Perfiles anonimizados
// ---------------------------------------------------------------------------

interface Perfil {
  clave: "A" | "B" | "C";
  ficha: string[];
  phase: Phase;
  profile: Profile;
  training: TrainingProfile;
  fuente: string;
}

/**
 * Perfil A — Mau: 120 kg, 1.82 m, cinco días de pesas, quiere bajar grasa.
 * Mismos números que el caso "Mau" del golden del motor
 * (`packages/engine/test/golden/menus.test.ts`), para que las dos
 * validaciones —la del experto y la del golden— hablen del mismo perfil.
 */
const PERFIL_A: Perfil = {
  clave: "A",
  ficha: [
    "Hombre, 38 años, 182 cm, 120 kg.",
    "Entrena pesas 5 días por semana, en la mañana.",
    "Trabajo sedentario, 90 min de cardio a la semana.",
    "4 comidas al día. Presupuesto medio. Favoritos: pechuga de pollo, arroz, aguacate.",
    "Objetivo: bajar grasa (fase de corte).",
  ],
  phase: "CUT",
  profile: {
    sex: "male",
    ageYears: 38,
    heightCm: 182,
    weightKg: 120,
    strengthDaysPerWeek: 5,
    cardioMinPerWeek: 90,
    work: "sedentario",
    mealsPerDay: 4,
    trainingTime: "manana",
    budget: "medio",
    favoriteFoods: ["pechuga de pollo", "arroz", "aguacate"],
  },
  training: {
    liftingDays: 5,
    trainingSchedule: null,
    conditions: [],
    volumeBias: "normal",
    sessionMinutes: 60,
    cardioMinWk: 90,
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: {},
    gymLevel: "AVANZADO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    compactDays: false,
    schemePreference: "RECOMENDADO",
  },
  fuente: "golden del motor (caso 'Mau, 120 kg, 5 días de pesas, bajando grasa').",
};

/**
 * Perfil B — Irma: no hay perfil de entrenamiento en seeds/onboarding para
 * ella, así que la NUTRICIÓN sale del caso real "Irma" del golden del motor
 * (62 kg, 1.60 m, 34 años, 4 días de pesas, activo) — son datos reales
 * usados hoy por el motor, y se prefieren sobre el respaldo del brief
 * (1.65 m, 6 días). La RUTINA sí usa el respaldo del brief porque no hay
 * dato real: 3 días inferior / 3 superior + natación y squash en modo
 * DESPUES (después de pesas, sin quitarle día al presupuesto de pesas).
 * Esta mezcla de fuentes queda anotada en la ficha para que quien valide
 * sepa qué es dato real y qué es supuesto de trabajo.
 */
const PERFIL_B: Perfil = {
  clave: "B",
  ficha: [
    "Mujer, 34 años, 160 cm, 62 kg.",
    "Nutrición: 4 días de pesas, trabajo activo, 4 comidas al día, cocina rápido (≤20 min).",
    "Rutina: 3 días de pierna, 3 de torso, más natación y squash después de pesas (dato SUPUESTO, sin ficha real).",
    "Presupuesto medio.",
    "Objetivo: mantener base (fase BASE).",
  ],
  phase: "BASE",
  profile: {
    sex: "female",
    ageYears: 34,
    heightCm: 160,
    weightKg: 62,
    strengthDaysPerWeek: 4,
    cardioMinPerWeek: 120,
    work: "activo",
    mealsPerDay: 4,
    trainingTime: "manana",
    budget: "medio",
    maxPrepMin: 20,
  },
  training: {
    liftingDays: 6,
    trainingSchedule: null,
    conditions: [],
    volumeBias: "normal",
    sessionMinutes: 60,
    cardioMinWk: 120,
    avoidRepeatGroups: [],
    exerciseSwaps: {},
    primaryDiscipline: "PESAS",
    otherDisciplines: [
      { discipline: "NATACION", sessionsPerWeek: 2, proposito: "COMPLEMENTO", modo: "DESPUES" },
      { discipline: "SQUASH", sessionsPerWeek: 1, proposito: "COMPLEMENTO", modo: "DESPUES" },
    ],
    disciplineLevels: { NATACION: "INTERMEDIO", SQUASH: "PRINCIPIANTE" },
    gymLevel: "INTERMEDIO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    compactDays: true,
    schemePreference: "RECOMENDADO",
    // `presetSplit("INFERIOR_SUPERIOR_3_3", 6)` materializado: L/Mi/V pierna,
    // Ma/J/S torso. Se deja como split propio (no como preset en vivo) para
    // que el documento y la corrida del generador sean el mismo split.
    customSplit: {
      LUN: "PIERNA_CUADRICEPS",
      MAR: "PECHO_TRICEP",
      MIE: "PIERNA_GLUTEO",
      JUE: "ESPALDA_BICEP",
      VIE: "PIERNA_FEMORAL",
      SAB: "HOMBRO_BRAZO",
      DOM: "DESCANSO",
    },
  },
  fuente:
    "nutrición: golden del motor (caso 'Irma, 62 kg, 4 días de pesas'). rutina: respaldo del brief F5 (sin ficha real).",
};

/**
 * Perfil C — principiante: 3 días, primera vez en un gimnasio. Se adapta del
 * caso "principiante sin gimnasio" del golden del motor (mismo cuerpo y
 * contexto), subiendo `strengthDaysPerWeek` de 0 a 3 porque el brief pide un
 * principiante que SÍ entrena 3 días, no un sedentario total.
 */
const PERFIL_C: Perfil = {
  clave: "C",
  ficha: [
    "Hombre, 45 años, 175 cm, 95 kg.",
    "Primera vez entrenando pesas: 3 días por semana, nivel principiante.",
    "Trabajo sedentario, 60 min de cardio a la semana.",
    "3 comidas al día. Presupuesto bajo.",
    "Objetivo: reintroducción a la actividad (fase REINTRO).",
  ],
  phase: "REINTRO",
  profile: {
    sex: "male",
    ageYears: 45,
    heightCm: 175,
    weightKg: 95,
    strengthDaysPerWeek: 3,
    cardioMinPerWeek: 60,
    work: "sedentario",
    mealsPerDay: 3,
    trainingTime: "manana",
    budget: "bajo",
  },
  training: {
    liftingDays: 3,
    trainingSchedule: null,
    conditions: [],
    volumeBias: "reducido",
    sessionMinutes: 45,
    cardioMinWk: 60,
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: {},
    gymLevel: "PRINCIPIANTE",
    goal: "SALUD",
    timePerDay: null,
    compactDays: false,
    schemePreference: "RECOMENDADO",
  },
  fuente: "adaptado del golden del motor (caso 'principiante sin gimnasio'), con strengthDaysPerWeek 0 → 3.",
};

const PERFILES: Perfil[] = [PERFIL_A, PERFIL_B, PERFIL_C];

// ---------------------------------------------------------------------------
// Nutrición
// ---------------------------------------------------------------------------

function fase(phase: Phase): string {
  const nombres: Record<Phase, string> = {
    REINTRO: "reintroducción (retomar el ritmo tras una pausa, déficit suave)",
    BASE: "base (déficit moderado, sostenible)",
    CUT: "corte (déficit más marcado para bajar grasa)",
    CUT_AGRESIVO: "corte agresivo (déficit fuerte, con protocolo de electrolitos)",
    REFEED: "recarga (un respiro de carbohidrato dentro del plan)",
    ESTABILIZACION: "estabilización (sostener el peso tras un corte)",
    MANTENIMIENTO: "mantenimiento (sin déficit, sostener lo logrado)",
  };
  return nombres[phase];
}

function presupuesto(budget: Profile["budget"]): string {
  const nombres: Record<Profile["budget"], string> = {
    bajo: "bajo: el generador solo usa alimentos del escalón más barato del catálogo.",
    medio: "medio: se abre el catálogo a alimentos de precio intermedio o menor.",
    alto: "alto: no se filtra por precio, entra cualquier alimento del catálogo.",
  };
  return nombres[budget];
}

function porQueDeMacros(perfil: Perfil, macros: MacroTargets, kcalTarget: number): string {
  return [
    `Fase **${perfil.phase}** — ${fase(perfil.phase)}.`,
    `Presupuesto de despensa **${perfil.profile.budget}** — ${presupuesto(perfil.profile.budget)}`,
    `Proteína: ${macros.proteinG} g — el motor la calcula sobre masa libre de grasa estimada` +
      ` (2.3 g/kg), con un piso y un techo de seguridad en g/kg de peso total.`,
    `Grasa: ${macros.fatG} g — el mayor entre un mínimo de g/kg de peso y un mínimo % de las kcal totales.`,
    `Carbohidrato: ${macros.carbG} g — lo que queda de las kcal totales tras proteína y grasa.`,
    `Fibra: ${macros.fiberG} g — mínimo configurado (más alto si hay glucosa alta declarada).`,
    `Total: **${Math.round(kcalTarget)} kcal/día**.`,
  ].join("\n");
}

function reglasDeComposicionEnProsa(): string {
  const c = DEFAULT_CONFIG.composicion;
  return [
    "Estos topes son de **plato**, no de macro: aunque los números cuadren, nadie sirve dos",
    "grasas añadidas en la misma comida ni tres tazas de frijol.",
    "",
    `- Grasa añadida (aceite, mantequilla, crema de cacahuate, semillas sueltas): tope de` +
      ` ${c.grasaAnadidaMaxGPorComida} g por comida, y no más de ${c.maxGrasasAnadidasPorComida} fuente añadida.`,
    `- Fuentes de grasa por comida (contando las enteras: aguacate, nueces): máximo ${c.maxGrasasPorComida}.`,
    `- Leguminosa (frijol, lenteja, garbanzo, haba, edamame): tope de ${c.leguminosaMaxGPorComida} g por comida.`,
    `- Cereal cocido (arroz, pasta, quinoa, avena cocida): tope de ${c.cerealCocidoMaxGPorComida} g por comida.`,
    `- Fruto seco: tope de ${c.frutoSecoMaxGPorComida} g por comida.`,
    `- Carbohidrato denso: máximo ${c.maxCarbosPorComida} fuentes por comida, y nunca dos del mismo` +
      ` subtipo (avena con pan es el mismo desayuno dos veces; frijol con haba es el mismo guiso dos veces).`,
    `- Máximo ${DEFAULT_CONFIG.maxFoodsPerMeal} alimentos por comida principal` +
      ` (${DEFAULT_CONFIG.maxFoodsPerLightMeal} en colación/peri-entreno), sin contar el vegetal libre:` +
      ` un platillo con siete ingredientes no se cocina entre semana.`,
    `- Toda comida principal trae al menos ${DEFAULT_CONFIG.mealProteinMinG} g de proteína` +
      ` (${DEFAULT_CONFIG.snackProteinMinG} g en colación): sin eso no es una comida, es una guarnición.`,
    "- Hay pares de alimentos que el motor evita servir juntos (incompatibles) y pares que" +
      " prefiere juntar (afines) — configurados en el catálogo, no aquí.",
  ].join("\n");
}

function metrosMenu(meal: MenuMeal): string {
  const lineas = meal.items.map(
    (item) =>
      `  - ${item.display} — ${Math.round(item.kcal)} kcal (P${Math.round(item.proteinG)}` +
      ` C${Math.round(item.carbG)} G${Math.round(item.fatG)}), cierra **${item.why.closes}**.`,
  );
  return [
    `- **${meal.label}** (${meal.timeHint}) — total ${Math.round(meal.totals.kcal)} kcal` +
      ` (P${meal.totals.proteinG} C${meal.totals.carbG} G${meal.totals.fatG}):`,
    ...lineas,
  ].join("\n");
}

function seccionNutricion(perfil: Perfil): string {
  const kcalTarget = kcalForDeficit(
    perfil.profile,
    pickDeficit(perfil.phase, DEFAULT_CONFIG),
    DEFAULT_CONFIG,
  );
  const macros = macrosFor(perfil.phase, perfil.profile, kcalTarget, DEFAULT_CONFIG);
  const slots = distribute(macros, perfil.profile, perfil.phase);

  const dias = [1, 2, 3].map((dia) => {
    const plan = generateMenu(slots, perfil.profile, DEFAULT_CONFIG, 100 + dia, {
      phase: perfil.phase,
    });
    const menu = plan.menus[0];
    return [`### Día ${dia}`, "", ...menu.meals.map(metrosMenu)].join("\n");
  });

  return [
    "## Nutrición",
    "",
    "### Macros diarios y por qué",
    "",
    porQueDeMacros(perfil, macros, kcalTarget),
    "",
    "### Reglas de composición del platillo",
    "",
    reglasDeComposicionEnProsa(),
    "",
    "### Tres días de menú (medidas caseras)",
    "",
    dias.join("\n\n"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rutina
// ---------------------------------------------------------------------------

function seriesXReps(sets: PlannedExercise["sets"]): string {
  const trabajo = sets.filter((s) => !s.warmup);
  if (trabajo.length === 0) return "solo calentamiento";
  const reps = trabajo.map((s) => s.reps);
  const uniforme = reps.every((r) => r === reps[0]);
  return uniforme ? `${trabajo.length}×${reps[0]}` : `${trabajo.length} series (${reps.join(",")})`;
}

function ejercicioEnProsa(ex: PlannedExercise): string {
  const min = ex.estimatedMin !== undefined ? ` — ~${Math.round(ex.estimatedMin * 10) / 10} min` : "";
  return `  - ${ex.name} (${ex.muscleGroup}): ${seriesXReps(ex.sets)}${min}.`;
}

function sesionEnProsa(w: PlannedWorkout): string {
  const min = w.estimatedMin !== undefined ? ` — ~${Math.round(w.estimatedMin)} min estimados` : "";
  return [
    `- **${w.date}** — ${w.muscleGroup}, esquema **${w.schemeLabel}**${min}:`,
    ...w.exercises.map(ejercicioEnProsa),
  ].join("\n");
}

function otrasSesionesEnProsa(week: GeneratedWeek): string[] {
  if (week.otherSessions.length === 0) return [];
  const lineas = week.otherSessions.map(
    (s) =>
      `  - ${s.date} (${s.weekday}) — ${s.discipline.toLowerCase()}, ${s.minutes} min` +
      (s.sharesDayWithGym ? `, después de pesas (bloque ${s.orden})` : "") +
      (s.note ? `: ${s.note}` : "."),
  );
  return ["", "Otras disciplinas:", ...lineas];
}

function semanaEnProsa(week: GeneratedWeek, numero: number): string {
  if (week.workouts.length === 0) {
    return [`### Semana ${numero} (${week.weekStart})`, "", "Sin sesiones de pesas esta semana."].join(
      "\n",
    );
  }
  return [
    `### Semana ${numero} (${week.weekStart})`,
    "",
    `Esquema de la semana: **${week.scheme}**.`,
    "",
    ...week.workouts.map(sesionEnProsa),
    ...otrasSesionesEnProsa(week),
  ].join("\n");
}

function seccionRutina(perfil: Perfil): string {
  const historia: HistoryWorkout[] = [];
  const lunes1 = mondayOf(new Date());
  const lunes2 = new Date(lunes1);
  lunes2.setDate(lunes2.getDate() + 7);

  const semana1 = generateWeek(perfil.training, historia, { weekStart: lunes1, catalog: CATALOG });
  const semana2 = generateWeek(perfil.training, historia, { weekStart: lunes2, catalog: CATALOG });

  return [
    "## Rutina — dos semanas",
    "",
    `Split: ${perfil.training.liftingDays} días de pesas por semana` +
      (perfil.training.otherDisciplines.length > 0
        ? `, más ${perfil.training.otherDisciplines
            .map((d) => `${d.discipline.toLowerCase()} (${d.sessionsPerWeek}×/sem, modo ${d.modo ?? "DIA_PROPIO"})`)
            .join(" y ")}.`
        : "."),
    "",
    semanaEnProsa(semana1, 1),
    "",
    semanaEnProsa(semana2, 2),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Cuestionario cerrado
// ---------------------------------------------------------------------------

const PREGUNTAS_NUTRICION = [
  "¿Alguna porción que nunca mandarías? ¿Cuál y por qué?",
  "¿Combinación que no va?",
  "¿Orden y horarios de comidas razonables para este perfil?",
  "¿Qué cambiarías del reparto de macros?",
];

const PREGUNTAS_RUTINA = [
  "¿Vecindad de grupos correcta?",
  "¿Volumen por sesión?",
  "¿Progresión razonable en 4 semanas?",
  "¿Algo que un coach real haría distinto?",
];

function pregunta(texto: string): string {
  return [`**${texto}**`, "", "> _(espacio de respuesta)_", "", "- [ ] esto debe ser regla", ""].join(
    "\n",
  );
}

function seccionCuestionario(): string {
  return [
    "## Cuestionario cerrado",
    "",
    "### Nutrición",
    "",
    ...PREGUNTAS_NUTRICION.map(pregunta),
    "### Rutina",
    "",
    ...PREGUNTAS_RUTINA.map(pregunta),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Documento por perfil
// ---------------------------------------------------------------------------

function documentoDe(perfil: Perfil): string {
  return [
    `# Perfil ${perfil.clave} — paquete de validación`,
    "",
    "_Perfil anonimizado. Revisar en ~20 minutos y contestar el cuestionario del final._",
    "",
    "## Ficha del perfil",
    "",
    ...perfil.ficha.map((l) => `- ${l}`),
    "",
    `_Fuente de los datos: ${perfil.fuente}_`,
    "",
    seccionNutricion(perfil),
    "",
    seccionRutina(perfil),
    "",
    seccionCuestionario(),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const nombreArchivo: Record<Perfil["clave"], string> = {
    A: "perfil-a.md",
    B: "perfil-b.md",
    C: "perfil-c.md",
  };

  for (const perfil of PERFILES) {
    const salida = path.join(OUT_DIR, nombreArchivo[perfil.clave]);
    writeFileSync(salida, documentoDe(perfil), "utf8");
    console.log(`[paquete-validacion] escrito ${salida}`);
  }
}

main();
