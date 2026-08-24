import Link from "next/link";
import { Compass, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GOAL_FRAMING_SHORT, type GoalStatus } from "@/lib/coachy/goal";

/**
 * "Rumbo a tu objetivo" — la lectura quincenal contra la referencia.
 *
 * Cada línea la escribimos nosotros: el modelo solo eligió una zona, una
 * brecha, una tendencia y una acción de listas cerradas. Sin referencia, la
 * tarjeta no desaparece: invita a subirla, que es la acción útil.
 */
export function GoalCard({ status }: { status: GoalStatus }): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2">
          <Compass className="size-4 shrink-0 text-primary" />
          Rumbo a tu objetivo
        </CardTitle>
        <CardDescription>{GOAL_FRAMING_SHORT}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status.state === "sin_referencia" ? (
          <>
            <p className="text-sm leading-relaxed">
              Todavía no tienes fotos de referencia. Sube hasta tres —frente, perfil y espalda— y
              cada quincena vas a ver, zona por zona, qué te acerca y qué acción sigue.
            </p>
            <Button asChild className="w-full">
              <Link href="/app/objetivo">
                <ImagePlus /> Subir mis referencias
              </Link>
            </Button>
          </>
        ) : null}

        {status.state === "sin_fotos" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ya tienes referencia. Falta la otra mitad: manda un check-in con fotos y en la próxima
            quincena aparece aquí la lectura por zona.
          </p>
        ) : null}

        {status.state === "en_espera" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tu referencia está guardada. La comparación se corre cada dos semanas; en cuanto toque,
            la lectura por zona aparece aquí.
          </p>
        ) : null}

        {status.state === "listo" ? (
          <>
            <ul className="space-y-3">
              {status.lines.map((line) => (
                <li key={line} className="flex gap-2 text-sm leading-relaxed">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Se actualiza cada dos semanas, con tus fotos más recientes.
              </p>
              <Button asChild variant="ghost" size="sm">
                <Link href="/app/objetivo">Cambiar referencia</Link>
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
