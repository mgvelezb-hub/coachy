import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Dónde ibas en la sesión, para que salir de la app no la reinicie.
 *
 * EL PROBLEMA: abrir el video de la técnica —o contestar un mensaje— desmonta
 * la pantalla. Las series ya cerradas se recuperaban del borrador, pero el
 * resto no: en qué serie ibas, el descanso corriendo y lo que tenías tecleado
 * se perdían, y la sesión parecía arrancar de cero a media rutina.
 *
 * Lo que se guarda es solo el CURSOR, no los datos de las series: esos viven
 * en el borrador que ya se sincroniza con el servidor. Aquí no hay nada que
 * no se pueda perder sin consecuencias — por eso todo falla en silencio.
 *
 * El descanso se guarda como HORA DE TÉRMINO, no como segundos restantes: si
 * el teléfono estuvo cinco minutos en otra app, al volver el descanso ya se
 * acabó, y eso es exactamente lo que hay que mostrar.
 */

const LLAVE = "holygains.sesion.encurso";

export type SesionEnCurso = {
  workoutId: string;
  ejercicioActual: number;
  serieActual: number;
  /** Milisegundos epoch. `null` = no estaba descansando. */
  descansoHasta: number | null;
  /** Lo tecleado y todavía no cerrado. */
  reps: number;
  pesoKg: number | null;
};

export async function guardaSesionEnCurso(estado: SesionEnCurso): Promise<void> {
  try {
    await AsyncStorage.setItem(LLAVE, JSON.stringify(estado));
  } catch {
    // Perder el cursor solo cuesta volver a ubicarse; no vale romper nada.
  }
}

/**
 * Lo guardado, SOLO si es de esta misma sesión. Abrir otra rutina no hereda
 * el cursor de la anterior.
 */
export async function leeSesionEnCurso(workoutId: string): Promise<SesionEnCurso | null> {
  try {
    const crudo = await AsyncStorage.getItem(LLAVE);
    if (!crudo) return null;

    const leido = JSON.parse(crudo) as Partial<SesionEnCurso>;
    if (leido.workoutId !== workoutId) return null;
    if (typeof leido.ejercicioActual !== "number" || typeof leido.serieActual !== "number") {
      return null;
    }

    return {
      workoutId,
      ejercicioActual: leido.ejercicioActual,
      serieActual: leido.serieActual,
      descansoHasta: typeof leido.descansoHasta === "number" ? leido.descansoHasta : null,
      reps: typeof leido.reps === "number" ? leido.reps : 0,
      pesoKg: typeof leido.pesoKg === "number" ? leido.pesoKg : null,
    };
  } catch {
    return null;
  }
}

/** Se llama al cerrar la sesión: lo guardado ya no describe nada. */
export async function olvidaSesionEnCurso(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LLAVE);
  } catch {
    // Sin consecuencias: `leeSesionEnCurso` filtra por workoutId.
  }
}
