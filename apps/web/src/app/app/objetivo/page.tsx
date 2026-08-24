import Link from "next/link";
import { Compass, LineChart, ShieldCheck } from "lucide-react";

import { GoalPhotoForm, type GoalSlot } from "@/app/app/objetivo/goal-photo-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOnboardedUser } from "@/lib/auth";
import {
  GOAL_FRAMING,
  GOAL_VIEWS,
  GOAL_VIEW_LABEL,
  goalReferenceUrls,
} from "@/lib/coachy/goal";

export const metadata = { title: "Tu objetivo" };

/**
 * `/app/objetivo` — las fotos de referencia del físico meta.
 *
 * El marco de expectativas no es letra chica: va arriba del formulario y no se
 * puede cerrar. Subir la foto de otra persona como meta es exactamente el
 * momento en que hay que decir qué es y qué no es esta comparación.
 */
export default async function ObjetivoPage(): Promise<React.JSX.Element> {
  const user = await requireOnboardedUser();

  const references = await goalReferenceUrls(user.id);
  const byView = new Map(references.map((reference) => [reference.view, reference.url]));

  const slots: GoalSlot[] = GOAL_VIEWS.map((view) => ({
    view,
    label: GOAL_VIEW_LABEL[view],
    url: byView.get(view) ?? null,
  }));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Tu objetivo</h1>
        <p className="text-sm text-muted-foreground">
          Hasta tres fotos del físico al que le apuntas: frente, perfil y espalda.
        </p>
      </header>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Compass className="size-4 shrink-0 text-primary" />
          <CardTitle className="text-base">Qué es y qué no es esta referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm leading-relaxed">
            {GOAL_FRAMING.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <GoalPhotoForm slots={slots} />

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-base">Dónde queda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            En el mismo lugar privado que tus fotos de progreso: un bucket cerrado donde solo entra
            tu sesión. Nunca se publican y nunca se comparten.
          </p>
          <p>
            Cada quincena se comparan tus fotos más recientes contra esta referencia, por zona, y de
            ahí sale una acción concreta de entrenamiento o de adherencia. Nada más: ni cifras, ni
            opiniones sobre tu cuerpo.
          </p>
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="w-full">
        <Link href="/app/historial">
          <LineChart /> Ver tu rumbo en el historial
        </Link>
      </Button>
    </div>
  );
}
