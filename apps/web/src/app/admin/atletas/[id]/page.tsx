import { notFound } from "next/navigation";

import { EngineConfigEditor } from "@/app/admin/atletas/[id]/engine-config-editor";
import { Observatory } from "@/app/admin/atletas/[id]/observatory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import {
  decimalToNumber,
  formatCm,
  formatKg,
  formatLongDate,
  formatShortDate,
  phaseLabel,
} from "@/lib/format";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/engine-config";
import { loadObservatory } from "@/lib/observatory";
import { prisma } from "@/lib/prisma";
import { CONDITION_LABELS, GOAL_LABELS } from "@/lib/validation/onboarding";

export const metadata = { title: "Perfil del atleta" };

function Row({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function AthletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  await requireAdmin();
  const { id } = await params;

  const athlete = await prisma.user.findUnique({
    where: { id },
    include: {
      profile: true,
      checkIns: {
        orderBy: { date: "desc" },
        take: 20,
        include: { decision: true, photos: { select: { id: true } } },
      },
    },
  });

  if (!athlete) notFound();

  const profile = athlete.profile;
  const observatory = await loadObservatory(id);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{profile?.displayName ?? athlete.email}</h1>
        <p className="text-sm text-muted-foreground">{athlete.email}</p>
      </header>

      {observatory ? <Observatory data={observatory} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          {!profile ? (
            <CardDescription>Todavía no completa el onboarding.</CardDescription>
          ) : null}
        </CardHeader>
        {profile ? (
          <CardContent className="py-0 pb-4">
            <Row label="Fase" value={phaseLabel(profile.currentPhase)} />
            <Row label="Objetivo" value={GOAL_LABELS[profile.goal]} />
            <Row label="Estatura" value={`${decimalToNumber(profile.heightCm)?.toFixed(1)} cm`} />
            <Row label="Peso declarado" value={formatKg(decimalToNumber(profile.weightKg))} />
            <Row
              label="Masa magra"
              value={
                profile.leanMassKg ? formatKg(decimalToNumber(profile.leanMassKg)) : "Sin InBody"
              }
            />
            <Row label="Días de pesas" value={`${profile.liftingDays}/semana`} />
            <Row label="Cardio" value={`${profile.cardioMinWk} min/semana`} />
            <Row label="Comidas al día" value={profile.mealsPerDay} />
            <Row
              label="Condiciones"
              value={
                profile.conditions.length > 0 ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {profile.conditions.map((condition) => (
                      <Badge key={condition} variant="secondary">
                        {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS] ?? condition}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "Ninguna"
                )
              }
            />
            <Row
              label="Favoritos"
              value={profile.favoriteFoods.join(", ") || "—"}
            />
            <Row label="Excluidos" value={profile.excludedFoods.join(", ") || "—"} />
            <Row
              label="Consentimiento de fotos"
              value={
                profile.photoConsentAt ? (
                  <Badge variant="success">
                    {formatLongDate(profile.photoConsentAt)} (v{profile.photoConsentVersion})
                  </Badge>
                ) : (
                  <Badge variant="outline">No otorgado</Badge>
                )
              }
            />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check-ins</CardTitle>
          <CardDescription>Los 20 más recientes.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Cintura</th>
                  <th className="px-3 py-2 font-medium">Peso</th>
                  <th className="px-3 py-2 font-medium">Dieta</th>
                  <th className="px-3 py-2 font-medium">Fotos</th>
                  <th className="px-5 py-2 font-medium">Decisión</th>
                </tr>
              </thead>
              <tbody>
                {athlete.checkIns.map((checkIn) => (
                  <tr key={checkIn.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-5 py-3">{formatShortDate(checkIn.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium">
                      {formatCm(decimalToNumber(checkIn.waistCm))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {formatKg(decimalToNumber(checkIn.weightKg))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {checkIn.dietCompliance}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {checkIn.photos.length}/3
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {checkIn.decision ? (
                        <Badge
                          variant={
                            checkIn.decision.status === "PENDIENTE" ? "outline" : "secondary"
                          }
                        >
                          {phaseLabel(checkIn.decision.phase)} · {checkIn.decision.kcal} kcal
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {athlete.checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Sin check-ins. Puedes cargar su historial desde{" "}
                      <span className="font-medium">Importar</span>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {profile ? (
        <EngineConfigEditor
          userId={athlete.id}
          initialConfig={profile.engineConfig}
          defaultsJson={JSON.stringify(DEFAULT_ENGINE_CONFIG, null, 2)}
          // Arranque útil: las llaves que más se tocan, no las 40 del motor.
          starterJson={JSON.stringify(
            {
              deficits: { BASE: DEFAULT_ENGINE_CONFIG.deficits.BASE },
              kcalAdjustStep: DEFAULT_ENGINE_CONFIG.kcalAdjustStep,
              weeksForStall: DEFAULT_ENGINE_CONFIG.weeksForStall,
            },
            null,
            2,
          )}
        />
      ) : null}

      {/* TODO(fase-2): cola de decisiones pendientes con Aprobar / Corregir. */}
    </div>
  );
}
