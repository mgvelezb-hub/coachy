import { AlertTriangle, Lightbulb, TrendingDown } from "lucide-react";

import { ObservatoryCharts } from "@/app/admin/atletas/[id]/observatory-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { phaseLabel } from "@/lib/format";
import type { ObservatoryData } from "@/lib/observatory";

/**
 * El observatorio de un atleta (Fase 3).
 *
 * Solo lectura. Con el autopiloto encendido no hay nada que aprobar aquí: el
 * motor ya decidió y ya se publicó. Lo que se ve es qué pasó, qué se decidió y
 * qué señales ameritan que alguien mire.
 *
 * Frontera de privacidad: `ObservatoryData` no trae la fase del ciclo y los
 * textos del motor vienen filtrados desde `lib/observatory/data.ts`.
 */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Escalations({ data }: { data: ObservatoryData }): React.JSX.Element | null {
  if (data.escalations.length === 0) return null;

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-destructive" />
          Señales que piden que mires
        </CardTitle>
        <CardDescription>
          Avisan, no bloquean: la decisión del motor ya se publicó.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.escalations.map((signal) => (
          <div key={signal.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={signal.severity === "alta" ? "destructive" : "secondary"}>
                {signal.severity}
              </Badge>
              <span className="text-sm font-medium">{signal.title}</span>
              {signal.since ? (
                <span className="text-xs text-muted-foreground">desde {signal.since}</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{signal.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Forecast({ data }: { data: ObservatoryData }): React.JSX.Element {
  const { waistForecast: prediction } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="size-4" />
          A este ritmo
        </CardTitle>
        <CardDescription>
          Regresión lineal sobre las últimas semanas concluyentes de cintura. Sin IA: es aritmética.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!prediction ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay dos semanas concluyentes con cintura. Sin eso no hay ritmo que proyectar.
          </p>
        ) : (
          <>
            <p className="text-2xl font-bold">
              {prediction.projected.toFixed(1)} cm{" "}
              <span className="text-base font-normal text-muted-foreground">
                en {prediction.weeksAhead} semanas
              </span>
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">hoy {prediction.currentValue.toFixed(1)} cm</Badge>
              <Badge variant="outline">
                {prediction.slopePerWeek > 0 ? "+" : ""}
                {prediction.slopePerWeek.toFixed(2)} cm/semana
              </Badge>
              {prediction.low === prediction.high ? null : (
                <Badge variant="outline">
                  entre {prediction.low.toFixed(1)} y {prediction.high.toFixed(1)} cm
                </Badge>
              )}
              <Badge variant={prediction.confident ? "success" : "secondary"}>
                {prediction.n} semanas concluyentes
              </Badge>
              {prediction.r2 === null ? null : (
                <Badge variant="outline">ajuste r² {prediction.r2.toFixed(2)}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {prediction.confident
                ? "Proyección del ritmo reciente, no una promesa: el cuerpo no es una recta."
                : prediction.warning}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Timeline({ data }: { data: ObservatoryData }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Qué decidió Holy Gains</CardTitle>
        <CardDescription>
          Una fila por semana, de la más reciente hacia atrás. Solo lectura.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin decisiones registradas todavía.</p>
        ) : (
          data.timeline.map((entry) => (
            <div key={entry.date} className="space-y-1.5 border-b pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{entry.date}</span>
                <Badge variant="secondary">{phaseLabel(entry.phase)}</Badge>
                <Badge variant="outline">{entry.kcal} kcal</Badge>
                <span className="text-xs text-muted-foreground">
                  {entry.proteinG}P / {entry.carbsG}C / {entry.fatG}G
                </span>
                {entry.inconclusive ? (
                  <Badge variant="outline">semana no concluyente</Badge>
                ) : null}
                {entry.published ? null : <Badge variant="destructive">sin publicar</Badge>}
              </div>

              {entry.rules.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {entry.rules.map((rule) => (
                    <li key={`${entry.date}-${rule.id}`}>
                      <span className="font-mono text-xs">{rule.id}</span>{" "}
                      <span className="font-medium">{rule.nombre}</span>
                      {rule.explicacion ? (
                        <span className="text-muted-foreground"> — {rule.explicacion}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{entry.explanation}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Proposals({ data }: { data: ObservatoryData }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-4" />
          Propuestas de mejora
        </CardTitle>
        <CardDescription>
          Cosas que se ven contando. No se aplican solas y no las escribió un modelo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada que proponer con los datos de estas semanas.
          </p>
        ) : (
          data.proposals.map((proposal) => (
            <div
              key={`${proposal.id}-${proposal.key}`}
              className="space-y-0.5 border-b pb-3 last:border-0 last:pb-0"
            >
              <p className="text-sm font-medium">{proposal.title}</p>
              <p className="text-sm text-muted-foreground">{proposal.detail}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function Observatory({ data }: { data: ObservatoryData }): React.JSX.Element {
  const { adherence, personalRecords } = data;

  return (
    <div className="space-y-5">
      <Escalations data={data} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dónde va hoy</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Fase"
            value={data.currentPhase ? phaseLabel(data.currentPhase) : "—"}
          />
          <Stat label="Calorías" value={data.currentKcal ? `${data.currentKcal}` : "—"} />
          <Stat
            label="Check-ins a tiempo"
            value={adherence.onTimePct === null ? "—" : `${adherence.onTimePct}%`}
            hint={`${adherence.onTime} de ${adherence.checkIns}`}
          />
          <Stat
            label="Último check-in"
            value={adherence.lastCheckIn ?? "—"}
            hint={
              adherence.daysSinceLastCheckIn === null
                ? undefined
                : `hace ${adherence.daysSinceLastCheckIn} días`
            }
          />
          <Stat
            label="Cumplimiento dieta"
            value={
              adherence.avgDietCompliance === null ? "—" : `${adherence.avgDietCompliance}%`
            }
            hint="promedio declarado"
          />
          <Stat
            label="Cumplimiento entreno"
            value={
              adherence.avgTrainingCompliance === null
                ? "—"
                : `${adherence.avgTrainingCompliance}%`
            }
            hint="promedio declarado"
          />
        </CardContent>
      </Card>

      <Forecast data={data} />

      <ObservatoryCharts weeks={data.weeks} strength={data.strength} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mejores marcas</CardTitle>
          <CardDescription>Peso tope por ejercicio y cuándo se levantó.</CardDescription>
        </CardHeader>
        <CardContent>
          {personalRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cargas registradas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {personalRecords.map((record) => (
                <li
                  key={record.exerciseName}
                  className="flex items-center justify-between gap-4 border-b pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="font-medium">{record.exerciseName}</span>
                  <span className="text-muted-foreground">
                    {record.weightKg} kg · {record.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Timeline data={data} />
      <Proposals data={data} />
    </div>
  );
}
