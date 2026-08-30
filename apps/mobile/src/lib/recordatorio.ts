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

// ---------------------------------------------------------------------------
// Comidas del día
// ---------------------------------------------------------------------------

/** Prefijo de los recordatorios de comida, para poder cancelarlos en bloque. */
const COMIDA_PREFIJO = "holygains-comida-";

/**
 * Un aviso por comida, a la hora que dice el plan.
 *
 * Por qué diarios y locales: los horarios del menú se conocen de antemano, así
 * que no hace falta servidor ni cuenta de paga. Y por qué por comida y no uno
 * al final del día: confirmar "¿te la comiste?" en el momento cuesta un toque
 * y se acuerda; preguntarlo el domingo por las veintiuna comidas de la semana
 * es justo lo que nadie contesta bien.
 *
 * Cada aviso lleva su slot y su hora en `data`, para que la app pueda
 * registrar la respuesta sin volver a preguntar de qué comida se trataba.
 */
export async function programarComidas(
  comidas: Array<{ slot: string; label: string; timeHint: string }>,
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Se cancelan todos antes de reprogramar: el menú cambia de semana a semana
  // y un aviso viejo a una hora que ya no existe es peor que ninguno.
  const programados = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    programados
      .filter((aviso) => aviso.identifier.startsWith(COMIDA_PREFIJO))
      .map((aviso) => Notifications.cancelScheduledNotificationAsync(aviso.identifier).catch(() => {})),
  );

  if (comidas.length === 0) return false;
  if (!(await pedirPermisoNotificaciones())) return false;

  for (const comida of comidas) {
    const [hora, minuto] = comida.timeHint.split(":").map((parte) => Number(parte));
    if (!Number.isFinite(hora)) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `${COMIDA_PREFIJO}${comida.slot}`,
      content: {
        title: comida.label,
        body: "¿La hiciste como venía en tu plan?",
        data: { ruta: "/", comidaSlot: comida.slot },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Math.max(0, Math.min(23, Math.round(hora))),
        minute: Number.isFinite(minuto) ? Math.max(0, Math.min(59, Math.round(minuto!))) : 0,
      },
    }).catch(() => {
      // Un aviso que no se pudo programar no puede tumbar los demás.
    });
  }

  return true;
}
