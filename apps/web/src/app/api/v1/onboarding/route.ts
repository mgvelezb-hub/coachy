import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { decimalToNumber } from "@/lib/format";
import { saveOnboarding } from "@/lib/onboarding";
import { onboardingSchema } from "@/lib/validation/onboarding";

/**
 * `POST /api/v1/onboarding` — completa el cuestionario inicial desde la app
 * nativa.
 *
 * Antes de esta ruta, el onboarding SOLO existía en la web
 * (`/onboarding`, `app/onboarding/actions.ts`): quien creaba su cuenta desde
 * el teléfono se topaba con el 403 "onboarding incompleto" en cualquier
 * endpoint que lo exigiera y no tenía forma de completarlo sin abrir un
 * navegador. Esta ruta es esa forma.
 *
 * El body llega como JSON con el shape de ENTRADA de `onboardingSchema` (no
 * el de FormData): `favoriteFoods`/`excludedFoods`/`allergies` van como
 * texto separado por comas —igual que el textarea de la web—, no como
 * arreglos, porque `commaList` es quien las convierte. La app arma ese JSON
 * en `postOnboarding` (`apps/mobile/src/lib/api.ts`).
 *
 * El guardado (`saveOnboarding`) es EXACTAMENTE el mismo que usa la Server
 * Action de la web — ver el docblock de `@/lib/onboarding` para el porqué.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  // A diferencia del resto de `/api/v1/**` (que devuelven 403 si el
  // onboarding NO está completo), aquí es al revés: esta ruta es la que lo
  // completa, así que el conflicto es que YA esté hecho. Reenviar el mismo
  // cuestionario dos veces no debe pisar silenciosamente el perfil de una
  // atleta que ya viene entrenando semanas.
  if (user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "ya completaste tu perfil" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    const detalles: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !detalles[key]) detalles[key] = issue.message;
    }
    return NextResponse.json({ error: "revisa los campos marcados", detalles }, { status: 422 });
  }

  const profile = await saveOnboarding(user.id, parsed.data, body as Record<string, unknown>);

  // Perfil MÍNIMO para que la app arranque sin pedir un segundo round-trip:
  // el mismo subconjunto que ya consume la pantalla de Hoy al leer `GET
  // /api/v1/me`. La app igual refresca su sesión completa después (Fase de
  // guardia en `context/session.tsx`), esto es solo para no dejarla en blanco
  // mientras esa segunda llamada vuelve.
  return NextResponse.json(
    {
      onboarded: true,
      profile: {
        displayName: profile.displayName,
        sex: profile.sex,
        heightCm: decimalToNumber(profile.heightCm),
        currentPhase: profile.currentPhase,
        goal: profile.goal,
        trainingDaysPerWeek: profile.liftingDays,
        mealsPerDay: profile.mealsPerDay,
        budget: profile.budget,
        trainingTime: profile.trainingTime,
      },
    },
    { status: 201 },
  );
}
