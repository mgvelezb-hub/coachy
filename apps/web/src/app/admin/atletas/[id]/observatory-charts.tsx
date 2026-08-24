"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
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
import type { StrengthWeek, WeekRow } from "@/lib/observatory";

/**
 * Gráficas del observatorio.
 *
 * Las semanas que el motor marcó como no concluyentes van sombreadas. **El
 * porqué no se dice**: el admin ve "no concluyente" y con eso le basta para no
 * leerlas como estancamiento. La fase del ciclo no llega hasta aquí — el view
 * model que este componente recibe ni siquiera la trae.
 */

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

function shortLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

interface ChartRow extends WeekRow {
  label: string;
}

export function ObservatoryCharts({
  weeks,
  strength,
}: {
  weeks: WeekRow[];
  strength: StrengthWeek[];
}): React.JSX.Element {
  const rows: ChartRow[] = useMemo(
    () => weeks.map((week) => ({ ...week, label: shortLabel(week.date) })),
    [weeks],
  );

  const inconclusive = useMemo(() => rows.filter((row) => row.inconclusive), [rows]);

  const strengthRows = useMemo(
    () => strength.map((week) => ({ ...week, label: shortLabel(week.week) })),
    [strength],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cintura y peso</CardTitle>
          <CardDescription>
            Las bandas sombreadas son semanas que el motor marcó como no concluyentes: la medida de
            esa semana no se usa para decidir tendencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sin check-ins todavía.
            </p>
          ) : (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />

                {inconclusive.map((row) => (
                  <ReferenceLine
                    key={`inconclusive-${row.date}`}
                    yAxisId="cm"
                    x={row.label}
                    stroke="var(--chart-4)"
                    strokeOpacity={0.16}
                    strokeWidth={18}
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
          )}

          {inconclusive.length > 0 ? (
            <p className="mt-3 px-6 text-xs text-muted-foreground">
              {inconclusive.length}{" "}
              {inconclusive.length === 1 ? "semana no concluyente" : "semanas no concluyentes"}:{" "}
              {inconclusive.map((row) => shortLabel(row.date)).join(" · ")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Volumen de fuerza</CardTitle>
          <CardDescription>
            Kilos movidos por semana (series efectivas, sin calentamiento). Es lo que el modo
            gimnasio registró, no lo que la rutina planeó.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {strengthRows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Todavía no hay series registradas con peso.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={strengthRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="volumeKg" name="Volumen (kg)" fill="var(--chart-3)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cumplimiento declarado</CardTitle>
          <CardDescription>
            Lo que ella reportó, no lo que se midió. Sirve para leer las otras dos gráficas.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sin check-ins todavía.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={50}
                  stroke="var(--destructive)"
                  strokeOpacity={0.5}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="dietCompliance"
                  name="Dieta (%)"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="trainingCompliance"
                  name="Entreno (%)"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
