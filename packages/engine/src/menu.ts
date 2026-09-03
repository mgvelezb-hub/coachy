import { DEFAULT_CONFIG, type EngineConfig } from './config.js';
import { permitePolvos } from './suplementos.js';
import { roundTo } from './calc.js';
import { FOODS, matchesAny, normalize } from './foods.js';
import type {
  Equivalence,
  Food,
  FoodRole,
  MacroTargets,
  MealSlot,
  Menu,
  MenuItem,
  MenuMeal,
  MenuItemWhy,
  MenuPlan,
  Phase,
  Profile,
  ServingUnit,
  ShoppingItem,
} from './types.js';

const DENSE_CARB_ROLES: FoodRole[] = ['carbo_pre', 'carbo_post', 'carbo_complejo'];

/** PRNG determinista (mulberry32): misma semilla, mismo menu. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gramos maximos razonables por alimento, para no proponer 400 g de aceite. */
export function maxGrams(food: Food): number {
  // La medida casera manda: el techo real es `maxUnits` piezas, tazas o
  // cucharadas de ese alimento. `maxG` se queda como techo absoluto para lo
  // que no la tiene (vegetales libres, suplementos).
  if (food.serving) return food.serving.maxUnits * food.serving.gramsPerUnit;
  if (food.maxG !== undefined) return food.maxG;
  if (food.role === 'suplemento') return 20;
  if (food.kcalPer100 >= 700) return 40;
  if (food.kcalPer100 >= 450) return 80;
  if (food.kcalPer100 >= 250) return 250;
  return 400;
}

/**
 * Porcion minima digna. No es un minimo tecnico: es la cantidad por debajo de
 * la cual el alimento deja de ser un ingrediente y pasa a ser una pizca —el
 * "pedacito de aguacate" de 12 g que nadie sirve—. Por debajo de esto el
 * alimento se cae de la comida en vez de aparecer en migajas.
 */
export function minGrams(food: Food): number {
  if (!food.serving) return 0;
  return food.serving.minUnits * food.serving.gramsPerUnit;
}

/**
 * Paso de redondeo por alimento. Con medida casera el paso es fraccion de la
 * unidad (media taza, media cucharadita, una pieza): asi el menu dice "1½
 * tazas" y no "173 g". Sin ella, los alimentos muy densos se redondean al
 * gramo, porque 5 g de aceite son 45 kcal y romperian el target.
 */
function roundingFor(food: Food, config: EngineConfig): number {
  if (food.serving) return (food.serving.step ?? 0.5) * food.serving.gramsPerUnit;
  return food.kcalPer100 >= config.denseFoodKcalPer100 ? 1 : config.menuGramRoundingG;
}

/** Redondea al paso del alimento y lo encaja en su rango de porcion. */
function quantize(grams: number, food: Food, config: EngineConfig): number {
  const paso = roundingFor(food, config);
  const redondeado = roundTo(grams, paso);
  return Math.min(Math.max(redondeado, minGrams(food)), maxGrams(food));
}

export interface MenuOptions {
  phase?: Phase;
  /** Menos ingredientes y mas repeticion (regla de adherencia). */
  simplify?: boolean;
  /** Dias por semana que se usa cada menu, para la lista de super. */
  daysPerMenu?: number;
}

interface EligibleOptions {
  /** Solo alimentos verdes de bajo carbohidrato (vegetales libres). */
  freeVegetable?: boolean;
  /** Slot peri-entreno: nada que haya que cocinar. */
  quickOnly?: boolean;
  /** Comida o cena: sin polvos ni suplementos. */
  noSupplements?: boolean;
  /** Lo que ya esta en el plato, para no servir combinaciones que no van. */
  acompanan?: Food[];
}

/** true si el alimento responde a ese termino de la tabla de afinidad. */
function esTermino(food: Food, termino: string): boolean {
  return food.id === termino || food.role === termino || food.tags.includes(termino);
}

/** true si esos dos alimentos no se sirven en la misma comida. */
export function incompatibles(a: Food, b: Food, config: EngineConfig): boolean {
  return config.afinidad.incompatibles.some(
    ([uno, otro]) =>
      (esTermino(a, uno) && esTermino(b, otro)) || (esTermino(a, otro) && esTermino(b, uno)),
  );
}

/** true si ese par se busca: frijol con tortilla, huevo con aguacate. */
function afines(a: Food, b: Food, config: EngineConfig): boolean {
  return config.afinidad.afines.some(
    ([uno, otro]) =>
      (esTermino(a, uno) && esTermino(b, otro)) || (esTermino(a, otro) && esTermino(b, uno)),
  );
}

/**
 * Minutos que ese alimento cuesta **el dia que te lo comes**.
 *
 * El arroz integral tarda 35 minutos, pero nadie cuece arroz para una comida:
 * se hace la olla el domingo y entre semana se calienta la porcion. Castigarlo
 * con sus 35 minutos saca del menu al carbohidrato base de media Mexico por un
 * tiempo que no ocurre ese dia.
 *
 * Por eso lo que se mide es el tiempo del dia: para lo que aguanta cocinarse
 * en lote y refrigerarse (`meal_prep`), eso es calentar y servir. La cuenta
 * completa sigue existiendo —vive en `prepMin` y es la que se usa para armar
 * el domingo—, solo deja de aplicarse al martes.
 */
const MINUTOS_CALENTAR = 6;

export function prepMinDelDia(food: Food): number {
  if (!food.tags.includes('meal_prep')) return food.prepMin;
  return Math.min(food.prepMin, MINUTOS_CALENTAR);
}

function eligible(
  pool: Food[],
  profile: Profile,
  config: EngineConfig,
  role: FoodRole,
  options: EligibleOptions = {},
): Food[] {
  const excluded = [...(profile.excludedFoods ?? []), ...(profile.allergies ?? [])];
  const filtered = pool.filter((food) => {
    if (food.role !== role) return false;
    if (options.freeVegetable && food.carbPer100 > config.freeVegetableMaxCarbPer100) return false;
    if (options.noSupplements && food.tags.includes('suplemento')) return false;
    // Un menú que pide 30 g de whey a quien no tiene whey es un menú que no se
    // puede seguir. Los polvos entran solo si la persona los declaró.
    if (food.tags.includes('suplemento') && !permitePolvos(profile)) return false;
    if (matchesAny(food, excluded)) return false;
    // Vegetariana es ovolactovegetariana: sale la carne, el pollo y el
    // pescado; el huevo y los lacteos se quedan. El catalogo trae la etiqueta
    // por alimento, así que aquí no se adivina por nombre.
    if (profile.diet === 'vegetariana' && food.tags.includes('no_vegetariano')) return false;
    // Escalera de precio: bajo = solo lo más barato, medio = hasta el
    // intermedio, alto = sin tope.
    const topeDeCosto = profile.budget === 'bajo' ? 1 : profile.budget === 'medio' ? 2 : 3;
    if (food.costRel > topeDeCosto) return false;
    if (
      profile.conditions?.glucosaAlta &&
      DENSE_CARB_ROLES.includes(role) &&
      food.gi !== null &&
      food.gi > config.lowGiMax
    ) {
      return false;
    }
    return true;
  });
  // El tope de tiempo de cocina es una preferencia, no una restricción dura:
  // si deja un rol sin con qué comer —el caso real es la proteína, que casi
  // siempre se cocina—, manda comer. Un menú sin proteína no es un menú que
  // respeta tu agenda, es un menú roto.
  const quickEnough =
    profile.maxPrepMin === undefined
      ? filtered
      : filtered.filter((f) => prepMinDelDia(f) <= (profile.maxPrepMin as number));
  const byPrep = quickEnough.length > 0 ? quickEnough : filtered;

  const conAfinidad =
    options.acompanan === undefined
      ? byPrep
      : byPrep.filter(
          (f) => !options.acompanan!.some((otro) => incompatibles(f, otro, config)),
        );
  // La afinidad es una preferencia fuerte, no un muro: si deja el rol vacio,
  // manda comer, igual que el tope de tiempo de cocina.
  const conCompania = conAfinidad.length > 0 ? conAfinidad : byPrep;

  if (options.quickOnly) {
    const quick = conCompania.filter((f) => f.tags.includes('rapido'));
    if (quick.length > 0) return quick;
  }
  return conCompania;
}

function pick(
  candidates: Food[],
  profile: Profile,
  random: () => number,
  avoid: Set<string>,
  /** Alimentos que se llevan bien con lo que ya esta en el plato. */
  preferidos: Set<string> = new Set(),
): Food | undefined {
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((f) => !avoid.has(f.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const weights = pool.map(
    (f) => (matchesAny(f, profile.favoriteFoods) ? 3 : 1) * (preferidos.has(f.id) ? 2 : 1),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let ticket = random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    ticket -= weights[i] ?? 0;
    if (ticket <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

interface Slot {
  food: Food;
  grams: number;
  fixed: boolean;
  /** Rol con el que se eligio: lo necesita el refill y la explicabilidad. */
  role?: FoodRole;
  /**
   * Gramos que el solver pedia ANTES de encajarlos en la medida casera. Es lo
   * que delata a un alimento que no cabe en la comida: si pedia 12 g y su
   * porcion minima son 45, no es que sobre poco, es que no va.
   */
  raw?: number;
}

function macrosOf(slot: Slot): { p: number; c: number; f: number; fib: number; kcal: number } {
  const k = slot.grams / 100;
  return {
    p: slot.food.proteinPer100 * k,
    c: slot.food.carbPer100 * k,
    f: slot.food.fatPer100 * k,
    fib: slot.food.fiberPer100 * k,
    kcal: slot.food.kcalPer100 * k,
  };
}

function sum(slots: Slot[], key: 'p' | 'c' | 'f'): number {
  return slots.reduce((acc, s) => acc + macrosOf(s)[key], 0);
}

/**
 * Resuelve gramos por Gauss-Seidel: cada alimento domina su propio macro
 * (proteina exacta, carbo ajusta, grasa cierra). Converge en pocas pasadas.
 */
function solveGrams(
  slots: Slot[],
  target: { p: number; c: number; f: number },
  config: EngineConfig,
): void {
  // Cada alimento cierra el macro de SU ROL, no el del primer macro denso que
  // tenga. La crema de cacahuate trae 20 g de carbohidrato por 100: elegida
  // por densidad terminaba de "fuente de carbohidrato" de una cena sin carbos
  // —el solver le pedia 0 g— y la grasa de esa cena se quedaba sin quien la
  // cerrara. El rol con el que se eligio es el dato que no miente.
  const esProteina = (s: Slot): boolean =>
    s.role ? s.role.startsWith('proteina') : s.food.proteinPer100 >= 8;
  const esCarbo = (s: Slot): boolean =>
    s.role ? DENSE_CARB_ROLES.includes(s.role) || s.role === 'fruta' : s.food.carbPer100 >= 10;
  const esGrasa = (s: Slot): boolean => (s.role ? s.role === 'grasa' : s.food.fatPer100 >= 10);

  const proteinSlot = slots.find((s) => !s.fixed && esProteina(s));
  const carbSlot = slots.find((s) => !s.fixed && esCarbo(s) && s !== proteinSlot);
  const carbSlot2 = slots.find(
    (s) => !s.fixed && esCarbo(s) && s !== proteinSlot && s !== carbSlot,
  );
  const fatSlot = slots.find(
    (s) => !s.fixed && esGrasa(s) && s !== proteinSlot && s !== carbSlot && s !== carbSlot2,
  );

  if (carbSlot2) {
    // El primero se lleva lo que puede; el segundo cierra. Arrancarlo en su
    // tope invertia el reparto —el arroz se quedaba con las sobras del
    // segundo— y el segundo terminaba por debajo de su porcion minima, que es
    // justo lo que hace que se caiga de la comida y el slot vuelva a quedar
    // corto.
    carbSlot2.grams = Math.max(minGrams(carbSlot2.food), 0);
  }

  for (let iter = 0; iter < 24; iter += 1) {
    if (fatSlot) {
      const others = sum(slots.filter((s) => s !== fatSlot), 'f');
      fatSlot.grams = clampGrams(((target.f - others) * 100) / fatSlot.food.fatPer100, fatSlot.food);
    }
    if (carbSlot) {
      const others = sum(slots.filter((s) => s !== carbSlot), 'c');
      carbSlot.grams = clampGrams(((target.c - others) * 100) / carbSlot.food.carbPer100, carbSlot.food);
    }
    if (carbSlot2) {
      const others = sum(slots.filter((s) => s !== carbSlot2), 'c');
      carbSlot2.grams = clampGrams(
        ((target.c - others) * 100) / carbSlot2.food.carbPer100,
        carbSlot2.food,
      );
    }
    if (proteinSlot) {
      const others = sum(slots.filter((s) => s !== proteinSlot), 'p');
      proteinSlot.grams = clampGrams(
        ((target.p - others) * 100) / proteinSlot.food.proteinPer100,
        proteinSlot.food,
      );
    }
  }

  for (const slot of slots) {
    if (slot.fixed) continue;
    slot.raw = Math.max(0, slot.grams);
    slot.grams = quantize(slot.grams, slot.food, config);
  }

  // Pase de reparacion: ajusta el carbo y luego la grasa en pasos de `roundingG`.
  for (const slot of [carbSlot, carbSlot2, fatSlot, proteinSlot]) {
    if (!slot) continue;
    const step0 = roundingFor(slot.food, config);
    let best = error(slots, target);
    for (let step = 0; step < 12; step += 1) {
      const up = { ...slot, grams: slot.grams + step0 };
      const down = { ...slot, grams: Math.max(0, slot.grams - step0) };
      const errUp = error(slots.map((s) => (s === slot ? up : s)), target);
      const errDown = error(slots.map((s) => (s === slot ? down : s)), target);
      if (errUp < best && errUp <= errDown && up.grams <= maxGrams(slot.food)) {
        slot.grams = up.grams;
        best = errUp;
      } else if (errDown < best && down.grams >= minGrams(slot.food)) {
        slot.grams = down.grams;
        best = errDown;
      } else {
        break;
      }
    }
  }
}

function clampGrams(grams: number, food: Food): number {
  if (!Number.isFinite(grams)) return 0;
  return Math.min(Math.max(grams, 0), maxGrams(food));
}

/**
 * Error relativo (no absoluto): 6 g de grasa de mas pesan mucho mas que
 * 6 g de carbohidrato de mas, porque el target de grasa es cinco veces menor.
 */
function error(slots: Slot[], target: { p: number; c: number; f: number }): number {
  const rel = (got: number, want: number): number => (got - want) / Math.max(want, 8);
  const p = rel(sum(slots, 'p'), target.p);
  const c = rel(sum(slots, 'c'), target.c);
  const f = rel(sum(slots, 'f'), target.f);
  return p * p * 2 + c * c + f * f * 1.5;
}

/** Plural de la unidad casera, como se dice en la cocina. */
const UNIDADES: Record<ServingUnit, [string, string]> = {
  cdita: ['cdita', 'cditas'],
  cda: ['cda', 'cdas'],
  taza: ['taza', 'tazas'],
  media_taza: ['media taza', 'medias tazas'],
  pieza: ['pieza', 'piezas'],
  rebanada: ['rebanada', 'rebanadas'],
  scoop: ['scoop', 'scoops'],
  g: ['g', 'g'],
};

/** Fracciones como se sirven: "1½", no "1.5". */
function formatoUnidades(cantidad: number): string {
  const entero = Math.floor(cantidad + 1e-9);
  const resto = cantidad - entero;
  const fraccion = resto < 0.125 ? '' : resto < 0.375 ? '¼' : resto < 0.625 ? '½' : resto < 0.875 ? '¾' : '';
  const acarreo = resto >= 0.875 ? 1 : 0;
  const cabeza = entero + acarreo;
  if (fraccion === '') return String(cabeza);
  return cabeza === 0 ? fraccion : `${cabeza}${fraccion}`;
}

/** El macro que ese alimento viene a cerrar, en el vocabulario del dueno. */
function cierraQue(food: Food, role?: FoodRole): MenuItemWhy['closes'] {
  const efectivo = role ?? food.role;
  if (efectivo === 'vegetal_libre') return 'fibra';
  const macro = macroDominante(food, efectivo);
  if (macro === 'p') return 'proteina';
  if (macro === 'f') return 'grasa';
  return 'carbo';
}

/**
 * La porcion en el idioma de la cocina: "2 cditas de aceite de oliva (10 g)".
 *
 * Los gramos no desaparecen —siguen siendo la cifra exacta— pero dejan de ser
 * lo primero que hay que interpretar. Nadie pesa una cucharadita.
 */
function describirPorcion(
  food: Food,
  gramos: number,
  free: boolean,
  role: FoodRole | undefined,
): { display: string; why: MenuItemWhy } {
  const nombre = food.name.charAt(0).toLowerCase() + food.name.slice(1);
  const why: MenuItemWhy = {
    role: role ?? food.role,
    closes: cierraQue(food, role),
    units: gramos,
    unitLabel: 'g',
    ...(free ? { note: 'libre' } : {}),
  };

  const s = food.serving;
  if (!s || s.unit === 'g') {
    return { display: `${gramos} g de ${nombre}`, why };
  }

  const unidades = gramos / s.gramsPerUnit;
  const texto = formatoUnidades(unidades);
  // El plural sigue a la CANTIDAD, no a la fraccion: "½ pieza" y "1 pieza"
  // van en singular, "1½ tazas" en plural. Antes, cualquier cosa distinta de
  // uno pluralizaba y salia "½ piezas de manzana", que no lo dice nadie.
  const plural = unidades > 1 + 1e-9 ? 1 : 0;
  const etiqueta = UNIDADES[s.unit][plural]!;

  const nota = free
    ? 'libre'
    : unidades <= s.minUnits + 1e-9
      ? 'porcion minima'
      : unidades >= s.maxUnits - 1e-9
        ? 'tope de la porcion'
        : undefined;

  return {
    display: `${texto} ${etiqueta} de ${nombre} (${gramos} g)`,
    why: {
      ...why,
      units: Math.round(unidades * 100) / 100,
      unitLabel: etiqueta,
      ...(nota ? { note: nota } : {}),
    },
  };
}

function toItem(slot: Slot, free: boolean): MenuItem {
  const m = macrosOf(slot);
  const gramos = Math.round(slot.grams);
  const { display, why } = describirPorcion(slot.food, gramos, free, slot.role);
  return {
    foodId: slot.food.id,
    name: slot.food.name,
    grams: gramos,
    display,
    why,
    proteinG: round1(m.p),
    carbG: round1(m.c),
    fatG: round1(m.f),
    fiberG: round1(m.fib),
    kcal: Math.round(m.kcal),
    free,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function primaryMacroOf(role: FoodRole): 'proteinPer100' | 'carbPer100' | 'fatPer100' {
  if (role === 'proteina_magra' || role === 'proteina_grasa') return 'proteinPer100';
  if (role === 'grasa') return 'fatPer100';
  return 'carbPer100';
}

function equivalencesFor(
  slot: Slot,
  pool: Food[],
  profile: Profile,
  config: EngineConfig,
): Equivalence | null {
  // Los suplementos no tienen equivalente honesto: la creatina es un compuesto,
  // no un alimento, y ofrecer "canela en vez de psyllium" seria fingir que son
  // intercambiables. Se quedan sin opciones a proposito.
  if (slot.food.role === 'suplemento') return null;

  // Los vegetales libres SI tienen equivalencias — y son las mas faciles de
  // dar: "libre" significa que la cantidad no esta contada, asi que cualquier
  // otro vegetal libre del catalogo (que pase exclusiones y dieta) sirve tal
  // cual, con los mismos gramos sugeridos. No hay macro que cuadrar.
  if (slot.food.role === 'vegetal_libre') {
    const opciones = eligible(pool, profile, config, 'vegetal_libre', { freeVegetable: true })
      .filter((f) => f.id !== slot.food.id)
      .sort((a, b) => {
        // Los favoritos del perfil primero; el resto alfabetico, para que la
        // lista sea estable entre generaciones.
        const favA = matchesAny(a, profile.favoriteFoods) ? 0 : 1;
        const favB = matchesAny(b, profile.favoriteFoods) ? 0 : 1;
        return favA - favB || a.name.localeCompare(b.name);
      })
      .slice(0, config.equivalencesPerItem)
      .map((f) => ({ foodId: f.id, name: f.name, grams: Math.round(slot.grams) }));

    if (opciones.length === 0) return null;
    return { forFoodId: slot.food.id, forName: slot.food.name, options: opciones };
  }

  const key = primaryMacroOf(slot.food.role);
  const base = slot.food[key];
  if (base <= 0 || slot.grams <= 0) return null;

  const objetivo = (slot.grams * base) / 100;

  /** Candidatos ya con gramos redondeados y su desviacion real, de menor a mayor. */
  const candidatos = eligible(pool, profile, config, slot.food.role)
    .filter((f) => f.id !== slot.food.id && f[key] > 0)
    .map((f) => {
      const paso = roundingFor(f, config);
      const ideal = quantize((slot.grams * base) / f[key], f, config);
      // Los gramos se topan al maximo del alimento en vez de descartarlo:
      // antes, una porcion grande (300 g de platano) se quedaba sin ninguna
      // equivalencia porque CUALQUIER sustituto pedia mas gramos de los que
      // se puede servir de el. Topado, el arroz o el camote siguen sirviendo
      // —cubren casi todo el carbohidrato— y la desviacion que queda se mide
      // abajo y decide si la equivalencia es exacta, aproximada o ninguna.
      const grams = Math.max(paso, ideal);
      // La desviacion se mide DESPUES de redondear y topar, que es como la va
      // a comer quien la siga: una porcion que se pasa del tope ya no es
      // equivalente, es otra comida.
      const real = (grams * f[key]) / 100;
      const desviacion = objetivo <= 0 ? 0 : Math.abs(real - objetivo) / objetivo;
      return { food: f, option: { foodId: f.id, name: f.name, grams }, desviacion };
    })
    .sort((a, b) => a.desviacion - b.desviacion);

  // El recorte va DESPUES de filtrar y ordenar por desviacion real: antes se
  // tomaban los mas parecidos en densidad y solo entonces se revisaba el
  // tope, asi que un alimento cuyos vecinos se pasaban se quedaba sin ninguna
  // opcion aunque el catalogo tuviera otras que si cumplian.
  // Se llena hasta `equivalencesPerItem` opciones: primero las exactas (dentro
  // del +-10 % que promete una equivalencia), y si no alcanzan para llenar la
  // lista se completan con las mas cercanas de las aproximadas. Antes bastaba
  // con que hubiera UNA exacta para descartar todas las demas, asi que un
  // alimento podia quedarse con una sola opcion aunque el catalogo tuviera
  // otras dos casi igual de buenas — y una sola opcion no es elegir.
  const exactas = candidatos.filter((c) => c.desviacion <= config.equivalenceMaxDeviation);
  const aproximadas = candidatos.filter(
    (c) =>
      c.desviacion > config.equivalenceMaxDeviation &&
      c.desviacion <= config.equivalenceFallbackDeviation,
  );

  const elegidas = [...exactas, ...aproximadas].slice(0, config.equivalencesPerItem);
  if (elegidas.length === 0) return null;

  return {
    forFoodId: slot.food.id,
    forName: slot.food.name,
    options: elegidas.map((c) =>
      c.desviacion > config.equivalenceMaxDeviation
        ? { ...c.option, aproximada: true }
        : c.option,
    ),
    // La equivalencia entera se marca aproximada cuando alguna de sus opciones
    // lo es: la app avisa una vez arriba en vez de repetirlo por renglon.
    ...(elegidas.some((c) => c.desviacion > config.equivalenceMaxDeviation)
      ? { aproximada: true }
      : {}),
  };
}

/**
 * Equivalencias de un alimento suelto, resolviendolo por NOMBRE.
 *
 * Existe para los menus que ya estan guardados: un menu generado antes de que
 * el motor supiera dar equivalencias de vegetales libres —o antes de que
 * llenara la lista hasta cinco opciones— se queda con esos huecos para
 * siempre, y la unica salida era regenerar el menu completo, que le borra a
 * la persona los cambios que ya habia elegido. Con esto el servidor puede
 * rellenar SOLO lo que falta, sin tocar lo demas.
 *
 * Se resuelve por nombre porque eso es lo unico que guarda el JSON de la
 * comida. Si el nombre no existe en el catalogo (un alimento renombrado, uno
 * capturado a mano), devuelve `null` en vez de adivinar.
 */
export function equivalenciasDeAlimento(
  nombre: string,
  gramos: number,
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
  pool: Food[] = FOODS,
): Equivalence | null {
  const buscado = normalize(nombre);
  const food = pool.find((f) => normalize(f.name) === buscado || normalize(f.id) === buscado);
  if (food === undefined || gramos <= 0) return null;

  return equivalencesFor({ food, grams: gramos, fixed: false }, pool, profile, config);
}

/**
 * Deja solo los alimentos que pueden cubrir el macro del slot sin pasarse de
 * su tope de gramos, y con densidad suficiente para no ser un relleno.
 * Si ninguno califica, devuelve la lista original.
 */
function feasible(
  candidates: Food[],
  key: 'proteinPer100' | 'carbPer100' | 'fatPer100',
  targetG: number,
  minDensity: number,
): Food[] {
  const alcance = (f: Food): number => (maxGrams(f) * f[key]) / 100;
  const ok = candidates.filter((f) => f[key] >= minDensity && alcance(f) >= targetG * 0.9);
  if (ok.length > 0) return ok;

  // Cuando NINGUN alimento solo alcanza el macro del slot —el post-entreno de
  // 99 g de carbohidrato: ni la tortilla ni el arroz llegan— la eleccion deja
  // de ser libre. Antes se sorteaba entre todo el catalogo y podia caer el
  // platano, que cubre 27 g y deja el slot corto para siempre. Se sortea entre
  // los que mas cubren, y el segundo alimento cierra el resto.
  const densos = candidates.filter((f) => f[key] >= minDensity);
  const pool = densos.length > 0 ? densos : candidates;
  const mejor = Math.max(...pool.map(alcance));
  const cercanos = pool.filter((f) => alcance(f) >= mejor * 0.6);
  return cercanos.length > 0 ? cercanos : pool;
}

function slotCarbRole(slotId: MealSlot['id']): FoodRole {
  if (slotId === 'PRE') return 'carbo_pre';
  if (slotId === 'POST') return 'carbo_post';
  return 'carbo_complejo';
}

interface Residual {
  p: number;
  c: number;
  f: number;
}

/**
 * Familias del platillo. No son roles del motor sino como se ve la comida en
 * el plato: una cena con aceite Y crema de cacahuate cuadra macros y aun asi
 * nadie la cocina.
 */
const FAMILIAS = ['grasa_anadida', 'leguminosa', 'cereal_cocido', 'fruto_seco'] as const;
type Familia = (typeof FAMILIAS)[number];

function topeDeFamilia(familia: Familia, config: EngineConfig): number {
  const c = config.composicion;
  if (familia === 'grasa_anadida') return c.grasaAnadidaMaxGPorComida;
  if (familia === 'leguminosa') return c.leguminosaMaxGPorComida;
  if (familia === 'cereal_cocido') return c.cerealCocidoMaxGPorComida;
  return c.frutoSecoMaxGPorComida;
}

function gramosDeFamilia(comida: Slot[], familia: Familia): number {
  return comida
    .filter((s) => s.food.tags.includes(familia))
    .reduce((acc, s) => acc + s.grams, 0);
}

/** true si la comida se pasa de algun tope de composicion. */
function violaComposicion(comida: Slot[], config: EngineConfig): boolean {
  const grasas = comida.filter((s) => s.food.tags.includes('grasa_anadida'));
  if (grasas.length > config.composicion.maxGrasasAnadidasPorComida) return true;
  return FAMILIAS.some(
    (familia) => gramosDeFamilia(comida, familia) > topeDeFamilia(familia, config) + 1e-6,
  );
}

/**
 * Baja la comida a sus topes de composicion. Primero recorta gramos hasta la
 * porcion minima de los ultimos que entraron; si aun asi se pasa, los saca.
 * El primero de cada familia nunca se toca: es el que define el platillo.
 */
function aplicarComposicion(comida: Slot[], config: EngineConfig): void {
  const grasas = comida.filter((s) => s.food.tags.includes('grasa_anadida'));
  for (const sobrante of grasas.slice(config.composicion.maxGrasasAnadidasPorComida)) {
    const donde = comida.indexOf(sobrante);
    if (donde >= 0) comida.splice(donde, 1);
  }

  for (const familia of FAMILIAS) {
    const tope = topeDeFamilia(familia, config);
    for (let vuelta = 0; vuelta < 4; vuelta += 1) {
      const miembros = comida.filter((s) => s.food.tags.includes(familia));
      const total = miembros.reduce((acc, s) => acc + s.grams, 0);
      if (total <= tope + 1e-6 || miembros.length === 0) break;

      const ultimo = miembros[miembros.length - 1]!;
      const exceso = total - tope;
      // Se recorta a una porcion legal, no a "lo que sobra": media taza menos
      // sigue siendo media taza; 137 g de frijol no es nada.
      const recortado = quantize(ultimo.grams - exceso, ultimo.food, config);
      if (recortado <= ultimo.grams - exceso + 1e-6 && recortado < ultimo.grams) {
        ultimo.grams = recortado;
        continue;
      }
      if (miembros.length === 1) {
        ultimo.grams = Math.min(ultimo.grams, tope);
        break;
      }
      comida.splice(comida.indexOf(ultimo), 1);
    }
  }
}

/** Los que se llevan bien con lo que ya esta en el plato, para pesar el sorteo. */
function preferidosDe(candidatos: Food[], comida: Slot[], config: EngineConfig): Set<string> {
  return new Set(
    candidatos
      .filter((f) => comida.some((s) => afines(f, s.food, config)))
      .map((f) => f.id),
  );
}

/** Gramos de ese macro que aporta un gramo del alimento. */
function densidad(food: Food, macro: 'p' | 'c' | 'f'): number {
  const por100 =
    macro === 'p' ? food.proteinPer100 : macro === 'c' ? food.carbPer100 : food.fatPer100;
  return por100 / 100;
}

/** Macro que ese alimento viene a cerrar en la comida. */
function macroDominante(food: Food, role?: FoodRole): 'p' | 'c' | 'f' {
  const key = primaryMacroOf(role ?? food.role);
  if (key === 'proteinPer100') return 'p';
  if (key === 'fatPer100') return 'f';
  return 'c';
}

/**
 * Resuelve gramos y arregla lo que NO cabe en una porcion de verdad.
 *
 * El solver por si solo estira: si al slot le faltan 40 g de carbohidrato,
 * pide 400 g de arroz; si le sobran, deja 12 g de aguacate. Ninguna de las dos
 * es comida. Aqui se cierran las dos salidas:
 *
 * (a) lo que se queda por debajo de su porcion minima se cae de la comida y el
 *     resto se reparte —salvo que sea el unico que cubre ese macro, en cuyo
 *     caso se sirve en su minimo digno y el sobrante lo absorbe el dia;
 * (b) lo que se pasa de su tope no se estira: entra un SEGUNDO alimento del
 *     mismo rol y se vuelve a resolver.
 */
function ajustarPorciones(
  slots: Slot[],
  target: { p: number; c: number; f: number },
  profile: Profile,
  config: EngineConfig,
  pool: Food[],
  filters: EligibleOptions,
  random: () => number,
  avoid: Set<string>,
): void {
  // Un macro se refuerza a lo mucho dos veces. Sin freno, cada pasada metia
  // otro alimento del mismo rol y la comida terminaba con tres leguminosas: la
  // suma de sus minimos se pasaba del target por mas de lo que faltaba. Lo que
  // falte despues lo cierra la reparacion del dia moviendo gramos.
  const reforzados: Record<'p' | 'c' | 'f', number> = { p: 0, c: 0, f: 0 };
  const MAX_REFUERZOS = 2;

  for (let intento = 0; intento < 4; intento += 1) {
    solveGrams(slots, target, config);
    const movibles = slots.filter((s) => !s.fixed);

    const flaco = movibles.find(
      (s) => (s.raw ?? s.grams) < minGrams(s.food) - roundingFor(s.food, config) / 2,
    );
    if (flaco) {
      const macro = macroDominante(flaco.food, flaco.role);
      const hayRelevo = movibles.some(
        (s) => s !== flaco && macroDominante(s.food, s.role) === macro,
      );
      // Sale si otro alimento cubre su macro, o si su porcion minima se pasa
      // de lo que la comida pide: en keto la avena entra por 6 g de
      // carbohidrato y su media taza trae 10, asi que la comida no la
      // necesita, la padece.
      const seExcede = minGrams(flaco.food) * densidad(flaco.food, macro) > target[macro] * 1.5;
      if (hayRelevo || seExcede) {
        slots.splice(slots.indexOf(flaco), 1);
        continue;
      }
    }

    // (b) el macro que se quedo corto porque su alimento ya toco su tope. No se
    // detecta con los gramos que pidio el solver (vienen ya recortados al
    // tope), sino con lo que falta en el plato: si al carbohidrato le faltan
    // 50 g y el arroz ya va en su taza y cuarto, lo que falta es OTRO
    // carbohidrato, no mas arroz.
    // Se atiende el macro MAS corto que ademas tenga a su alimento topado, no
    // el primero de la lista: si la proteina va corta 3 g pero nadie esta
    // topado, y al carbohidrato le faltan 60 g con el arroz en su taza y
    // cuarto, el que necesita un segundo alimento es el carbohidrato.
    const topadoDe = (macro: 'p' | 'c' | 'f'): Slot | undefined =>
      movibles.find(
        (s) =>
          s.role !== undefined &&
          macroDominante(s.food, s.role) === macro &&
          // `raw` es lo que el solver pidio antes de encajarlo en la medida
          // casera: si pidio el tope, el alimento ya dio todo lo que tenia,
          // aunque el pase de reparacion lo haya dejado por debajo.
          Math.max(s.grams, s.raw ?? 0) >= maxGrams(s.food) - 1e-6,
      );

    const cortos = (['p', 'c', 'f'] as const)
      .filter((macro) => {
        if (target[macro] <= 0 || reforzados[macro] >= MAX_REFUERZOS) return false;
        return target[macro] - sum(slots, macro) > Math.max(target[macro] * 0.12, 3);
      })
      .sort(
        (a, b) =>
          (target[b] - sum(slots, b)) / target[b] - (target[a] - sum(slots, a)) / target[a],
      );

    const faltante = cortos.find((macro) => topadoDe(macro) !== undefined);
    const topado = faltante ? topadoDe(faltante) : undefined;
    if (topado && topado.role && faltante && slots.length < config.maxFoodsPerMeal) {
      const yaEstan = new Set(slots.map((s) => s.food.id));
      const falta = target[faltante] - sum(slots, faltante);
      const clave = primaryMacroOf(topado.role);
      const candidatos = eligible(pool, profile, config, topado.role, {
        ...filters,
        acompanan: slots.map((s) => s.food),
      }).filter(
        // El segundo alimento tiene que CABER en el hueco: si su porcion
        // minima ya se pasa de lo que falta, meterlo cambia un plato corto por
        // uno pasado, y eso no es arreglarlo.
        (f) => !yaEstan.has(f.id) && (minGrams(f) * f[clave]) / 100 <= falta * 1.2,
      );
      // Primero los que ademas ALCANZAN a cerrar el hueco: si uno solo puede,
      // se prefiere a dos a medias.
      // Un refuerzo que rompe el platillo no es refuerzo: la segunda grasa
      // anadida, la tercera taza de frijol.
      const caben = candidatos.filter(
        (f) => !violaComposicion([...slots, { food: f, grams: minGrams(f), fixed: false }], config),
      );
      const alcance = (f: Food): number => (maxGrams(f) * f[clave]) / 100;
      const cubren = caben.filter((f) => alcance(f) >= falta * 0.8);
      // Si ninguno alcanza a cerrar el hueco, se sortea entre los que mas
      // cubren: meter 5 g de ajonjoli cuando faltan 25 g de grasa gasta el
      // refuerzo sin arreglar la comida.
      const mejor = caben.length > 0 ? Math.max(...caben.map(alcance)) : 0;
      const finalistas =
        cubren.length > 0 ? cubren : caben.filter((f) => alcance(f) >= mejor * 0.6);
      const segundo = pick(
        finalistas,
        profile,
        random,
        avoid,
        preferidosDe(finalistas, slots, config),
      );
      if (segundo) {
        reforzados[faltante] += 1;
        slots.push({
          food: segundo,
          grams: minGrams(segundo) || 50,
          fixed: false,
          role: topado.role,
        });
        avoid.add(segundo.id);
        continue;
      }
    }

    return;
  }
}

function buildMeal(
  slot: MealSlot,
  profile: Profile,
  config: EngineConfig,
  random: () => number,
  avoid: Set<string>,
  pool: Food[],
  options: MenuOptions,
  residual: Residual,
): { meal: MenuMeal; slots: Slot[] } {
  const slots: Slot[] = [];
  const periWorkout = slot.id === 'PRE' || slot.id === 'POST';
  const filters: EligibleOptions = { quickOnly: periWorkout, noSupplements: !periWorkout };

  /**
   * Sortea un alimento de ese rol contando con lo que ya esta en el plato: se
   * descartan las combinaciones que no van (avena con arroz) y pesan doble las
   * que si (frijol con tortilla).
   */
  function elegir(
    role: FoodRole,
    key?: 'proteinPer100' | 'carbPer100' | 'fatPer100',
    targetG = 0,
  ): Food | undefined {
    const base = eligible(pool, profile, config, role, {
      ...filters,
      acompanan: slots.map((s) => s.food),
    });
    const candidatos = key ? feasible(base, key, targetG, 10) : base;
    return pick(candidatos, profile, random, avoid, preferidosDe(candidatos, slots, config));
  }

  if (slot.freeVegetables && config.freeVegetableGramsPerMeal > 0) {
    const veg = pick(
      eligible(pool, profile, config, 'vegetal_libre', { freeVegetable: true }),
      profile,
      random,
      avoid,
    );
    if (veg) {
      slots.push({ food: veg, grams: config.freeVegetableGramsPerMeal, fixed: true });
      avoid.add(veg.id);
    }
  }

  /**
   * Carbohidrato minimo para que valga la pena poner un carbohidrato.
   *
   * Ningun cereal ni leguminosa baja de ~10 g de carbohidrato en su porcion
   * minima: media taza de arroz son 28. Meterlos en un slot que pide 3 g
   * —la comida de una keto— no cubre nada, se come el presupuesto del dia
   * entero y ademas se ve absurdo en el plato.
   */
  const CARBO_MINIMO_DEL_SLOT = 15;
  const vaCarbohidrato = slot.allowDenseCarb && slot.carbG >= CARBO_MINIMO_DEL_SLOT;

  if (slot.id === 'PRE' && vaCarbohidrato && !options.simplify) {
    const fruit = elegir('fruta');
    if (fruit) {
      // La fruta del pre-entreno va fija, pero fija en una porcion de verdad:
      // una pieza o una taza, no los 100 g de relleno de antes.
      slots.push({
        food: fruit,
        grams: quantize(fruit.servingG ?? 100, fruit, config),
        fixed: true,
        role: 'fruta',
      });
      avoid.add(fruit.id);
    }
  }

  const wantsFat = slot.fatG > 0;
  // Cuando la comida pide tanta grasa como proteina —keto, sobre todo—, la
  // grasa tiene que venir tambien de la proteina: el salmon y el huevo la
  // traen adentro. Buscarla toda en aceites choca contra el tope de una
  // cucharada de grasa anadida por comida.
  const grasaProtagonista = slot.fatG >= slot.proteinG;
  const probaProteinaGrasa = grasaProtagonista ? 0.8 : 0.35;
  const proteinRole: FoodRole =
    wantsFat && random() < probaProteinaGrasa ? 'proteina_grasa' : 'proteina_magra';
  const protein =
    elegir(proteinRole, 'proteinPer100', slot.proteinG) ??
    elegir('proteina_magra', 'proteinPer100', slot.proteinG);
  if (protein) {
    slots.push({ food: protein, grams: 100, fixed: false, role: protein.role });
    avoid.add(protein.id);
  }

  if (vaCarbohidrato) {
    const carbRole = slotCarbRole(slot.id);
    const carbTarget = slot.carbG - (slot.id === 'PRE' ? 20 : 0);
    const carb = elegir(carbRole, 'carbPer100', carbTarget);
    if (carb) {
      slots.push({ food: carb, grams: 100, fixed: false, role: carbRole });
      avoid.add(carb.id);
    }
  }

  if (wantsFat) {
    const fat = elegir('grasa', 'fatPer100', slot.fatG);
    if (fat) {
      slots.push({ food: fat, grams: minGrams(fat) || 15, fixed: false, role: 'grasa' });
      avoid.add(fat.id);
    }
  }

  // El residual arrastra lo que las comidas anteriores se pasaron o se quedaron
  // cortas (p. ej. la grasa que traen la avena o el pollo del pre-entreno).
  const cap = (targetG: number, carry: number): number =>
    Math.min(Math.max(0, targetG - carry), targetG * 1.8 + 5);
  const effective = {
    p: cap(slot.proteinG, residual.p),
    c: cap(slot.carbG, residual.c),
    f: cap(slot.fatG, residual.f),
  };
  ajustarPorciones(slots, effective, profile, config, pool, filters, random, avoid);

  const kept = slots.filter((s) => s.grams > 0);
  const items = kept.map((s) => toItem(s, s.fixed && s.food.role === 'vegetal_libre'));

  const totals = items.reduce<MacroTargets>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteinG: round1(acc.proteinG + item.proteinG),
      carbG: round1(acc.carbG + item.carbG),
      fatG: round1(acc.fatG + item.fatG),
      fiberG: round1(acc.fiberG + item.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );

  residual.p += totals.proteinG - slot.proteinG;
  residual.c += totals.carbG - slot.carbG;
  residual.f += totals.fatG - slot.fatG;

  return {
    meal: {
      slot: slot.id,
      label: slot.label,
      timeHint: slot.timeHint,
      items,
      equivalences: [],
      totals,
      target: {
        kcal: slot.kcal,
        proteinG: slot.proteinG,
        carbG: slot.carbG,
        fatG: slot.fatG,
        fiberG: 0,
      },
    },
    slots,
  };
}

/** Reconstruye items y totales de una comida a partir de sus gramos. */
function refreshMeal(meal: MenuMeal, slots: Slot[], pool: Food[], profile: Profile, config: EngineConfig): void {
  const kept = slots.filter((s) => s.grams > 0);
  meal.items = kept.map((s) => toItem(s, s.fixed && s.food.role === 'vegetal_libre'));
  meal.equivalences = kept
    .map((s) => equivalencesFor(s, pool, profile, config))
    .filter((e): e is Equivalence => e !== null);
  meal.totals = meal.items.reduce<MacroTargets>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteinG: round1(acc.proteinG + item.proteinG),
      carbG: round1(acc.carbG + item.carbG),
      fatG: round1(acc.fatG + item.fatG),
      fiberG: round1(acc.fiberG + item.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );
}

/**
 * Reparacion a nivel dia: ajusta gramos en pasos del redondeo del alimento
 * hasta que los macros del menu completo caen lo mas cerca posible del target.
 */
function repairDay(
  comidas: Slot[][],
  target: { p: number; c: number; f: number },
  config: EngineConfig,
  contexto?: {
    profile: Profile;
    pool: Food[];
    filtersPorComida: EligibleOptions[];
  },
): void {
  for (const comida of comidas) aplicarComposicion(comida, config);
  moverGramos(comidas, target, config);
  podarSobrantes(comidas, target);
  moverGramos(comidas, target, config);

  // Si el dia sigue fuera de tolerancia, ya no es cuestion de gramos: es que
  // un alimento no era el adecuado. Cambiarlo por otro de su mismo rol es el
  // ultimo recurso, y solo se usa aqui —si se usara siempre, todos los menus
  // convergerian al mismo alimento "optimo" y se acabaria la variedad que el
  // sorteo determinista existe para dar.
  if (contexto && fueraDeTolerancia(comidas.flat(), target)) {
    sustituirAlimentos(comidas, target, config, contexto);
    moverGramos(comidas, target, config);
  }

  for (const comida of comidas) aplicarComposicion(comida, config);
}

function fueraDeTolerancia(all: Slot[], target: { p: number; c: number; f: number }): boolean {
  return (['p', 'c', 'f'] as const).some(
    (macro) => target[macro] > 0 && Math.abs(sum(all, macro) - target[macro]) / target[macro] > 0.02,
  );
}

/**
 * Cambia un alimento por otro de su mismo rol cuando eso acerca el dia al
 * target. El caso real: el refuerzo de carbohidrato metio una leguminosa, que
 * ademas trae 8 g de proteina, y el dia termino con proteina de mas que no se
 * puede quitar porque el pollo ya va en su porcion minima. Cambiar la lenteja
 * por arroz cierra el carbohidrato sin la proteina de pilon.
 */
function sustituirAlimentos(
  comidas: Slot[][],
  target: { p: number; c: number; f: number },
  config: EngineConfig,
  contexto: { profile: Profile; pool: Food[]; filtersPorComida: EligibleOptions[] },
): void {
  const all = comidas.flat();
  for (let i = 0; i < comidas.length; i += 1) {
    const comida = comidas[i] ?? [];
    const filters = contexto.filtersPorComida[i] ?? {};
    for (const slot of comida) {
      if (slot.fixed || !slot.role) continue;
      const yaEstan = new Set(comida.map((s) => s.food.id));
      // La proteina magra y la grasa son la misma familia para sustituir: en
      // keto la diferencia entre la tilapia y el salmon es justo la grasa que
      // le falta al dia, y obligarse a quedarse en el mismo rol deja fuera la
      // unica sustitucion que sirve.
      const rolesHermanos: FoodRole[] = slot.role.startsWith('proteina')
        ? ['proteina_magra', 'proteina_grasa']
        : [slot.role];
      const acompanan = comida.filter((s) => s !== slot).map((s) => s.food);
      const candidatos = rolesHermanos
        .flatMap((role) =>
          eligible(contexto.pool, contexto.profile, config, role, { ...filters, acompanan }),
        )
        .filter((f) => !yaEstan.has(f.id));

      const original = { food: slot.food, grams: slot.grams };
      let mejorError = error(all, target);
      let mejor = original;

      for (const food of candidatos) {
        slot.food = food;
        for (const grams of porcionesPosibles(food, config)) {
          slot.grams = grams;
          if (violaComposicion(comida, config)) continue;
          const candidato = error(all, target);
          if (candidato < mejorError - 1e-9) {
            mejorError = candidato;
            mejor = { food, grams };
          }
        }
      }

      slot.food = mejor.food;
      slot.grams = mejor.grams;
    }
  }
}

/** Todas las porciones legales de un alimento, de su minimo a su tope. */
function porcionesPosibles(food: Food, config: EngineConfig): number[] {
  const paso = roundingFor(food, config);
  const min = Math.max(minGrams(food), paso);
  const max = maxGrams(food);
  const salida: number[] = [];
  for (let grams = min; grams <= max + 1e-6; grams += paso) salida.push(grams);
  return salida;
}

/**
 * Quita el alimento que sobra.
 *
 * Cuando el refuerzo de una comida se pasa —la segunda leguminosa que ya no
 * hacia falta—, moverle gramos no lo arregla: su porcion minima ya es mas de
 * lo que faltaba. La unica reparacion honesta es sacarlo, y solo se saca si
 * su macro se queda cubierto por otro alimento de la misma comida.
 */
function podarSobrantes(comidas: Slot[][], target: { p: number; c: number; f: number }): void {
  for (const comida of comidas) {
    for (const slot of [...comida]) {
      if (slot.fixed) continue;
      const macro = macroDominante(slot.food, slot.role);
      const hayRelevo = comida.some(
        (s) => s !== slot && !s.fixed && macroDominante(s.food, s.role) === macro,
      );
      if (!hayRelevo) continue;

      const antes = error(comidas.flat(), target);
      const donde = comida.indexOf(slot);
      comida.splice(donde, 1);

      // Quitarlo tiene que mejorar el dia SIN abrir un hueco en su propio
      // macro: el error pesa la proteina el doble, asi que sin este freno
      // sacaba la lenteja —que sobraba de proteina— y dejaba la comida 40 %
      // corta de carbohidrato, que es peor de lo que arreglaba.
      const despues = comidas.flat();
      const faltaSuMacro =
        target[macro] > 0 && (target[macro] - sum(despues, macro)) / target[macro] > 0.05;
      if (error(despues, target) >= antes || faltaSuMacro) comida.splice(donde, 0, slot);
    }
  }
}

function moverGramos(
  comidas: Slot[][],
  target: { p: number; c: number; f: number },
  config: EngineConfig,
): void {
  const all = comidas.flat();
  const movable = all
    .filter((s) => !s.fixed && s.grams > 0)
    .map((slot) => ({ slot, comida: comidas.find((c) => c.includes(slot)) ?? [] }));

  // Busqueda exhaustiva por alimento, no a pasitos: con medida casera cada
  // alimento tiene POCAS porciones legales (de media taza a taza y cuarto son
  // cuatro valores), asi que probarlas todas cuesta lo mismo que tantear y no
  // se queda atorada en el primer minimo local, que es lo que dejaba el dia
  // 5 % arriba de proteina con las claras servidas en su minimo.
  for (let pass = 0; pass < 12; pass += 1) {
    let improved = false;
    for (const { slot, comida } of movable) {
      let mejorGramos = slot.grams;
      let mejor = error(all, target);
      const original = slot.grams;
      for (const grams of porcionesPosibles(slot.food, config)) {
        slot.grams = grams;
        // Cerrar el macro pasandose de taza y media de arroz no cierra nada:
        // deja un plato que no se sirve asi.
        if (violaComposicion(comida, config)) continue;
        const candidato = error(all, target);
        if (candidato < mejor - 1e-9) {
          mejor = candidato;
          mejorGramos = grams;
        }
      }
      slot.grams = mejorGramos;
      if (mejorGramos !== original) improved = true;
    }
    if (!improved) break;
  }
}

function buildMenu(
  id: 1 | 2,
  slots: MealSlot[],
  profile: Profile,
  config: EngineConfig,
  seed: number,
  pool: Food[],
  options: MenuOptions,
  target: MacroTargets,
): Menu {
  const random = rng(seed);
  const avoid = new Set<string>();
  const residual: Residual = { p: 0, c: 0, f: 0 };
  const built = slots.map((slot) =>
    buildMeal(slot, profile, config, random, avoid, pool, options, residual),
  );
  repairDay(
    built.map((b) => b.slots),
    { p: target.proteinG, c: target.carbG, f: target.fatG },
    config,
    {
      profile,
      pool,
      filtersPorComida: slots.map((slot) => ({
        quickOnly: slot.id === 'PRE' || slot.id === 'POST',
        noSupplements: !(slot.id === 'PRE' || slot.id === 'POST'),
      })),
    },
  );
  // Los gramos se cierran a entero ANTES de pintar: media cucharadita son 2.5
  // g y la pantalla no muestra decimales. Si el motor se queda con 7.5 y la
  // pantalla dice 8, las equivalencias se calculan contra una porcion que
  // nadie ve y salen desviadas de lo que promete la app.
  for (const b of built) {
    for (const s of b.slots) s.grams = Math.round(s.grams);
  }
  const meals = built.map((b) => b.meal);
  for (const b of built) refreshMeal(b.meal, b.slots, pool, profile, config);
  const totals = meals.reduce<MacroTargets>(
    (acc, meal) => ({
      kcal: acc.kcal + meal.totals.kcal,
      proteinG: round1(acc.proteinG + meal.totals.proteinG),
      carbG: round1(acc.carbG + meal.totals.carbG),
      fatG: round1(acc.fatG + meal.totals.fatG),
      fiberG: round1(acc.fiberG + meal.totals.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );
  const dev = (got: number, want: number): number =>
    want === 0 ? 0 : round1(((got - want) / want) * 100);
  return {
    id,
    label: `Menu ${id}`,
    meals,
    totals,
    deviationPct: {
      kcal: dev(totals.kcal, target.kcal),
      proteinG: dev(totals.proteinG, target.proteinG),
      carbG: dev(totals.carbG, target.carbG),
      fatG: dev(totals.fatG, target.fatG),
    },
  };
}

/**
 * La lista de super de los menus que se vayan a cocinar de verdad.
 *
 * `daysPerMenu` es cuantos dias se come CADA menu de los que se pasan: dos
 * menus repartidos en la semana son 3.5 dias cada uno, pero quien decide
 * cocinar uno solo lo come los 7. Por eso quien llama decide ambas cosas
 * —cuales menus y cuantos dias— en vez de que el motor asuma que siempre son
 * los dos: comprar para un menu que no se va a cocinar es tirar comida.
 */
export function listaDeSuper(
  menus: Menu[],
  diasPorMenu: number,
  pool: Food[] = FOODS,
): ShoppingItem[] {
  return shoppingList(menus, pool, diasPorMenu);
}

function shoppingList(menus: Menu[], pool: Food[], daysPerMenu: number): ShoppingItem[] {
  const acc = new Map<string, ShoppingItem>();
  for (const menu of menus) {
    for (const meal of menu.meals) {
      for (const item of meal.items) {
        // Un alimento intercambiado por una equivalencia puede venir SIN
        // `foodId` (los menus guardados antes de que el intercambio lo
        // conservara). Agrupar por `undefined` metia a todos esos alimentos
        // en la misma cubeta: la lista salia con seis renglones y sumas
        // imposibles —"Yogur 13 440 g"— porque el yogur cargaba tambien con
        // el pavo, el frijol y las tostadas. El nombre es la llave de
        // respaldo, que es justo lo que distingue un alimento de otro cuando
        // el id se perdio.
        const food =
          pool.find((f) => f.id === item.foodId) ??
          pool.find((f) => normalize(f.name) === normalize(item.name));

        // La llave sale del alimento resuelto, no del id que traiga el JSON:
        // asi el MISMO alimento con id (como lo genero el motor) y sin id
        // (como quedo tras un intercambio) cae en el mismo renglon en vez de
        // aparecer dos veces. Solo si no esta en el catalogo se usa su nombre.
        const clave = food?.id ?? normalize(item.name);

        const grams = item.grams * daysPerMenu;
        const existing = acc.get(clave);
        if (existing) {
          existing.grams += grams;
        } else {
          acc.set(clave, {
            foodId: item.foodId ?? food?.id ?? clave,
            name: item.name,
            grams,
            // Los gramos acumulados son gramos: etiquetarlos con la unidad de
            // servicio del alimento imprimia "Naranja - 1260 pieza". Las
            // piezas las calcula quien pinta la lista, desde los gramos.
            unit: 'g',
            costRel: food?.costRel ?? 2,
          });
        }
      }
    }
  }
  return [...acc.values()]
    .map((i) => ({ ...i, grams: roundTo(i.grams, 5) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Genera los dos menus de la semana (mismos macros, alimentos distintos),
 * sus equivalencias y la lista de super.
 * `seed` es quincenal: mismo seed -> mismo menu; cambia cada 2 semanas.
 */
export function generateMenu(
  slots: MealSlot[],
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
  seed = 1,
  options: MenuOptions = {},
  pool: Food[] = FOODS,
): MenuPlan {
  const target = slots.reduce<MacroTargets>(
    (acc, slot) => ({
      kcal: acc.kcal + slot.kcal,
      proteinG: acc.proteinG + slot.proteinG,
      carbG: acc.carbG + slot.carbG,
      fatG: acc.fatG + slot.fatG,
      fiberG: 0,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );

  // `menu_fijo`: un solo menu para los siete dias. No se genera el segundo y
  // el primero se copia tal cual, para que la app siga leyendo dos menus sin
  // enterarse; la lista de super compra ese unico menu los dias completos, no
  // la mitad de cada uno.
  const fijo = profile.diet === 'menu_fijo';
  const menu1 = buildMenu(1, slots, profile, config, seed, pool, options, target);
  if (fijo) menu1.label = 'Menu de la semana';
  const menu2 = fijo
    ? { ...menu1, id: 2 as const }
    : buildMenu(2, slots, profile, config, seed * 7919 + 13, pool, options, target);
  const daysPerMenu = options.daysPerMenu ?? 3.5;

  const notas: string[] = [
    'Los vegetales verdes son libres: puedes comer mas de los que indica el menu.',
    'Las equivalencias son intercambios del mismo rol; usa los gramos indicados.',
  ];
  if (options.phase === 'CUT_AGRESIVO') {
    notas.push('Comida y cena van sin carbohidrato denso.');
    notas.push('Protocolo de electrolitos: salar bien las comidas o agua mineral con sal y limon.');
  }
  if (profile.conditions?.glucosaAlta) {
    notas.push('Carbohidratos densos limitados a indice glucemico bajo.');
  }
  if (options.simplify) {
    notas.push('Menu simplificado: menos ingredientes y mas repeticion.');
  }
  if (fijo) {
    notas.push('Menu fijo: el mismo menu los siete dias. La lista de super ya viene por semana.');
  }

  return {
    seed,
    target,
    menus: [menu1, menu2],
    shoppingList: fijo
      ? shoppingList([menu1], pool, daysPerMenu * 2)
      : shoppingList([menu1, menu2], pool, daysPerMenu),
    notas,
  };
}

/** Solo para pruebas: piezas internas que no forman parte del API del motor. */
export const __testing = { describirPorcion };
