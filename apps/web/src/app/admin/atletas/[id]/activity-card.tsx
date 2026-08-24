import { Activity } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bandLabel, bandForSteps, MIN_DAYS_FOR_PAL } from "@/lib/health/activity";
import type { HealthStatus } from "@/lib/health/db";

/**
 * Actividad del reloj en el panel del atleta (Fase 8).
 *
 * Dos números y un renglón: pasos promedio de la semana y sueño promedio. Es
 * contexto para leer el resto del panel —una semana de 3,000 pasos explica un
 * estancamiento mejor que cualquier gráfica— y nada más: aquí no se decide.
 *
 * No se muestra el detalle noche por noche. El sueño es dato de salud y el
 * observatorio existe para acompañar, no para vigilar.
 */
export function ActivityCard({ status }: { status: HealthStatus }): React.JSX.Element | null {
  if (status.avgSteps === null && status.avgSleepMin === null) return null;

  const band = status.avgSteps === null ? null : bandForSteps(status.avgSteps);

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-2 space-y-0">
        <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1.5">
          <CardTitle className="text-base">Actividad del reloj</CardTitle>
          <CardDescription>
            {status.days} {status.days === 1 ? "día" : "días"} con datos
            {band ? ` · perfil ${bandLabel(band)}` : ""}
            {status.days < MIN_DAYS_FOR_PAL
              ? " · todavía no ajusta el gasto energético (hacen falta dos semanas)"
              : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pasos (7 días)</p>
          <p className="text-xl font-bold tabular-nums">
            {status.avgSteps === null ? "—" : status.avgSteps.toLocaleString("es-MX")}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Sueño (7 días)</p>
          <p className="text-xl font-bold tabular-nums">
            {status.avgSleepMin === null
              ? "—"
              : `${Math.floor(status.avgSleepMin / 60)} h ${status.avgSleepMin % 60} min`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
