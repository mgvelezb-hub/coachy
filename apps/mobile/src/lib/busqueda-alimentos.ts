/**
 * Buscar comida como se escribe con prisa.
 *
 * El servidor manda con cada alimento sus `busqueda`: los términos del motor
 * —nombre, id, tags y sinónimos, ya sin acentos ni plurales—. Aquí solo hay
 * que normalizar igual lo que se teclea y comparar por prefijo, y así
 * "Yogurt Griego" encuentra el "Yogur griego natural 0%" sin bajar la tabla
 * de sinónimos a la app ni pedir al servidor una búsqueda por cada tecla.
 */

/** Sin acentos y en minúsculas: se busca como se escribe con prisa. */
export function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Plural simple al singular. No toca las palabras cortas: "res" no es "re". */
function singular(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

/** Las palabras útiles de lo que se escribió. */
export function palabrasDe(texto: string): string[] {
  return normaliza(texto)
    .replace(/[^a-z0-9%\s_]/g, " ")
    .split(/[\s_]+/)
    .filter((palabra) => palabra.length > 1)
    .map(singular);
}

export interface Buscable {
  nombre: string;
  /** Términos del motor. Sin ellos se busca contra el nombre, como antes. */
  busqueda?: string[];
}

/**
 * true si el alimento responde a esa búsqueda. Cada palabra escrita tiene que
 * aparecer: "yogurt griego" no devuelve todos los yogures.
 */
export function coincide(alimento: Buscable, consulta: string): boolean {
  const palabras = palabrasDe(consulta);
  if (palabras.length === 0) return true;

  const terminos =
    alimento.busqueda && alimento.busqueda.length > 0
      ? alimento.busqueda
      : palabrasDe(alimento.nombre);

  return palabras.every((palabra) => terminos.some((termino) => termino.startsWith(palabra)));
}
