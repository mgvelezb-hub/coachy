import AsyncStorage from "@react-native-async-storage/async-storage";

import { postComidaLog } from "@/lib/api";

/**
 * La cola de respuestas de comida que todavía no llegaron al servidor.
 *
 * Existe porque el momento en que se contesta es el peor momento posible para
 * depender de la red: se contesta desde la notificación —a veces desde el
 * reloj, a veces con la app cerrada, a veces en un restaurante sin señal— y
 * una respuesta que se pierde ahí es peor que no haber preguntado. La app
 * quedaría diciendo "no contestada" para una comida que sí se contestó, y el
 * apego se calcula justo sobre lo contestado.
 *
 * Se guarda primero y se manda después. El servidor recibe la misma comida dos
 * veces sin problema: `POST /meals/log` es un upsert por fecha y slot.
 */

const LLAVE = "holygains.comidas.pendientes";

export type MotivoSalto = "sin_hambre" | "sin_tiempo" | "comi_otra_cosa";

export type RespuestaComida = {
  date: string;
  slot: string;
  taken: boolean;
  /** Hora planeada ese día ("14:30"), para que el aprendizaje mida el desfase. */
  plannedAt?: string;
  /** Cuándo se comió de verdad, ISO completo. */
  takenAt?: string;
  skipped?: MotivoSalto;
};

async function leer(): Promise<RespuestaComida[]> {
  const crudo = await AsyncStorage.getItem(LLAVE).catch(() => null);
  if (!crudo) return [];
  try {
    const valor = JSON.parse(crudo);
    return Array.isArray(valor) ? (valor as RespuestaComida[]) : [];
  } catch {
    return [];
  }
}

async function escribir(cola: RespuestaComida[]): Promise<void> {
  await AsyncStorage.setItem(LLAVE, JSON.stringify(cola)).catch(() => {});
}

/**
 * Guarda la respuesta e intenta mandarla.
 *
 * El orden importa: primero al disco, después a la red. Al revés, un cierre de
 * la app entre una cosa y la otra se lleva la respuesta.
 */
export async function responderComida(respuesta: RespuestaComida): Promise<void> {
  const cola = await leer();

  // La última respuesta manda: contestar "sí" y corregir a "no" dos minutos
  // después debe dejar una sola entrada, la buena.
  const limpia = cola.filter(
    (item) => !(item.date === respuesta.date && item.slot === respuesta.slot),
  );
  await escribir([...limpia, respuesta]);

  await drenarComidas();
}

/**
 * Manda lo que quedó pendiente. Se llama al contestar y al abrir la app.
 *
 * Lo que falla se queda en la cola; lo que se logró sale. Un fallo no detiene
 * a los demás: una respuesta vieja con un problema propio no puede secuestrar
 * a las nuevas.
 */
export async function drenarComidas(): Promise<number> {
  const cola = await leer();
  if (cola.length === 0) return 0;

  const quedan: RespuestaComida[] = [];
  let enviadas = 0;

  for (const respuesta of cola) {
    try {
      await postComidaLog(respuesta);
      enviadas += 1;
    } catch {
      quedan.push(respuesta);
    }
  }

  await escribir(quedan);
  return enviadas;
}

/** Cuántas respuestas siguen esperando señal. */
export async function comidasPendientes(): Promise<number> {
  return (await leer()).length;
}
