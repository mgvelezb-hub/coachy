import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowRight, Bell, Dumbbell, UtensilsCrossed } from "lucide-react";

import { CoachyQuestions } from "@/app/app/coachy-questions";
import { HealthCard } from "@/app/app/health-card";
import {
  MealPlanView,
  type GroceryItemView,
  type MenuMealView,
  type MenuView,
} from "@/app/app/meal-plan-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import { replyToText } from "@/lib/coachy/compose";
import { currentMealPlan } from "@/lib/coachy/menu";
import { unreadNotifications } from "@/lib/coachy/notifications";
import type { CoachyReply } from "@/lib/coachy/types";
import { decimalToNumber, formatCm, formatLongDate, phaseLabel, sundayOf } from "@/lib/format";
import { ensureHealthToken, healthStatus } from "@/lib/health/db";
import { prisma } from "@/lib/prisma";
import { todayCard } from "@/lib/training/view";

export const metadata = { title: "Hoy" };

function replyFrom(value: Prisma.JsonValue | null): CoachyReply | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachyReply;
}

/** El JSON del motor, aplanado a lo que necesita la vista. */
function toMenuView(menuNumber: number, mealsJson: Prisma.JsonValue): MenuView {
  const meals = Array.isArray(mealsJson) ? mealsJson : [];

  return {
    menuNumber,
    meals: meals.map((raw) => {
      const meal = raw as Record<string, unknown>;
      const items = Array.isArray(meal.items) ? meal.items : [];
      const equivalences = Array.isArray(meal.equivalences) ? meal.equivalences : [];

      return {
        slot: String(meal.slot ?? ""),
        label: String(meal.label ?? ""),
        timeHint: String(meal.timeHint ?? ""),
        allowDenseCarb: meal.allowDenseCarb !== false,
        items: items.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            name: String(row.name ?? ""),
            grams: Number(row.grams ?? 0),
            free: row.free === true,
          };
        }),
        equivalences: equivalences.map((equivalence) => {
          const row = equivalence as Record<string, unknown>;
          const options = Array.isArray(row.options) ? row.options : [];
          return {
            forName: String(row.forName ?? ""),
            options: options.map((option) => {
              const item = option as Record<string, unknown>;
              return { name: String(item.name ?? ""), grams: Number(item.grams ?? 0) };
            }),
          };
        }),
      } satisfies MenuMealView;
    }),
  };
}

function toGroceries(json: Prisma.JsonValue): GroceryItemView[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      name: String(item.name ?? ""),
      grams: Number(item.grams ?? 0),
      unit: String(item.unit ?? ""),
    };
  });
}

export default async function AppHomePage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();
  const thisSunday = sundayOf(new Date());
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // La rutina de la semana se materializa la primera vez que abre el home. Si
  // algo falla, la tarjeta lo dice y el resto de la pantalla sigue viva.
  const workout = await todayCard(user.id, user.profile, today).catch((error) => {
    console.error("[training] no se pudo armar la rutina de hoy", error);
    return null;
  });

  // El reloj (Fase 8): el token del atajo se crea la primera vez que se abre
  // esta pantalla. Si algo falla, la tarjeta no aparece y el resto sigue vivo.
  const health = await Promise.all([ensureHealthToken(user.id), healthStatus(user.id)])
    .then(([token, status]) => ({ token, status }))
    .catch((error) => {
      console.error("[salud] no se pudo preparar la tarjeta del reloj", error);
      return null;
    });

  // La alimentación se materializa a demanda igual que la rutina: si la
  // decisión vigente llegó por el importador nunca pasó por `runCoachy`, así
  // que su menú no existe hasta que alguien abre esta pantalla.
  const nutrition = await currentMealPlan(user.id, user.profile).catch((error) => {
    console.error("[coachy] no se pudo cargar la alimentación", error);
    return null;
  });

  const [current, previous, total, published, notifications, answered] = await Promise.all([
    prisma.checkIn.findUnique({
      where: { userId_date: { userId: user.id, date: thisSunday } },
      include: { decision: true },
    }),
    prisma.checkIn.findFirst({
      where: { userId: user.id, date: { lt: thisSunday } },
      orderBy: { date: "desc" },
    }),
    prisma.checkIn.count({ where: { userId: user.id } }),
    // Solo lo publicado: si el admin todavía no aprueba, aquí no aparece nada.
    prisma.decision.findFirst({
      where: { userId: user.id, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      include: { checkIn: true, mealPlans: { orderBy: { menuNumber: "asc" } } },
    }),
    unreadNotifications(user.id),
    prisma.conversation.findMany({
      where: { userId: user.id, role: "ATHLETE" },
      orderBy: { date: "desc" },
      take: 5,
      select: { contextJson: true },
    }),
  ]);

  const currentWaist = current ? decimalToNumber(current.waistCm) : null;
  const previousWaist = previous ? decimalToNumber(previous.waistCm) : null;
  const delta =
    currentWaist !== null && previousWaist !== null ? currentWaist - previousWaist : null;

  const reply = published ? replyFrom(published.replyJson) : null;
  const alreadyAnswered = answered.some(
    (row) =>
      row.contextJson !== null &&
      typeof row.contextJson === "object" &&
      !Array.isArray(row.contextJson) &&
      (row.contextJson as Record<string, unknown>).decisionId === published?.id,
  );

  const menus = nutrition?.plans.map((plan) => toMenuView(plan.menuNumber, plan.mealsJson)) ?? [];
  const groceries = nutrition?.plans[0]
    ? toGroceries(nutrition.plans[0].groceryListJson)
    : [];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hola, {user.profile.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Fase actual: {phaseLabel(published?.phase ?? user.profile.currentPhase)} · {total}{" "}
          {total === 1 ? "check-in" : "check-ins"} registrados
        </p>
      </header>

      {notifications.map((notification) => (
        <Card key={notification.id} className="border-primary/40 bg-primary/5">
          <CardHeader className="flex-row items-start gap-3 space-y-0 py-4">
            <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <CardTitle className="text-sm">{notification.title}</CardTitle>
              <CardDescription className="whitespace-pre-line">
                {notification.body}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ))}

      {reply && published ? (
        <Card>
          <CardHeader>
            <CardTitle>Coachy · semana del {formatLongDate(published.checkIn.date)}</CardTitle>
            <CardDescription>
              {phaseLabel(published.phase)} · {published.kcal} kcal · {published.proteinG} g de
              proteína · {published.carbsG} g de carbos · {published.fatG} g de grasa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-line text-sm leading-relaxed">{replyToText(reply)}</p>

            {reply.meta ? (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Meta de la semana
                </p>
                <p className="text-sm font-medium">{reply.meta}</p>
              </div>
            ) : null}

            {reply.preguntas.length > 0 && !alreadyAnswered ? (
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contéstale a Coachy
                </p>
                <CoachyQuestions decisionId={published.id} questions={reply.preguntas} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {current ? (
        <Card>
          <CardHeader>
            <CardTitle>Semana del {formatLongDate(thisSunday)}</CardTitle>
            <CardDescription>Tu check-in de esta semana ya está registrado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{formatCm(currentWaist)}</span>
              {delta !== null ? (
                <Badge variant={delta <= -0.5 ? "success" : "secondary"}>
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} cm
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {current.decision?.publishedAt
                ? "Ya tienes la decisión de la semana arriba."
                : "Coachy está revisando tu semana. En cuanto tu coach valide la decisión te avisa."}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/app/checkin">Corregir algo</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Te toca check-in</CardTitle>
            <CardDescription>
              Semana del {formatLongDate(thisSunday)}. Medidas, tres fotos y cómo te sentiste.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full">
              <Link href="/app/checkin">
                Empezar <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start gap-2 space-y-0">
          <UtensilsCrossed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1.5">
            <CardTitle className="text-base">Tu alimentación</CardTitle>
            <CardDescription>
              {menus.length > 0
                ? `${phaseLabel(nutrition?.decision.phase ?? user.profile.currentPhase)} · ${nutrition?.decision.kcal} kcal · dos menús para alternar. Si te falta algo, checa las equivalencias.`
                : "Aquí vive tu menú con gramos, equivalencias y lista de súper."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {menus.length > 0 ? (
            <MealPlanView menus={menus} groceries={groceries} />
          ) : nutrition ? (
            <p className="text-sm text-muted-foreground">
              Ya tienes decisión de la semana, pero el menú no se pudo armar todavía. Revisa que tu
              perfil tenga estatura y peso; con eso aparece solo.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tu primer check-in genera tu plan: con las medidas y las sensaciones de la semana,
              Coachy arma el menú con sus equivalencias y la lista de súper.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Dumbbell className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workout ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">{workout.muscleGroup}</p>
                {workout.completed ? <Badge variant="success">Hecho</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {workout.exerciseCount} ejercicios · {workout.schemeLabel}
                {workout.cardioMinutes ? ` · ${workout.cardioMinutes} min de cardio` : ""}
              </p>
              <Button asChild size="lg" className="w-full" variant={workout.completed ? "outline" : "default"}>
                <Link href="/app/entrenamiento">
                  {workout.completed ? "Ver la sesión" : "Entrenar"} <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hoy toca descanso. El músculo se construye fuera del gimnasio.
            </p>
          )}
        </CardContent>
      </Card>

      {health ? (
        <HealthCard
          token={health.token}
          lastDate={health.status.lastDate}
          avgSteps={health.status.avgSteps}
          avgSleepMin={health.status.avgSleepMin}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tu progreso</CardTitle>
          <CardDescription>Cintura, peso y medidas semana a semana.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/app/historial">Ver historial</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
