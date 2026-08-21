import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import { decimalToNumber, formatCm, formatLongDate, phaseLabel, sundayOf } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Hoy" };

export default async function AppHomePage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();
  const thisSunday = sundayOf(new Date());

  const [current, previous, total] = await Promise.all([
    prisma.checkIn.findUnique({
      where: { userId_date: { userId: user.id, date: thisSunday } },
      include: { decision: true },
    }),
    prisma.checkIn.findFirst({
      where: { userId: user.id, date: { lt: thisSunday } },
      orderBy: { date: "desc" },
    }),
    prisma.checkIn.count({ where: { userId: user.id } }),
  ]);

  const currentWaist = current ? decimalToNumber(current.waistCm) : null;
  const previousWaist = previous ? decimalToNumber(previous.waistCm) : null;
  const delta =
    currentWaist !== null && previousWaist !== null ? currentWaist - previousWaist : null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hola, {user.profile.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Fase actual: {phaseLabel(user.profile.currentPhase)} · {total}{" "}
          {total === 1 ? "check-in" : "check-ins"} registrados
        </p>
      </header>

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
              {current.decision
                ? current.decision.explanation
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

      {/* TODO(fase-2): aquí va el mensaje de Coachy, el menú vigente y la meta de la semana. */}
    </div>
  );
}
