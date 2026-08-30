import { FOODS, normalize } from "engine";

/**
 * Gramos a la unidad en que se compra y se sirve el alimento.
 *
 * "Tortilla de maíz — 90 g" obliga a hacer una división mental para saber si
 * son tres tortillas o media docena; y nadie pesa una tortilla. Once alimentos
 * del catálogo se venden por pieza —huevo, tortilla, tostada, manzana,
 * plátano, naranja, toronja, pera, durazno, tortilla de nopal— y para esos la
 * unidad natural es la pieza.
 *
 * Los gramos NO desaparecen: siguen siendo la cifra con la que trabaja el
 * motor y la que se muestra al lado. Lo que cambia es cuál se lee primero.
 *
 * Media pieza se dice "1½", no "1.5": así es como alguien parte una tortilla.
 */

/**
 * Piezas, redondeadas a la media más cercana.
 *
 * Nadie corta un tercio de huevo ni cuenta 2.75 tortillas: la media pieza es
 * la fracción real con la que la gente sirve, y es el único denominador que
 * hace falta.
 */
function formatoPiezas(cantidad: number): string | null {
  const medias = Math.round(cantidad * 2) / 2;
  if (medias <= 0) return null;

  const entero = Math.floor(medias);
  const hayMedia = medias - entero >= 0.5;

  if (entero === 0) return "½";
  return hayMedia ? `${entero}½` : `${entero}`;
}

/**
 * Plural en español de la primera palabra del alimento.
 *
 * Solo la primera: el nombre del catálogo es "Tortilla de maíz", y lo que se
 * pluraliza es "tortilla", no la frase entera. La regla de la `z` está aparte
 * porque es la que produce el error que se nota —"maizs"— si se ignora.
 */
function pluralizar(palabra: string): string {
  if (/[aeiouáéíóú]$/i.test(palabra)) return `${palabra}s`;
  if (/z$/i.test(palabra)) return `${palabra.slice(0, -1)}ces`;
  return `${palabra}es`;
}

/** "3 tortillas de maíz": se pluraliza el sustantivo, no la frase. */
function nombreEnCantidad(nombre: string, cantidad: string): string {
  const [primera, ...resto] = nombre.toLowerCase().split(" ");
  const singular = cantidad === "1" || cantidad === "½";
  const cabeza = singular ? primera! : pluralizar(primera!);
  return [cabeza, ...resto].join(" ");
}

/**
 * La porción en unidades naturales, o `null` si ese alimento se pesa.
 *
 * Devuelve el texto listo para pintar: "3 tortillas de maíz", "2 huevos".
 */
export function porcionNatural(nombreAlimento: string, gramos: number): string | null {
  if (gramos <= 0) return null;

  const objetivo = normalize(nombreAlimento);
  const alimento = FOODS.find((food) => normalize(food.name) === objetivo);
  if (!alimento || alimento.unit !== "pieza" || !alimento.servingG) return null;

  const cantidad = formatoPiezas(gramos / alimento.servingG);
  if (cantidad === null) return null;

  return `${cantidad} ${nombreEnCantidad(alimento.name, cantidad)}`;
}
