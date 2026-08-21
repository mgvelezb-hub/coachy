import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { decimalToNumber, formatCm, formatShortDate, phaseLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Atletas" };

export default async function AdminHomePage(): Promise<React.JSX.Element> {
  await requireAdmin();

  const athletes = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      profile: true,
      _count: { select: { checkIns: true } },
      checkIns: { orderBy: { date: "desc" }, take: 1 },
    },
  });

  const pendingDecisions = await prisma.decision.count({ where: { status: "PENDIENTE" } });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Atletas</h1>
        <p className="text-sm text-muted-foreground">
          {athletes.length} {athletes.length === 1 ? "cuenta" : "cuentas"} ·{" "}
          {pendingDecisions} {pendingDecisions === 1 ? "decisión" : "decisiones"} por validar
        </p>
      </header>

      <div className="space-y-3">
        {athletes.map((athlete) => {
          const last = athlete.checkIns[0];
          return (
            <Link key={athlete.id} href={`/admin/atletas/${athlete.id}`} className="block">
              <Card className="transition-colors hover:border-primary">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {athlete.profile?.displayName ?? athlete.email}
                    </CardTitle>
                    <CardDescription>{athlete.email}</CardDescription>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={athlete.role === "ADMIN" ? "default" : "secondary"}>
                    {athlete.role === "ADMIN" ? "Admin" : "Atleta"}
                  </Badge>
                  {athlete.profile ? (
                    <Badge variant="outline">{phaseLabel(athlete.profile.currentPhase)}</Badge>
                  ) : (
                    <Badge variant="outline">Sin onboarding</Badge>
                  )}
                  <span className="text-muted-foreground">
                    {athlete._count.checkIns} check-ins
                  </span>
                  {last ? (
                    <span className="text-muted-foreground">
                      · último {formatShortDate(last.date)} ·{" "}
                      {formatCm(decimalToNumber(last.waistCm))}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {athletes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nadie registrado todavía</CardTitle>
              <CardDescription>
                En cuanto alguien cree su cuenta en /signup aparece aquí.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
