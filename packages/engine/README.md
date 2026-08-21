# `engine` — motor determinista de dietas de Coachy

Decide **los números**: fase, kcal, macros, reparto por comida y menú. No redacta consejos ni
interpreta estudios; eso vive fuera del paquete. Todo es función pura: sin IO, sin DB, sin Next.

- Fuente de verdad: `coach-virtual/docs/02-motor-dietas-spec.md` (spec) y
  `coach-virtual/03-metodologia-coach.md` (reglas observadas).
- Unidades: kg, cm, gramos enteros, kcal, fechas ISO `YYYY-MM-DD`.
- Idioma: código en inglés, textos de salida (`explicacion`) en español neutro.

```bash
pnpm -F engine test        # suite completa (vitest)
pnpm -F engine backtest    # backtest contra el historial real
pnpm -F engine typecheck
```

## API pública

| Export | Qué hace |
|---|---|
| `decide(history, profile, config?, options?)` | Decisión de la última semana del historial. Reproduce el estado desde el inicio. |
| `decideAll(history, profile, config?, options?)` | Todas las decisiones, semana a semana. |
| `macrosFor(phase, profile, kcal, config?, options?)` | Proteína / grasa / carbos / fibra de la fase. |
| `distribute(macros, profile, phase?, config?)` | Reparto por comida (3–5 comidas, entreno mañana o tarde). |
| `generateMenu(slots, profile, config?, seed?, options?, pool?)` | 2 menús + equivalencias + lista de súper. |
| `loadConfig(overrides?)` | Config efectiva validada con zod. Lanza `ZodError` si algo sale de rango. |
| `nextPhase(current, signals, weeksInPhase, config?)` | Máquina de fases (spec §3). |
| `bmrMifflin` · `pal` · `tdee` · `leanMass` · `energyBase` · `kcalFloor` · `kcalForDeficit` · `deficitForKcal` | Cálculo base. |
| `runBacktest(weeks?, profile?, config?)` | Backtest programático. |
| `FOODS` · `findFood` · `foodsByRole` | Catálogo de alimentos (`data/foods.json`, 105 ítems). |

Tipos exportados: `Profile`, `CheckIn`, `Phase`, `Decision`, `DecisionCategory`, `MacroTargets`,
`MealSlot`, `RuleHit`, `Food`, `Menu`, `MenuPlan`, `EngineConfig`.

## Ejemplo

```ts
import { decide, distribute, generateMenu, loadConfig, type CheckIn, type Profile } from 'engine';

const config = loadConfig({ kcalAdjustStep: 125 });

const profile: Profile = {
  sex: 'female', ageYears: 28, heightCm: 162, weightKg: 75,
  strengthDaysPerWeek: 4, cardioMinPerWeek: 105, work: 'sedentario',
  mealsPerDay: 4, trainingTime: 'manana', budget: 'medio',
  favoriteFoods: ['pollo', 'camote'], excludedFoods: ['salmon'],
  conditions: { glucosaAlta: true },
};

const history: CheckIn[] = [
  { date: '2026-08-09', waistCm: 92, strengthTrend: 'igual', inflammation: 3, energy: 4, hunger: 3, dietCompliancePct: 90 },
  { date: '2026-08-16', waistCm: 92, strengthTrend: 'igual', inflammation: 4, energy: 4, hunger: 3, dietCompliancePct: 90 },
];

const decision = decide(history, profile, config);
// decision.category  -> 'TIGHTEN'
// decision.targets   -> { kcal, proteinG, fatG, carbG, fiberG }
// decision.rulesFired-> [{ id: 'R11', nombre: 'ESTANCAMIENTO_PROFUNDIZAR', explicacion: '...' }]

const plan = generateMenu(decision.meals, profile, config, decision.menuSeed, { phase: decision.phase });
// plan.menus[0].meals[0].items        -> [{ name: 'Avena en hojuelas', grams: 60, ... }]
// plan.menus[0].meals[0].equivalences -> sustitutos del mismo rol con sus gramos
// plan.shoppingList                    -> lista de súper agregada de la semana
```

`decide` también acepta `options` para arrancar desde un estado conocido y no replicar todo el
historial: `{ initialPhase, initialKcal, initialPhaseStartDate }`.

## Reglas de ajuste (se evalúan en este orden; la primera con acción manda)

| Id | Nombre | Dispara cuando | Resultado |
|---|---|---|---|
| `R0` | `CAMBIO_DE_CONTEXTO` | el atleta declara menos tiempo, menos comidas o cambio de entreno | `CONTEXT_CHANGE`: mismos macros, plan reestructurado |
| `R1` | `DATOS_NO_CONCLUYENTES` | fase lútea o menstruación sin caída de cintura | `HOLD`; la semana no cuenta para estancamiento |
| `R2` | `SEGURIDAD_ELECTROLITOS` | mareo o calambres en `CUT`/`CUT_AGRESIVO` | protocolo de electrolitos; si persiste 2 semanas → `REFEED` |
| `R3` | `SEGURIDAD_LESION_O_ENFERMEDAD` | lesión nueva o enfermedad | `HOLD` de dieta + protocolo de entreno |
| `R4` | `SEGURIDAD_SIN_ENTRENO` | ≥ `daysWithoutTrainingForMaintenance` días sin entrenar | `MANTENIMIENTO` |
| `R5` | `SEGURIDAD_ADAPTACION` | fuerza a la baja N semanas seguidas + hambre alta | `REFEED` |
| `R6` | `SEGURIDAD_RITMO_RAPIDO` | pérdida > 1 %/semana durante 2 semanas | sube kcal |
| `R7` | `ADHERENCIA` | cumplimiento < 70 % | `HOLD` + simplificar menú |
| `R8` | `PROGRESO` | cintura ≤ −0.5 cm/sem, fotos mejoran o peso ≤ −0.5 %/sem | `HOLD` |
| `R9` | `RECOMPOSICION` | cintura baja y peso plano | `HOLD`, la cinta manda |
| `R10` | `ESTANCAMIENTO_REFEED` | sin progreso + ≥2 señales de adaptación | `REFEED` |
| `R11` | `ESTANCAMIENTO_PROFUNDIZAR` | sin progreso, sin síntomas, energía y fuerza ok | `TIGHTEN` (−kcal en carbos) o siguiente fase si el escalón sale de la banda |
| `R12` | `TOPE_DE_FASE` | semanas en fase ≥ tope | transición de la máquina de fases |
| `R13` | `REFRESCO_DE_MENU` | ≥2 semanas con el mismo menú y decisión `HOLD` | `MENU_REFRESH`: mismos macros, alimentos distintos |
| `R14` | `SIN_SENALES_DE_CAMBIO` | ninguna regla pide cambio | `HOLD` |

`R11` dispara también con inflamación ≥ 4 y sin progreso, no solo con estancamiento medido
(`03-metodologia-coach.md` §2: "estancamiento **o** inflamación → cambio de fase").

## Invariantes que el motor nunca rompe

- kcal ≥ `0.85 × BMR`.
- Proteína ≥ 1.6 g/kg de peso, pase lo que pase con la config.
- Grasa ≥ el piso hormonal (0.5 g/kg por defecto).
- Al profundizar solo bajan los carbohidratos: proteína y grasa no se tocan.
- Un déficit fuera del rango configurado de la fase es **error**, no warning
  (`macrosFor(..., { validateDeficit: true })` y `assertDeficitInRange`).

## Configuración

`loadConfig(overrides)` hace merge profundo sobre `DEFAULT_CONFIG` y valida con zod
(`ConfigSchema`, `strict`: una clave desconocida es error). Los defaults están calibrados contra
el historial real; las desviaciones respecto al texto literal del spec están documentadas en
[`BACKTEST.md`](./BACKTEST.md).

## Datos

- `data/foods.json` — 105 alimentos con macros/100 g, fibra, IG, costo relativo (1–3), minutos de
  preparación, rol y tags. Valores de tablas públicas (USDA / SMAE). Incluye todos los alimentos
  que aparecen en los planes recuperados del coach.
- `data/coach-history.json` — fixtures del backtest. **Solo señales categóricas y numéricas
  abstractas**: sin nombres, sin texto de mensajes, sin nada identificable.
