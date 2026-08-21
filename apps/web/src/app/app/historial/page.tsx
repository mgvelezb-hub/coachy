import { PhotoCompare, type PhotoSet } from "@/app/app/historial/photo-compare";
import { ProgressCharts } from "@/app/app/historial/progress-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import { listCheckIns, toChartSeries } from "@/lib/checkins";
import { decimalToNumber, formatCm, formatKg, formatShortDate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/storage";
import type { CheckInWithPhotos } from "@/lib/checkins";

export const metadata = { title: "Historial" };

type View = "FRENTE" | "PERFIL" | "ESPALDA";

async function buildPhotoSets(checkIns: CheckInWithPhotos[]): Promise<PhotoSet[]> {
  const latest = checkIns.at(-1);
  const previous = checkIns.at(-2);
  const first = checkIns[0];

  const candidates: Array<{ label: string; checkIn: CheckInWithPhotos | undefined }> = [
    { label: "Esta semana", checkIn: latest },
    { label: "Semana pasada", checkIn: previous },
    { label: "Día 1", checkIn: first && first.id !== latest?.id ? first : undefined },
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

  const [checkIns, points] = await Promise.all([listCheckIns(user.id), toChartSeries(user.id)]);
  const photoSets = await buildPhotoSets(checkIns);

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
