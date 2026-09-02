/**
 * Kilos y libras — conversión y pasos de ajuste.
 *
 * La app SIEMPRE guarda kilos: el servidor, la progresión y el volumen están
 * en kilos, y convertir en la frontera es lo que evita que una sesión quede
 * capturada en la unidad equivocada. Las libras son una capa de presentación,
 * para quien lee los discos en libras y no quiere hacer la cuenta.
 *
 * El paso de ajuste vive aquí y no en la pantalla porque depende de la
 * unidad: 2.5 kg es un salto razonable en una barra, 2.5 lb no es ni un disco
 * chico. Y hay ejercicios —mancuernas, poleas— donde el salto real es de
 * medio kilo, así que el paso se elige.
 */

export const UNIDADES = ["kg", "lb"] as const;
export type UnidadDePeso = (typeof UNIDADES)[number];

const LIBRAS_POR_KILO = 2.2046226218;

/** Kilos → la unidad que se está mostrando. */
export function aUnidad(kilos: number, unidad: UnidadDePeso): number {
  return unidad === "kg" ? kilos : kilos * LIBRAS_POR_KILO;
}

/** Lo que la persona ve → kilos, que es lo único que se guarda. */
export function aKilos(valor: number, unidad: UnidadDePeso): number {
  return unidad === "kg" ? valor : valor / LIBRAS_POR_KILO;
}

/**
 * Los pasos que ofrece cada unidad.
 *
 * En kilos: medio kilo para mancuernas y poleas, uno para ajustes finos, dos
 * y medio que es el disco de siempre. En libras: los discos reales del
 * gimnasio (2.5, 5, 10 lb).
 */
export function pasosDe(unidad: UnidadDePeso): number[] {
  return unidad === "kg" ? [0.5, 1, 2.5, 5] : [1, 2.5, 5, 10];
}

/**
 * El número como se escribe: sin decimales cuando es redondo, con uno cuando
 * no. "62.5", "60", "137.8" — nunca "60.0" ni "137.78901".
 */
export function formatoPeso(valor: number): string {
  const redondeado = Math.round(valor * 10) / 10;
  return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
}

/**
 * Suma un paso al peso mostrado y regresa KILOS.
 *
 * La suma se hace en la unidad que se está viendo —si subes de 135 a 140 lb,
 * quieres exactamente 140— y solo entonces se convierte. Sumar en kilos y
 * convertir daría 139.99 en pantalla.
 */
export function ajustaPeso(
  kilos: number | null,
  paso: number,
  unidad: UnidadDePeso,
): number {
  const mostrado = aUnidad(kilos ?? 0, unidad);
  // Se cuadra al múltiplo del paso: quien viene de 63 kg y sube de 2.5 en 2.5
  // espera 65, no 65.5.
  const siguiente = Math.round((mostrado + paso) / paso) * paso;
  return aKilos(Math.max(0, siguiente), unidad);
}
