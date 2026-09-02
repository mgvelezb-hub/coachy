import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Qué ya cayó al carrito en la lista de súper — vive en el teléfono, nunca en
 * el servidor.
 *
 * EL CASO REAL: a media compra, con el carrito medio lleno, ya no se sabía
 * qué faltaba y qué no — había que releer la lista completa de arriba a
 * abajo cada vez para no comprar dos veces lo mismo o dejar algo fuera. Aquí
 * se toca un artículo, se marca como comprado y la pantalla lo hunde al
 * fondo; lo que falta se queda siempre arriba.
 *
 * Se guardan los NOMBRES marcados, no índices ni posiciones: la lista de
 * súper se puede regenerar entre semanas (otro menú, otras cantidades) y un
 * nombre que ya no existe en la lista actual simplemente deja de aplicar —
 * no hay nada que limpiar a mano ni un índice que apunte al artículo
 * equivocado.
 */

const LLAVE = "holygains.super.compradas";

/** Nombres marcados como comprados. Si no hay nada guardado o es ilegible, lista vacía. */
export async function leeComprados(): Promise<string[]> {
  try {
    const crudo = await AsyncStorage.getItem(LLAVE);
    if (!crudo) return [];
    const leido: unknown = JSON.parse(crudo);
    if (!Array.isArray(leido)) return [];
    return leido.filter((nombre): nombre is string => typeof nombre === "string");
  } catch {
    // Una lista ilegible no debe romper el súper a medio camino: se empieza de cero.
    return [];
  }
}

export async function guardaComprados(nombres: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LLAVE, JSON.stringify(nombres));
  } catch {
    // Si no se pudo guardar, la sesión sigue en memoria hasta que se cierre la app.
  }
}
