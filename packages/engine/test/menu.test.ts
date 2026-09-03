import { describe, expect, it } from 'vitest';
import { generateMenu, incompatibles, listaDeSuper, prepMinDelDia } from '../src/menu.js';
import { distribute } from '../src/meals.js';
import { kcalForDeficit, macrosFor } from '../src/calc.js';
import { DEFAULT_CONFIG, pickDeficit } from '../src/config.js';
import { FOODS, findFood } from '../src/foods.js';
import { CALIBRATION_PROFILE, devPct } from './helpers.js';
import type { Food, MealSlot, Phase, Profile } from '../src/types.js';

function planFor(profile: Profile, phase: Phase = 'BASE', seed = 42) {
  const kcal = kcalForDeficit(profile, pickDeficit(phase, DEFAULT_CONFIG), DEFAULT_CONFIG);
  const macros = macrosFor(phase, profile, kcal);
  const slots = distribute(macros, profile, phase);
  return { macros, plan: generateMenu(slots, profile, DEFAULT_CONFIG, seed, { phase }) };
}

const P = CALIBRATION_PROFILE;
const SEEDS = [1, 7, 42, 99, 2026, 31337];

describe('base de alimentos', () => {
  it('tiene al menos 60 alimentos', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(60);
  });

  it('las kcal por 100 g cuadran con los macros', () => {
    for (const food of FOODS) {
      const atwater = food.proteinPer100 * 4 + food.carbPer100 * 4 + food.fatPer100 * 9;
      expect(devPct(food.kcalPer100 || 1, atwater || 1)).toBeLessThanOrEqual(1);
    }
  });

  it('incluye todos los alimentos de las dietas recuperadas', () => {
    const required = [
      'avena', 'fresa', 'frambuesa', 'chia', 'whey_isolate', 'yogur_griego_0',
      'pechuga_pollo', 'quinoa', 'brocoli', 'espinaca', 'aguacate', 'lenteja',
      'pico_de_gallo', 'lechuga_romana', 'nopal', 'pepino', 'manzana', 'almendra',
      'huevo_entero', 'claras_huevo', 'champinon', 'tortilla_maiz', 'frijol_negro',
      'pescado_blanco', 'arroz_integral', 'calabacita', 'esparrago', 'atun_agua',
      'tostada_horneada', 'garbanzo', 'melon', 'papaya', 'cottage', 'platano',
      'camote', 'cereal_arroz_inflado', 'res_magra', 'rabano', 'vinagre_balsamico',
      'tilapia', 'bacalao', 'aceite_oliva', 'mantequilla', 'pan_integral', 'miel',
      'arroz_blanco', 'pechuga_pavo', 'salmon', 'muslo_pollo', 'coliflor',
      'psyllium', 'canela', 'queso_panela', 'nuez', 'pasas', 'creatina', 'limon',
    ];
    const missing = required.filter((id) => findFood(id) === undefined);
    expect(missing).toEqual([]);
  });

  // El techo por ROL de F0 resulto demasiado rigido: capaba el aguacate a 30 g
  // y la papa a 150 g porque compartian tope con el aceite y con el arroz. El
  // techo real es por ALIMENTO y sale de su medida casera: `maxUnits` piezas,
  // tazas o cucharadas de eso. `maxG` se queda como techo absoluto.
  it('todo alimento que se sirve en porciones tiene medida casera coherente', () => {
    const EXENTOS: Food['role'][] = ['vegetal_libre', 'suplemento'];

    const sinMedida = FOODS.filter(
      (f) => !EXENTOS.includes(f.role) && f.serving === undefined,
    ).map((f) => f.id);
    expect(sinMedida).toEqual([]);

    const incoherentes = FOODS.flatMap((f) => {
      const s = f.serving;
      if (!s) return [];
      const problemas: string[] = [];
      if (s.gramsPerUnit <= 0) problemas.push('gramsPerUnit <= 0');
      if (s.unit === 'g' && s.gramsPerUnit !== 1) problemas.push('unit g con gramsPerUnit != 1');
      if (s.minUnits <= 0) problemas.push('minUnits <= 0');
      if (s.minUnits > s.maxUnits) problemas.push('minUnits > maxUnits');
      if (s.step !== undefined && s.step <= 0) problemas.push('step <= 0');
      // El scoop va entero (medio scoop no se mide); la pieza se parte a lo
      // mucho por la mitad, porque media manzana si es una porcion que la
      // gente sirve, pero un tercio de tortilla no.
      if (s.unit === 'scoop' && (s.step ?? 1) !== 1) problemas.push('el scoop va entero');
      if (s.unit === 'pieza' && ![0.5, 1].includes(s.step ?? 1)) {
        problemas.push('la pieza se parte a lo mucho por la mitad');
      }
      if (f.maxG !== undefined && s.maxUnits * s.gramsPerUnit > f.maxG + 1e-6) {
        problemas.push(`maxUnits*gramsPerUnit=${s.maxUnits * s.gramsPerUnit} > maxG=${f.maxG}`);
      }
      return problemas.map((p) => `${f.id}: ${p}`);
    });
    expect(incoherentes).toEqual([]);
  });

  // Porciones minimas dignas: el reclamo original era "un pedacito de aguacate"
  // de 12 g y 25 g de aceite. Estas son las cotas que lo impiden.
  it('las porciones minimas son porciones de verdad', () => {
    const gramosMin = (id: string): number => {
      const f = findFood(id)!;
      return f.serving!.minUnits * f.serving!.gramsPerUnit;
    };
    const gramosMax = (id: string): number => {
      const f = findFood(id)!;
      return f.serving!.maxUnits * f.serving!.gramsPerUnit;
    };

    expect(gramosMin('aguacate')).toBeGreaterThanOrEqual(45);
    expect(gramosMax('aguacate')).toBeGreaterThanOrEqual(100);
    expect(gramosMin('aceite_oliva')).toBeGreaterThanOrEqual(5);
    expect(gramosMin('frijol_negro')).toBeGreaterThanOrEqual(80);
    expect(gramosMin('arroz_blanco')).toBeGreaterThanOrEqual(80);
    expect(gramosMax('arroz_blanco')).toBeGreaterThanOrEqual(200);
    expect(gramosMin('pechuga_pollo')).toBeGreaterThanOrEqual(100);
    expect(gramosMin('almendra')).toBeGreaterThanOrEqual(14);
    expect(gramosMax('papa')).toBeGreaterThanOrEqual(250);
    expect(gramosMax('camote')).toBeGreaterThanOrEqual(250);
    expect(gramosMax('leche_descremada')).toBeGreaterThanOrEqual(300);
  });

  it('todos los ids son unicos', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });
});

describe('generador de menus (spec §6)', () => {
  it('genera 2 menus distintos con la misma semilla-quincena', () => {
    const { plan } = planFor(P);
    expect(plan.menus).toHaveLength(2);
    const ids1 = plan.menus[0].meals.flatMap((m) => m.items.map((i) => i.foodId));
    const ids2 = plan.menus[1].meals.flatMap((m) => m.items.map((i) => i.foodId));
    expect(ids1).not.toEqual(ids2);
  });

  it('es determinista: misma semilla, mismo menu', () => {
    expect(planFor(P, 'BASE', 5).plan).toEqual(planFor(P, 'BASE', 5).plan);
  });

  it('semillas distintas dan menus distintos (refresco quincenal)', () => {
    const a = planFor(P, 'BASE', 5).plan.menus[0].meals.flatMap((m) => m.items.map((i) => i.foodId));
    const b = planFor(P, 'BASE', 6).plan.menus[0].meals.flatMap((m) => m.items.map((i) => i.foodId));
    expect(a).not.toEqual(b);
  });

  it('los macros del menu caen dentro de +-5% del target', () => {
    for (const seed of SEEDS) {
      for (const phase of ['BASE', 'CUT', 'CUT_AGRESIVO', 'REINTRO'] as Phase[]) {
        const { plan } = planFor(P, phase, seed);
        for (const menu of plan.menus) {
          expect(Math.abs(menu.deviationPct.proteinG), `proteina seed ${seed} ${phase}`).toBeLessThanOrEqual(5);
          expect(Math.abs(menu.deviationPct.carbG), `carbo seed ${seed} ${phase}`).toBeLessThanOrEqual(5);
          expect(Math.abs(menu.deviationPct.fatG), `grasa seed ${seed} ${phase}`).toBeLessThanOrEqual(5);
          expect(Math.abs(menu.deviationPct.kcal), `kcal seed ${seed} ${phase}`).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('nunca incluye alimentos excluidos ni alergenos', () => {
    const profile: Profile = {
      ...P,
      excludedFoods: ['atun', 'brocoli', 'avena'],
      allergies: ['almendra', 'nuez'],
    };
    for (const seed of SEEDS) {
      const { plan } = planFor(profile, 'BASE', seed);
      const ids = plan.menus.flatMap((m) => m.meals.flatMap((meal) => meal.items.map((i) => i.foodId)));
      const equiv = plan.menus.flatMap((m) =>
        m.meals.flatMap((meal) => meal.equivalences.flatMap((e) => e.options.map((o) => o.foodId))),
      );
      for (const banned of ['atun_agua', 'atun_aceite', 'brocoli', 'avena', 'almendra', 'nuez']) {
        expect(ids, `menu seed ${seed}`).not.toContain(banned);
        expect(equiv, `equivalencias seed ${seed}`).not.toContain(banned);
      }
    }
  });

  it('con glucosa alta los carbos densos son de IG <= 55', () => {
    const profile: Profile = { ...P, conditions: { glucosaAlta: true } };
    for (const seed of SEEDS) {
      const { plan } = planFor(profile, 'BASE', seed);
      for (const menu of plan.menus) {
        for (const meal of menu.meals) {
          for (const item of meal.items) {
            const food = findFood(item.foodId)!;
            if (['carbo_pre', 'carbo_post', 'carbo_complejo'].includes(food.role) && food.gi !== null) {
              expect(food.gi, `${food.name} seed ${seed}`).toBeLessThanOrEqual(55);
            }
          }
        }
      }
    }
  });

  it('la escalera de presupuesto acota el costo de los alimentos', () => {
    const topes = { bajo: 1, medio: 2, alto: 3 } as const;

    for (const [budget, tope] of Object.entries(topes)) {
      const profile: Profile = { ...P, budget: budget as Profile['budget'] };
      for (const seed of SEEDS) {
        const { plan } = planFor(profile, 'BASE', seed);
        const items = plan.menus.flatMap((m) => m.meals.flatMap((meal) => meal.items));
        expect(items.length, `${budget} seed ${seed} sin comidas`).toBeGreaterThan(0);
        for (const item of items) {
          expect(findFood(item.foodId)!.costRel, `${budget} seed ${seed}`).toBeLessThanOrEqual(tope);
        }
      }
    }
  });

  it('las equivalencias caen dentro de +-10% del macro del rol', () => {
    for (const seed of SEEDS) {
      const { plan } = planFor(P, 'BASE', seed);
      for (const menu of plan.menus) {
        for (const meal of menu.meals) {
          for (const item of meal.items) {
            const equiv = meal.equivalences.find((e) => e.forFoodId === item.foodId);
            if (!equiv) continue;
            const food = findFood(item.foodId)!;
            // Los vegetales libres no cuadran macros: su equivalencia es
            // "cualquier otro vegetal libre", con la cantidad sin contar.
            if (food.role === 'vegetal_libre') continue;
            const key =
              food.role === 'grasa'
                ? 'fatPer100'
                : food.role.startsWith('proteina')
                  ? 'proteinPer100'
                  : 'carbPer100';
            const base = (item.grams * food[key]) / 100;
            if (base < 5) continue;
            for (const option of equiv.options) {
              const sub = findFood(option.foodId)!;
              const got = (option.grams * sub[key]) / 100;
              // Una opcion sin marca promete +-10 %. Las marcadas `aproximada`
              // son las que completan la lista cuando no hay tres exactas:
              // valen hasta 40 % y la app las advierte antes de aplicarlas.
              const tope = option.aproximada ? 40 : 10;
              expect(devPct(got, base), `${food.name} -> ${sub.name} seed ${seed}`).toBeLessThanOrEqual(tope);
              if (option.aproximada) {
                expect(equiv.aproximada, `${food.name} seed ${seed}`).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('las equivalencias son del mismo rol y nunca el mismo alimento', () => {
    const { plan } = planFor(P);
    for (const meal of plan.menus[0].meals) {
      for (const equiv of meal.equivalences) {
        const role = findFood(equiv.forFoodId)!.role;
        for (const option of equiv.options) {
          expect(option.foodId).not.toBe(equiv.forFoodId);
          expect(findFood(option.foodId)!.role).toBe(role);
        }
      }
    }
  });

  it('CUT_AGRESIVO no mete carbo denso en comida ni cena y avisa de electrolitos', () => {
    const { plan } = planFor(P, 'CUT_AGRESIVO');
    for (const menu of plan.menus) {
      for (const meal of menu.meals.filter((m) => m.slot === 'COMIDA' || m.slot === 'CENA')) {
        for (const item of meal.items) {
          expect(['carbo_pre', 'carbo_post', 'carbo_complejo']).not.toContain(
            findFood(item.foodId)!.role,
          );
        }
      }
    }
    expect(plan.notas.join(' ')).toMatch(/electrolitos/i);
  });

  it('los gramos son enteros; multiplos de 5 salvo alimentos muy densos', () => {
    const { plan } = planFor(P);
    for (const item of plan.menus.flatMap((m) => m.meals.flatMap((meal) => meal.items))) {
      expect(Number.isInteger(item.grams)).toBe(true);
      expect(item.grams).toBeGreaterThan(0);
      const food = findFood(item.foodId)!;
      if (food.kcalPer100 < DEFAULT_CONFIG.denseFoodKcalPer100) {
        expect(item.grams % 5, food.name).toBe(0);
      }
    }
  });

  // La queja original, en dos formas: 25 g de aceite y 400 g de frijol por un
  // lado; "un pedacito de aguacate" de 12 g por el otro. Ninguna es comida.
  it('ningun alimento sale fuera de su porcion: ni pizca ni exceso', () => {
    for (const seed of SEEDS) {
      for (const phase of ['BASE', 'CUT', 'CUT_AGRESIVO', 'REINTRO'] as Phase[]) {
        const { plan } = planFor(P, phase, seed);
        for (const menu of plan.menus) {
          for (const meal of menu.meals) {
            expect(meal.items.length, `${phase} ${meal.slot} seed ${seed}`).toBeLessThanOrEqual(
              DEFAULT_CONFIG.maxFoodsPerMeal,
            );
            for (const item of meal.items) {
              const food = findFood(item.foodId)!;
              if (!food.serving) continue;
              const min = food.serving.minUnits * food.serving.gramsPerUnit;
              const max = food.serving.maxUnits * food.serving.gramsPerUnit;
              const donde = `${food.name} ${phase} ${meal.slot} seed ${seed}`;
              expect(item.grams, donde).toBeGreaterThanOrEqual(Math.floor(min));
              expect(item.grams, donde).toBeLessThanOrEqual(Math.ceil(max));
            }
          }
        }
      }
    }
  });

  it('un slot con casi nada de grasa no deja un pedacito de aguacate', () => {
    const slots: MealSlot[] = [
      {
        id: 'COMIDA',
        label: 'Comida',
        timeHint: '14:00',
        proteinG: 35,
        carbG: 40,
        fatG: 5,
        kcal: 345,
        allowDenseCarb: true,
        freeVegetables: true,
      },
    ];
    for (const seed of SEEDS) {
      const plan = generateMenu(slots, P, DEFAULT_CONFIG, seed, { phase: 'BASE' });
      for (const menu of plan.menus) {
        for (const item of menu.meals[0]!.items) {
          const food = findFood(item.foodId)!;
          if (food.role !== 'grasa') continue;
          // O no esta, o esta en una porcion que alguien sirve.
          expect(item.grams, `${food.name} seed ${seed}`).toBeGreaterThanOrEqual(
            Math.floor(food.serving!.minUnits * food.serving!.gramsPerUnit),
          );
        }
      }
    }
  });

  it('un slot con mucho carbohidrato usa dos fuentes, no 400 g de arroz', () => {
    const slots: MealSlot[] = [
      {
        id: 'COMIDA',
        label: 'Comida',
        timeHint: '14:00',
        proteinG: 35,
        carbG: 120,
        fatG: 15,
        kcal: 755,
        allowDenseCarb: true,
        freeVegetables: true,
      },
    ];
    for (const seed of SEEDS) {
      const plan = generateMenu(slots, P, DEFAULT_CONFIG, seed, { phase: 'BASE' });
      for (const menu of plan.menus) {
        const carbos = menu.meals[0]!.items.filter((item) =>
          ['carbo_pre', 'carbo_post', 'carbo_complejo'].includes(findFood(item.foodId)!.role),
        );
        expect(carbos.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
        for (const item of carbos) {
          expect(item.grams, `${item.name} seed ${seed}`).toBeLessThanOrEqual(250);
        }
      }
    }
  });

  // El plato tambien tiene reglas, no solo los macros: una cena con aceite Y
  // crema de cacahuate cuadra numeros y aun asi nadie la cocina.
  it('ninguna comida rompe los topes de composicion del platillo', () => {
    const { composicion } = DEFAULT_CONFIG;
    const gramosDe = (items: { foodId: string; grams: number }[], tag: string): number =>
      items
        .filter((i) => findFood(i.foodId)?.tags.includes(tag))
        .reduce((acc, i) => acc + i.grams, 0);

    for (const seed of SEEDS) {
      for (const phase of ['BASE', 'CUT', 'CUT_AGRESIVO', 'REINTRO'] as Phase[]) {
        const { plan } = planFor(P, phase, seed);
        for (const menu of plan.menus) {
          for (const meal of menu.meals) {
            const donde = `${phase} ${meal.slot} seed ${seed}`;
            const grasas = meal.items.filter((i) =>
              findFood(i.foodId)?.tags.includes('grasa_anadida'),
            );
            expect(grasas.length, `dos grasas anadidas en ${donde}`).toBeLessThanOrEqual(
              composicion.maxGrasasAnadidasPorComida,
            );
            expect(gramosDe(meal.items, 'grasa_anadida'), donde).toBeLessThanOrEqual(
              composicion.grasaAnadidaMaxGPorComida,
            );
            expect(gramosDe(meal.items, 'leguminosa'), donde).toBeLessThanOrEqual(
              composicion.leguminosaMaxGPorComida,
            );
            expect(gramosDe(meal.items, 'cereal_cocido'), donde).toBeLessThanOrEqual(
              composicion.cerealCocidoMaxGPorComida,
            );
            expect(gramosDe(meal.items, 'fruto_seco'), donde).toBeLessThanOrEqual(
              composicion.frutoSecoMaxGPorComida,
            );
          }
        }
      }
    }
  });

  // La afinidad no cuadra macros: cuida que la comida tenga sentido. Avena con
  // arroz es desayuno y comida en el mismo plato; dos frutas son postre.
  it('no sirve combinaciones que no van juntas', () => {
    for (const seed of SEEDS) {
      for (const phase of ['BASE', 'CUT', 'REINTRO'] as Phase[]) {
        const { plan } = planFor(P, phase, seed);
        for (const menu of plan.menus) {
          for (const meal of menu.meals) {
            const foods = meal.items.map((i) => findFood(i.foodId)!);
            const donde = `${phase} ${meal.slot} seed ${seed}`;
            for (const a of foods) {
              for (const b of foods) {
                if (a === b) continue;
                expect(
                  incompatibles(a, b, DEFAULT_CONFIG),
                  `${a.name} + ${b.name} en ${donde}`,
                ).toBe(false);
              }
            }
            expect(foods.filter((f) => f.role === 'fruta').length, donde).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('produce lista de super agregada y sin duplicados', () => {
    const { plan } = planFor(P);
    expect(plan.shoppingList.length).toBeGreaterThan(5);
    expect(new Set(plan.shoppingList.map((i) => i.foodId)).size).toBe(plan.shoppingList.length);
    expect(plan.shoppingList.every((i) => i.grams > 0)).toBe(true);
  });

  it('respeta el tope de tiempo de cocina, medido el dia que se come', () => {
    const profile: Profile = { ...P, maxPrepMin: 10 };
    const lentos = SEEDS.flatMap((seed) => {
      const { plan } = planFor(profile, 'BASE', seed);
      return plan.menus
        .flatMap((m) => m.meals.flatMap((meal) => meal.items.map((i) => findFood(i.foodId))))
        .filter((food) => food !== undefined && prepMinDelDia(food) > 10);
    });
    expect(lentos).toEqual([]);
  });

  it('lo que se cocina en lote SI entra con tope bajo: el arroz se hizo el domingo', () => {
    const arroz = findFood('arroz_integral')!;

    // 35 minutos de olla, pero el dia que te lo comes es calentar la porcion.
    expect(arroz.prepMin).toBeGreaterThan(30);
    expect(prepMinDelDia(arroz)).toBeLessThanOrEqual(10);
  });

  it('lo que no aguanta lote conserva su tiempo completo', () => {
    const camaron = findFood('camaron')!;
    expect(prepMinDelDia(camaron)).toBe(camaron.prepMin);
  });

  it('el tope de cocina no deja un rol sin comida: manda comer', () => {
    // Catalogo donde toda la proteina tarda mas de lo que la persona acepta.
    const pool = FOODS.map((food) =>
      food.role === 'proteina_magra' ? { ...food, prepMin: 45 } : food,
    );
    const profile: Profile = { ...P, maxPrepMin: 10 };
    const kcal = kcalForDeficit(profile, pickDeficit('BASE', DEFAULT_CONFIG), DEFAULT_CONFIG);
    const macros = macrosFor('BASE', profile, kcal);
    const slots = distribute(macros, profile, 'BASE');
    const plan = generateMenu(slots, profile, DEFAULT_CONFIG, 42, { phase: 'BASE' }, pool);

    const proteinas = plan.menus.flatMap((m) =>
      m.meals.flatMap((meal) =>
        meal.items.filter((item) => findFood(item.foodId, pool)?.role === 'proteina_magra'),
      ),
    );
    expect(proteinas.length).toBeGreaterThan(0);
  });

  it('prioriza favoritos del perfil', () => {
    const profile: Profile = { ...P, favoriteFoods: ['pechuga de pollo', 'camote', 'aguacate'] };
    const hits = SEEDS.flatMap((seed) => {
      const { plan } = planFor(profile, 'BASE', seed);
      return plan.menus.flatMap((m) => m.meals.flatMap((meal) => meal.items.map((i) => i.foodId)));
    });
    const favoriteHits = hits.filter((id) => ['pechuga_pollo', 'camote', 'aguacate'].includes(id));
    expect(favoriteHits.length).toBeGreaterThan(0);
  });
});

describe('equivalencias de vegetales libres', () => {
  // Antes los vegetales libres eran los unicos items sin boton de "cambiar":
  // la persona veia "Espinaca (libre)" y no podia pedir otra cosa. Ahora su
  // equivalencia es la mas simple de todas — cualquier otro vegetal libre,
  // mismos gramos sugeridos, porque la cantidad no esta contada.
  it('todo vegetal libre trae al menos una opcion de cambio', () => {
    for (const seed of SEEDS) {
      const { plan } = planFor(P, 'BASE', seed);
      for (const menu of plan.menus) {
        for (const meal of menu.meals) {
          for (const item of meal.items) {
            if (findFood(item.foodId)!.role !== 'vegetal_libre') continue;
            const equiv = meal.equivalences.find((e) => e.forFoodId === item.foodId);
            expect(equiv, `${item.name} seed ${seed} sin equivalencias`).toBeDefined();
            expect(equiv!.options.length).toBeGreaterThanOrEqual(1);
            for (const option of equiv!.options) {
              expect(findFood(option.foodId)!.role).toBe('vegetal_libre');
              // Mismos gramos: libre es libre, no hay macro que cuadrar.
              expect(option.grams).toBe(item.grams);
            }
          }
        }
      }
    }
  });

  it('las opciones respetan exclusiones del perfil', () => {
    const profile: Profile = { ...P, excludedFoods: ['espinaca', 'nopal'] };
    const { plan } = planFor(profile, 'BASE', 42);
    const opciones = plan.menus.flatMap((m) =>
      m.meals.flatMap((meal) => meal.equivalences.flatMap((e) => e.options.map((o) => o.foodId))),
    );
    expect(opciones).not.toContain('espinaca');
    expect(opciones).not.toContain('nopal');
  });

  it('los suplementos siguen sin equivalencias: no tienen sustituto honesto', () => {
    for (const seed of SEEDS) {
      const { plan } = planFor(P, 'BASE', seed);
      for (const menu of plan.menus) {
        for (const meal of menu.meals) {
          for (const equiv of meal.equivalences) {
            expect(findFood(equiv.forFoodId)!.role).not.toBe('suplemento');
          }
        }
      }
    }
  });
});

describe('la lista de equivalencias da de donde elegir', () => {
  // La queja fue literal: "antes salian al menos 3 equivalencias, ahora solo
  // aparece 1". Con una sola opcion no se elige, se acepta. Cuando el catalogo
  // elegible de la persona da para mas, la lista tiene que llenarse.
  it('llena hasta 20 opciones cuando el catalogo da para eso', () => {
    const { plan } = planFor(P, 'BASE', 42);
    const equivalencias = plan.menus.flatMap((m) => m.meals.flatMap((meal) => meal.equivalences));
    const conVarias = equivalencias.filter((e) => e.options.length >= 3);

    // La gran mayoria trae al menos 3; las que no, es porque su rol tiene
    // pocos alimentos elegibles (no porque el motor las recorte de mas).
    expect(conVarias.length / equivalencias.length).toBeGreaterThan(0.7);
    for (const equivalencia of equivalencias) {
      expect(equivalencia.options.length).toBeLessThanOrEqual(20);
      expect(equivalencia.options.length).toBeGreaterThan(0);
    }
  });

  it('las exactas van primero: lo aproximado solo completa', () => {
    const { plan } = planFor(P, 'BASE', 7);
    for (const menu of plan.menus) {
      for (const meal of menu.meals) {
        for (const equivalencia of meal.equivalences) {
          const marcas = equivalencia.options.map((o) => o.aproximada === true);
          // Ninguna exacta puede venir despues de una aproximada.
          const primeraAprox = marcas.indexOf(true);
          if (primeraAprox === -1) continue;
          expect(marcas.slice(primeraAprox).every(Boolean)).toBe(true);
        }
      }
    }
  });
});

describe('la lista de super sigue a los menus que se van a cocinar', () => {
  // Los dos menus son dos variantes de LA MISMA semana, no dos semanas. Quien
  // cocina uno solo lo come los 7 dias: comprar tambien los ingredientes del
  // otro es tirar comida.
  it('un menu solo pide el doble que ese mismo menu repartido a medias', () => {
    const { plan } = planFor(P, 'BASE', 42);
    const [menu1] = plan.menus;

    const soloUno = listaDeSuper([menu1!], 7);
    const mitad = listaDeSuper([menu1!], 3.5);

    const gramosDe = (lista: typeof soloUno, id: string) =>
      lista.find((item) => item.foodId === id)?.grams ?? 0;

    for (const item of soloUno) {
      // La lista redondea a multiplos de 5 g, asi que el doble exacto no
      // siempre cae: lo que importa es que sea el doble en la practica.
      const esperado = gramosDe(mitad, item.foodId) * 2;
      expect(Math.abs(gramosDe(soloUno, item.foodId) - esperado)).toBeLessThanOrEqual(10);
    }
  });

  it('los dos menus juntos traen los alimentos de ambos', () => {
    const { plan } = planFor(P, 'BASE', 42);
    const ambos = listaDeSuper(plan.menus, 3.5);
    const soloUno = listaDeSuper([plan.menus[0]!], 7);

    const ids = new Set(ambos.map((item) => item.foodId));
    for (const item of soloUno) expect(ids.has(item.foodId)).toBe(true);
    expect(ambos.length).toBeGreaterThanOrEqual(soloUno.length);
  });
});

describe('la lista de super no revuelve alimentos', () => {
  // El bug: los alimentos intercambiados se guardaban sin `foodId`, la lista
  // agrupaba por ese id y todos caian en la misma cubeta. En pantalla salian
  // seis renglones con sumas imposibles: el yogur cargaba tambien con el
  // pavo, el frijol y las tostadas.
  it('agrupa por nombre cuando el alimento viene sin id', () => {
    const menu: any = {
      id: 1,
      meals: [
        {
          slot: 'COMIDA',
          items: [
            { name: 'Yogur griego natural 0%', grams: 370 },
            { name: 'Pechuga de pavo cocida', grams: 145 },
            { name: 'Frijol negro de olla', grams: 330 },
          ],
        },
      ],
    };

    const lista = listaDeSuper([menu], 7);

    expect(lista).toHaveLength(3);
    const porNombre = Object.fromEntries(lista.map((item) => [item.name, item.grams]));
    expect(porNombre['Yogur griego natural 0%']).toBe(370 * 7);
    expect(porNombre['Pechuga de pavo cocida']).toBe(145 * 7);
    expect(porNombre['Frijol negro de olla']).toBe(330 * 7);
  });

  it('el mismo alimento con y sin id se suma una sola vez', () => {
    const menu: any = {
      id: 1,
      meals: [
        { slot: 'DESAYUNO', items: [{ foodId: 'avena', name: 'Avena en hojuelas (cruda)', grams: 40 }] },
        { slot: 'CENA', items: [{ name: 'Avena en hojuelas (cruda)', grams: 20 }] },
      ],
    };

    const lista = listaDeSuper([menu], 1);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.grams).toBe(60);
  });

  it('los gramos acumulados se reportan en gramos, no en piezas', () => {
    const menu: any = { id: 1, meals: [{ slot: 'DESAYUNO', items: [{ foodId: 'naranja', name: 'Naranja', grams: 180 }] }] };
    const lista = listaDeSuper([menu], 7);
    expect(lista[0]!.unit).toBe('g');
    expect(lista[0]!.grams).toBe(1260);
  });
});
