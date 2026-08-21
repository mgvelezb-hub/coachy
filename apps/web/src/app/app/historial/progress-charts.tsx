"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CheckInPoint } from "@/lib/checkins";
import { phaseLabel } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };

function shortLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** Marcadores verticales donde el motor cambió de fase. */
function phaseChanges(points: CheckInPoint[]): Array<{ date: string; phase: string }> {
  const changes: Array<{ date: string; phase: string }> = [];
  let previous: string | null = null;

  for (const point of points) {
    if (point.phase && point.phase !== previous) {
      changes.push({ date: point.date, phase: point.phase });
      previous = point.phase;
    }
  }
  return changes;
}

interface ChartRow extends CheckInPoint {
  label: string;
}

export function ProgressCharts({ points }: { points: CheckInPoint[] }): React.JSX.Element {
  const rows: ChartRow[] = useMemo(
    () => points.map((point) => ({ ...point, label: shortLabel(point.date) })),
    [points],
  );
  const changes = useMemo(() => phaseChanges(points), [points]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Todavía no hay gráficas</CardTitle>
          <CardDescription>
            Con el primer check-in aparece tu línea base. A partir del segundo ya hay tendencia.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const markers = changes.map((change) => {
    const row = rows.find((item) => item.date === change.date);
    return { label: row?.label ?? "", phase: change.phase };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cintura y peso</CardTitle>
          <CardDescription>
            La cintura es el indicador principal. El peso va punteado a propósito: puede quedarse
            quieto mientras la cinta baja.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="cm"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["dataMin - 2", "dataMax + 2"]}
                unit=""
              />
              <YAxis
                yAxisId="kg"
                orientation="right"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              {markers.map((marker) => (
                <ReferenceLine
                  key={`${marker.label}-${marker.phase}`}
                  yAxisId="cm"
                  x={marker.label}
                  stroke="var(--chart-4)"
                  strokeDasharray="4 4"
                  label={{
                    value: phaseLabel(marker.phase),
                    position: "top",
                    fontSize: 10,
                    fill: "var(--chart-4)",
                  }}
                />
              ))}

              <Line
                yAxisId="cm"
                type="monotone"
                dataKey="waistCm"
                name="Cintura (cm)"
                stroke="var(--chart-1)"
                strokeWidth={3}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                yAxisId="kg"
                type="monotone"
                dataKey="weightKg"
                name="Peso (kg)"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Piernas y brazos</CardTitle>
          <CardDescription>
            Aquí subir es buena señal: es el músculo que estás construyendo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="legLeftCm"
                name="Pierna izq."
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="legRightCm"
                name="Pierna der."
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="armLeftCm"
                name="Brazo izq."
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="armRightCm"
                name="Brazo der."
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
