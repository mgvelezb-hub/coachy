import { toISODate } from "@/lib/format";
import { requireOnboardedUser } from "@/lib/auth";
import { weekView, type WeekView } from "@/lib/training/view";
import { TrainingSession } from "@/app/app/entrenamiento/training-session";

export const metadata = { title: "Entrenamiento" };

/**
 * Modo gimnasio.
 *
 * El servidor entrega la semana entera ya resuelta (rutina, videos firmados,
 * últimos pesos, PRs) y el cliente la guarda en IndexedDB: la sesión de mañana
 * abre aunque el gimnasio no tenga señal.
 */
export default async function EntrenamientoPage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  let week: WeekView | null = null;
  try {
    week = await weekView(user.id, user.profile, today);
  } catch (error) {
    // Sin rutina no se cae la pantalla: el cliente intenta con lo que tenga
    // guardado en el teléfono.
    console.error("[training] no se pudo armar la semana", error);
  }

  return <TrainingSession week={week} serverToday={toISODate(today)} />;
}
