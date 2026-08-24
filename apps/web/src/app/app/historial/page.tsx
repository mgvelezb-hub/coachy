import { Dumbbell, Trophy } from "lucide-react";

import { GoalCard } from "@/app/app/historial/goal-card";
import { PhotoCompare, type PhotoSet } from "@/app/app/historial/photo-compare";
import {
  PHOTO_VIEWS,
  buildPhotoColumns,
  type PhotoCandidate,
} from "@/app/app/historial/photo-select";
import { ProgressCharts } from "@/app/app/historial/progress-charts";
import { ProgressSummaryCard } from "@/app/app/historial/progress-summary-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import { listCheckIns, toChartSeries } from "@/lib/checkins";
import { goalStatusFor } from "@/lib/coachy/goal";
import { progressSummaryFor, todayISO } from "@/lib/coachy/progress-summary";
import { decimalToNumber, formatCm, formatKg, formatShortDate, fromISODate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/storage";
import { personalRecordList, trainingHistory } from "@/lib/training/view";
import type { CheckInWithPhotos } from "@/lib/checkins";

export const metadata = { title: "Historial" };

/** Semanas donde la cinta no es concluyente (regla R1 del motor). */
const INCONCLUSIVE_CYCLE = new Set(["LUTEA", "MENSTRUACION"]);

/** Los check-ins con foto, aplanados a una ruta por vista. */
function toPhotoCandidates(checkIns: CheckInWithPhotos[]): PhotoCandidate[] {
  return checkIns
    .filter((checkIn) => checkIn.photos.length > 0)
    .map((checkIn) => {
      const paths: PhotoCandidate["paths"] = {};
      for (const photo of checkIn.photos) {
        const view = photo.view as (typeof PHOTO_VIEWS)[number];
        // `photos` admite varias por vista desde el backfill: manda la primera.
        paths[view] ??= photo.storagePath;
      }
      return {
        checkInId: checkIn.id,
        date: checkIn.date.toISOString().slice(0, 10),
        paths,
      };
    });
}

/**
 * El comparador, ya resuelto: qué check-ins son las columnas y de qué fecha
 * salió cada foto. Cuando una vista falta en la columna, se muestra la del
 * check-in con foto más cercano en lugar de un hueco vacío.
 */
async function buildPhotoSets(checkIns: CheckInWithPhotos[]): Promise<PhotoSet[]> {
  const columns = buildPhotoColumns(toPhotoCandidates(checkIns));
  if (columns.length === 0) return [];

  const paths = columns.flatMap((column) =>
    PHOTO_VIEWS.map((view) => column.slots[view]?.storagePath).filter(
      (path): path is string => path !== undefined,
    ),
  );
  const signed = await signedPhotoUrls(paths);

  return columns.map((column) => {
    const photos: PhotoSet["photos"] = {};

    for (const view of PHOTO_VIEWS) {
      const slot = column.slots[view];
      const url = slot ? signed[slot.storagePath] : undefined;
      if (!slot || !url) continue;
      photos[view] = {
        url,
        date: formatShortDate(fromISODate(slot.date)),
        borrowed: slot.borrowed,
      };
    }

    return { label: column.label, date: formatShortDate(fromISODate(column.date)), photos };
  });
}

export default async function HistorialPage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();

  const [checkIns, points, sessions, records] = await Promise.all([
    listCheckIns(user.id),
    toChartSeries(user.id),
    trainingHistory(user.id),
    personalRecordList(user.id),
  ]);

  const [photoSets, summary, goalStatus] = await Promise.all([
    buildPhotoSets(checkIns),
    progressSummaryFor(user.id, {
      checkIns: checkIns.map((checkIn) => ({
        date: checkIn.date.toISOString().slice(0, 10),
        waistCm: decimalToNumber(checkIn.waistCm),
        weightKg: decimalToNumber(checkIn.weightKg),
        inconclusive: INCONCLUSIVE_CYCLE.has(checkIn.cyclePhase ?? ""),
      })),
      records,
      today: todayISO(),
    }),
    // Fase 6: nunca lanza — degrada al estado que la tarjeta sabe dibujar.
    goalStatusFor(user.id, user.profile),
  ]);

  const totalVolume = sessions.reduce((total, session) => total + session.volumeKg, 0);
  const rows = [...checkIns].reverse();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Tu historial</h1>
        <p className="text-sm text-muted-foreground">
          {checkIns.length} {checkIns.length === 1 ? "semana registrada" : "semanas registradas"}.
        </p>
      </header>

      <ProgressSummaryCard summary={summary} />

      <GoalCard status={goalStatus} />

      <ProgressCharts points={points} />

      <PhotoCompare sets={photoSets} />

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Dumbbell className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Entrenamiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay sesiones registradas. En cuanto entrenes con el modo gimnasio, aquí
              aparecen tus cargas y tus récords.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sesiones</p>
                  <p className="text-lg font-bold">{sessions.length}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Volumen</p>
                  <p className="text-lg font-bold">{Math.round(totalVolume / 1000)} t</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Récords</p>
                  <p className="text-lg font-bold">{records.length}</p>
                </div>
              </div>

              {records.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="size-4 text-pr" /> Tus récords por ejercicio
                  </p>
                  <ul className="divide-y text-sm">
                    {records.map((record) => (
                      <li
                        key={record.exerciseName}
                        className="flex items-center gap-3 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate">{record.exerciseName}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {record.weightKg} kg × {record.reps}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                          {formatShortDate(fromISODate(record.date))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    El calentamiento no cuenta: solo las series efectivas hacen récord.
                  </p>
                </div>
              ) : null}

              <ul className="divide-y text-sm">
                {sessions.map((session) => (
                  <li key={session.workoutId} className="flex items-center gap-3 py-2">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {formatShortDate(fromISODate(session.date))}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {session.muscleGroup}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {session.sets} series · {session.volumeKg.toLocaleString("es-MX")} kg
                    </span>
                    {session.prs.length > 0 ? (
                      <Trophy className="size-4 shrink-0 text-pr" aria-label="Récord" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semana a semana</CardTitle>
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
                  <th className="px-5 py-2 font-medium">Fotos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((checkIn) => (
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
                    <td className="whitespace-nowrap px-5 py-3">
                      <Badge variant={checkIn.photos.length > 0 ? "success" : "secondary"}>
                        {checkIn.photos.length}/3
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      Aún no hay check-ins.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
