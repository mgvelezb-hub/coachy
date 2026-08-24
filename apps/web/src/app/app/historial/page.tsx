import { Dumbbell, Trophy } from "lucide-react";

import { PhotoCompare, type PhotoSet } from "@/app/app/historial/photo-compare";
import { ProgressCharts } from "@/app/app/historial/progress-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import { listCheckIns, toChartSeries } from "@/lib/checkins";
import { decimalToNumber, formatCm, formatKg, formatShortDate, fromISODate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/storage";
import { trainingHistory } from "@/lib/training/view";
import type { CheckInWithPhotos } from "@/lib/checkins";

export const metadata = { title: "Historial" };

type View = "FRENTE" | "PERFIL" | "ESPALDA";

/**
 * El comparador solo tiene sentido con check-ins que traen foto: si la última
 * semana no subió ninguna, se compara contra la última que sí tiene. Cada
 * columna aparece una sola vez aunque las tres apunten al mismo check-in.
 */
async function buildPhotoSets(checkIns: CheckInWithPhotos[]): Promise<PhotoSet[]> {
  const withPhotos = checkIns.filter((checkIn) => checkIn.photos.length > 0);

  const latest = withPhotos.at(-1);
  const previous = withPhotos.at(-2);
  const first = withPhotos[0];
  const used = new Set([latest?.id, previous?.id].filter(Boolean));

  const candidates: Array<{ label: string; checkIn: CheckInWithPhotos | undefined }> = [
    { label: "Más reciente", checkIn: latest },
    { label: "Anterior", checkIn: previous },
    { label: "Día 1", checkIn: first && !used.has(first.id) ? first : undefined },
  ];

  const paths = candidates
    .flatMap((candidate) => candidate.checkIn?.photos ?? [])
    .map((photo) => photo.storagePath);

  const signed = await signedPhotoUrls(paths);

  return candidates
    .filter((candidate) => candidate.checkIn !== undefined)
    .map((candidate) => {
      const checkIn = candidate.checkIn as CheckInWithPhotos;
      const urls: PhotoSet["urls"] = {};
      for (const photo of checkIn.photos) {
        const url = signed[photo.storagePath];
        if (url) urls[photo.view as View] = url;
      }
      return { label: candidate.label, date: formatShortDate(checkIn.date), urls };
    });
}

export default async function HistorialPage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();

  const [checkIns, points, sessions] = await Promise.all([
    listCheckIns(user.id),
    toChartSeries(user.id),
    trainingHistory(user.id),
  ]);
  const photoSets = await buildPhotoSets(checkIns);

  const totalVolume = sessions.reduce((total, session) => total + session.volumeKg, 0);
  const allPrs = sessions.flatMap((session) => session.prs);

  const rows = [...checkIns].reverse();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Tu historial</h1>
        <p className="text-sm text-muted-foreground">
          {checkIns.length} {checkIns.length === 1 ? "semana registrada" : "semanas registradas"}.
        </p>
      </header>

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
                  <p className="text-lg font-bold">{allPrs.length}</p>
                </div>
              </div>

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
                      <Trophy className="size-4 shrink-0 text-primary" aria-label="Récord" />
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
