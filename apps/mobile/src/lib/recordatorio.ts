import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * El recordatorio del check-in.
 *
 * Es una notificación **local**: la programa el teléfono y se dispara sola,
 * sin servidor de por medio. Eso importa por dos razones — funciona con una
 * cuenta de desarrollador gratuita (el push desde servidor necesita APNs, que
 * es de pago) y funciona sin señal, porque la hora del cierre de semana se
 * conoce de antemano y no hace falta que nadie avise nada.
 *
 * Solo hay una programada a la vez: cambiar el día o la hora cancela la
 * anterior. Sin eso, cada cambio dejaría una notificación huérfana repitiendo
 * el día viejo para siempre.
 */

export const RECORDATORIO_ID = "checkin-semanal";

export const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

/** Pide permiso de notificaciones. `false` si no se pudo o lo negaron. */
export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const actual = await Notifications.getPermissionsAsync().catch(() => null);
  if (actual?.granted) return true;

  const pedido = await Notifications.requestPermissionsAsync().catch(() => null);
  return Boolean(pedido?.granted);
}

/**
 * Deja programado el recordatorio semanal, o lo quita si falta día u hora.
 *
 * `weekday` de expo va de 1 (domingo) a 7 (sábado), mientras que el perfil lo
 * guarda de 0 a 6 como `Date.getDay()`. La conversión vive aquí y en un solo
 * lugar: es el clásico error de un día de corrimiento.
 */
export async function programarRecordatorio(
  weekday: number | null,
  hour: number | null,
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  await Notifications.cancelScheduledNotificationAsync(RECORDATORIO_ID).catch(() => {});
  if (weekday === null || hour === null) return false;

  if (!(await pedirPermisoNotificaciones())) return false;

  await Notifications.scheduleNotificationAsync({
    identifier: RECORDATORIO_ID,
    content: {
      title: "Toca cerrar tu semana",
      body: "Cintura, peso y cómo te sentiste. Son dos minutos.",
      // La app lee esto al abrirse desde la notificación para llevar directo
      // al formulario.
      data: { ruta: "/checkin" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekday + 1,
      hour,
      minute: 0,
    },
  });

  return true;
}

/** `true` si hay un recordatorio vivo en este teléfono. */
export async function recordatorioActivo(): Promise<boolean> {
  const programadas = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  return programadas.some((n) => n.identifier === RECORDATORIO_ID);
}
