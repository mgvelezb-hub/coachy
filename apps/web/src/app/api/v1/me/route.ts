import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { decimalToNumber } from "@/lib/format";
import { parseDisciplineLoads } from "@/lib/training/db";

/**
 * `GET /api/v1/me` — quién es el atleta autenticado y si ya terminó el
 * onboarding. Es lo primero que la app nativa pregunta al abrir sesión.
 *
 * Solo campos básicos del perfil: nada de `healthIngestToken` (es una
 * credencial) ni del ciclo menstrual (dato sensible, opt-in de la atleta).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const profile = user.profile;

  return NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role },
    onboarded: Boolean(profile?.onboardingCompletedAt),
    profile: profile
      ? {
          displayName: profile.displayName,
          // La app lo usa para no preguntarle del ciclo a quien no aplica.
          sex: profile.sex,
          heightCm: decimalToNumber(profile.heightCm),
          currentPhase: profile.currentPhase,
          goal: profile.goal,
          // No hay campo `trainingDaysPerWeek` en el schema; `liftingDays` es
          // su equivalente (días de pesas por semana, spec 03 §5).
          trainingDaysPerWeek: profile.liftingDays,
          // Cuándo cierra su semana. La app programa el recordatorio local
          // con esto; `null` = todavía no lo eligió.
          checkinWeekday: profile.checkinWeekday,
          checkinHour: profile.checkinHour,
          // Lo que la pantalla de Nutrición necesita para explicar el plan.
          budget: profile.budget,
          mealsPerDay: profile.mealsPerDay,
          // Preferencias que mandan sobre la planeación (Fase 6). Van aquí
          // porque la pantalla de Ajustes las pinta prellenadas: sin esto
          // habría que adivinar qué eligió la persona la última vez.
          maxPrepMin: profile.maxPrepMin,
          favoriteFoods: profile.favoriteFoods,
          excludedFoods: profile.excludedFoods,
          avoidRepeatGroups: profile.avoidRepeatGroups,
          primaryDiscipline: profile.primaryDiscipline,
          otherDisciplines: parseDisciplineLoads(profile.otherDisciplines),
          swimLevel: profile.swimLevel,
          dietStyle: profile.dietStyle,
          // A qué hora entrena: la pantalla de dieta lo necesita para avisar
          // cuando la ventana del ayuno deja el entrenamiento fuera.
          trainingTime: profile.trainingTime,
          // Cómo acomodó su Resumen. El servidor lo guarda tal cual; el
          // catálogo de paneles vive en la app.
          summaryLayout: profile.summaryLayout,
          goalReference: profile.goalReference,
          fastingStartHour: profile.fastingStartHour,
          fastingEndHour: profile.fastingEndHour,
        }
      : null,
  });
}
