import type { Prisma } from "@prisma/client";

import { DecisionReview } from "@/app/admin/decisiones/decision-review";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { replyToText } from "@/lib/coachy/compose";
import type { CoachyReply, PhotoZoneReading, VisionAnalysis } from "@/lib/coachy/types";
import { decimalToNumber, formatCm, formatLongDate, phaseLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Decisiones por validar" };

interface RuleRow {
  id: string;
  nombre: string;
  explicacion: string;
}

function rulesFrom(value: Prisma.JsonValue | null): RuleRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row) => row !== null && typeof row === "object" && !Array.isArray(row) && "id" in row,
  ) as unknown as RuleRow[];
}

function replyFrom(value: Prisma.JsonValue | null): CoachyReply | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachyReply;
}

function visionFrom(value: Prisma.JsonValue | null): VisionAnalysis | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as VisionAnalysis;
}

const CHANGE_VARIANT: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  mejora: "success",
  igual: "secondary",
  retroceso: "destructive",
  no_comparable: "outline",
};

function ZoneList({ readings }: { readings: PhotoZoneReading[] }): React.JSX.Element {
  return (
    <ul className="space-y-1">
      {readings.map((reading) => (
        <li key={reading.zona} className="flex items-center gap-2 text-sm">
          <Badge variant={CHANGE_VARIANT[reading.cambio] ?? "outline"}>{reading.cambio}</Badge>
          <span className="font-medium capitalize">{reading.zona}</span>
          <span className="text-muted-foreground">{reading.nota_breve}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cola de validación (spec 03 §2.2.6).
 *
 * Todo lo que el admin necesita para decidir en un tap está en la tarjeta:
 * señales de la semana, reglas que disparó el motor, análisis de fotos y el
 * texto propuesto. Nada obliga a navegar a otra página.
 */
export default async function AdminDecisionsPage(): Promise<React.JSX.Element> {
  await requireAdmin();

  const decisions = await prisma.decision.findMany({
    where: { status: "PENDIENTE" },
    orderBy: { createdAt: "desc" },
    include: {
      checkIn: true,
      user: { include: { profile: { select: { displayName: true } } } },
    },
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Decisiones por validar</h1>
        <p className="text-sm text-muted-foreground">
          {decisions.length === 0
            ? "No hay nada pendiente."
            : `${decisions.length} ${decisions.length === 1 ? "decisión espera" : "decisiones esperan"} tu visto bueno. Nada se publica sin ti.`}
        </p>
      </header>

      {decisions.map((decision) => {
        const { checkIn } = decision;
        const reply = replyFrom(decision.replyJson);
        const vision = visionFrom(decision.visionJson);
        const rules = rulesFrom(decision.rules);
        const proposedText = reply ? replyToText(reply) : "";

        return (
          <Card key={decision.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {decision.user.profile?.displayName ?? decision.user.email}
              </CardTitle>
              <CardDescription>
                Semana del {formatLongDate(checkIn.date)} · {phaseLabel(decision.phase)} ·{" "}
                {decision.kcal} kcal · {decision.proteinG}P / {decision.carbsG}C /{" "}
                {decision.fatG}G
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Señales
                </h2>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline">
                    Cintura {formatCm(decimalToNumber(checkIn.waistCm))}
                  </Badge>
                  <Badge variant="outline">
                    Peso{" "}
                    {decimalToNumber(checkIn.weightKg) === null
                      ? "—"
                      : `${decimalToNumber(checkIn.weightKg)} kg`}
                  </Badge>
                  <Badge variant="outline">Inflamación {checkIn.inflammation}/5</Badge>
                  <Badge variant="outline">Energía {checkIn.energy}/5</Badge>
                  <Badge variant="outline">Hambre {checkIn.hunger}/5</Badge>
                  <Badge variant="outline">Sueño {checkIn.sleep}/5</Badge>
                  <Badge variant="outline">Dieta {checkIn.dietCompliance}%</Badge>
                  <Badge variant="outline">Entreno {checkIn.trainingCompliance}%</Badge>
                  {checkIn.symptoms.map((symptom) => (
                    <Badge key={symptom} variant="secondary">
                      {symptom}
                    </Badge>
                  ))}
                </div>
                {checkIn.comment ? (
                  <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">
                    {checkIn.comment}
                  </p>
                ) : null}
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Reglas del motor
                </h2>
                <ul className="space-y-1 text-sm">
                  {rules.map((rule) => (
                    <li key={rule.id}>
                      <span className="font-mono text-xs">{rule.id}</span>{" "}
                      <span className="font-medium">{rule.nombre}</span> — {rule.explicacion}
                    </li>
                  ))}
                  {rules.length === 0 ? (
                    <li className="text-muted-foreground">{decision.explanation}</li>
                  ) : null}
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Análisis de fotos
                </h2>
                {vision ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">vs. semana anterior</p>
                      <ZoneList readings={vision.vsPrevious} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">vs. día 1</p>
                      <ZoneList readings={vision.vsBaseline} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin análisis: visión apagada, sin consentimiento o sin fotos con qué comparar.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Respuesta propuesta
                </h2>
                {reply ? (
                  <p className="whitespace-pre-line rounded-md border bg-card p-3 text-sm">
                    {proposedText}
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    Coachy no alcanzó a redactar esta semana. Puedes corregir y escribir el mensaje
                    a mano, o reintentar desde <code>POST /api/coachy/run</code>.
                  </p>
                )}
              </section>

              <DecisionReview
                decisionId={decision.id}
                phase={decision.phase}
                kcal={decision.kcal}
                proposedText={proposedText}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
