import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { decimalToNumber } from "@/lib/format";

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
        }
      : null,
  });
}
