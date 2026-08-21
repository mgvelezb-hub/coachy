import { CheckInForm, type PreviousPhoto } from "@/app/app/checkin/checkin-form";
import { requireOnboardedUser } from "@/lib/auth";
import { previousCheckIn } from "@/lib/checkins";
import { decimalToNumber, formatLongDate, sundayOf, toISODate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/storage";

export const metadata = { title: "Check-in" };

export default async function CheckInPage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();

  // El check-in es dominical: siempre se registra contra el domingo de la semana.
  const today = new Date();
  const date = sundayOf(today);
  const isoDate = toISODate(date);

  const previous = await previousCheckIn(user.id, date);

  let previousPhotos: PreviousPhoto[] = [];
  if (previous && previous.photos.length > 0) {
    const urls = await signedPhotoUrls(previous.photos.map((photo) => photo.storagePath));
    previousPhotos = previous.photos
      .map((photo) => ({ view: photo.view, url: urls[photo.storagePath] ?? "" }))
      .filter((photo) => photo.url !== "");
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Tu check-in</h1>
        <p className="text-sm text-muted-foreground">
          Semana del {formatLongDate(date)}. Son tres minutos.
        </p>
      </header>

      <CheckInForm
        date={isoDate}
        previousPhotos={previousPhotos}
        previousWaistCm={previous ? decimalToNumber(previous.waistCm) : null}
        cycleTracking={
          user.profile.sex === "FEMALE" || user.profile.conditions.includes("ciclo_tracking")
        }
      />
    </div>
  );
}
