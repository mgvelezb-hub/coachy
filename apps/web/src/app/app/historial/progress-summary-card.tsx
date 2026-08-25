import { Flame, Ruler, Scale, Trophy } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDelta, type ProgressMetrics } from "@/lib/coachy/progress-metrics";
import type { ProgressSummary } from "@/lib/coachy/progress-summary";

/**
 * "Tu avance": lo primero que se ve en el historial.
 *
 * Arriba las cifras deterministas — salen del historial, no de la IA — y abajo
 * la interpretación de Holy Gains, que solo puede citar esas mismas cifras. La
 * sección existe siempre: sin datos dice qué falta para tenerlos, que es más
 * útil que una galería sin lectura.
 */

type Tile = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
};

function tilesOf(metrics: ProgressMetrics): Tile[] {
  const tiles: Tile[] = [];

  tiles.push({
    icon: Ruler,
    label: "Cintura total",
    value: metrics.waistTotal ? formatDelta(metrics.waistTotal.value, "cm") : "—",
    detail: metrics.waistTotal
      ? `en ${metrics.waistTotal.weeks} semanas`
      : "falta una segunda medida",
  });

  tiles.push({
    icon: Ruler,
    label: "Cintura reciente",
    value: metrics.waistRecent ? formatDelta(metrics.waistRecent.value, "cm") : "—",
    detail: metrics.waistRecent
      ? `${metrics.waistRecent.weeks} semanas concluyentes`
      : "faltan semanas concluyentes",
  });

  tiles.push({
    icon: Scale,
    label: "Peso",
    value: metrics.weight ? formatDelta(metrics.weight.value, "kg") : "—",
    detail: metrics.weight ? `en ${metrics.weight.weeks} semanas` : "falta un segundo registro",
  });

  tiles.push({
    icon: Trophy,
    label: "Mejor marca",
    value: metrics.bestRecord
      ? `${metrics.bestRecord.weightKg} kg × ${metrics.bestRecord.reps}`
      : "—",
    detail: metrics.bestRecord ? metrics.bestRecord.exerciseName : "sin cargas registradas",
  });

  tiles.push({
    icon: Flame,
    label: "Racha",
    value: `${metrics.streakWeeks}`,
    detail: metrics.streakWeeks === 1 ? "check-in seguido" : "check-ins seguidos",
  });

  return tiles;
}

export function ProgressSummaryCard({
  summary,
}: {
  summary: ProgressSummary;
}): React.JSX.Element {
  const tiles = tilesOf(summary.metrics);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu avance</CardTitle>
        <CardDescription>
          Lo que dicen tus números, no solo cómo se ven. La cinta pesa más que la báscula.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg bg-muted p-3">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <tile.icon className="size-3.5 shrink-0" />
                {tile.label}
              </p>
              <p className="text-lg font-bold leading-tight tabular-nums">{tile.value}</p>
              <p className="truncate text-xs text-muted-foreground">{tile.detail}</p>
            </div>
          ))}
        </div>

        {summary.lines.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            {summary.lines.map((line) => (
              <p key={line} className="text-sm leading-relaxed">
                {line}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">— Holy Gains</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
