import AsyncStorage from "@react-native-async-storage/async-storage";

import { UNIDADES, type UnidadDePeso } from "@/lib/peso";

/**
 * Cómo prefiere capturar el peso esta persona: en kilos o libras, y de cuánto
 * en cuánto.
 *
 * Vive en el teléfono y no en el perfil del servidor porque es una preferencia
 * de captura, no un dato del plan: cambia con el gimnasio al que va (los
 * discos de uno están en libras y los del otro en kilos) y tiene que
 * responder al instante, sin red de por medio. Lo que SÍ se guarda en el
 * servidor son kilos, siempre.
 */

const LLAVE = "holygains.sesion.peso";

export type PreferenciaDePeso = {
  unidad: UnidadDePeso;
  /** El salto de los botones ±, en la unidad elegida. */
  paso: number;
};

const POR_DEFECTO: PreferenciaDePeso = { unidad: "kg", paso: 2.5 };

export async function leePreferenciaDePeso(): Promise<PreferenciaDePeso> {
  try {
    const crudo = await AsyncStorage.getItem(LLAVE);
    if (!crudo) return POR_DEFECTO;

    const leido = JSON.parse(crudo) as Partial<PreferenciaDePeso>;
    const unidad = UNIDADES.includes(leido.unidad as UnidadDePeso)
      ? (leido.unidad as UnidadDePeso)
      : POR_DEFECTO.unidad;
    const paso = typeof leido.paso === "number" && leido.paso > 0 ? leido.paso : POR_DEFECTO.paso;
    return { unidad, paso };
  } catch {
    // Una preferencia ilegible no vale una pantalla rota a media sesión.
    return POR_DEFECTO;
  }
}

export async function guardaPreferenciaDePeso(preferencia: PreferenciaDePeso): Promise<void> {
  try {
    await AsyncStorage.setItem(LLAVE, JSON.stringify(preferencia));
  } catch {
    // Si no se pudo guardar, la sesión sigue: se vuelve al default la próxima.
  }
}
