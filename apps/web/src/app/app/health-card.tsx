"use client";

import { useEffect, useState, useTransition } from "react";
import { Activity, Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { rotateHealthToken } from "@/app/app/health-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * La tarjeta del reloj (Fase 8).
 *
 * No hay app nativa ni HealthKit: los datos entran por un **Atajo de iOS** que
 * lee Salud y hace un POST diario. Esta tarjeta es todo lo que ese atajo
 * necesita —la dirección y el token— más la prueba de que está funcionando:
 * la fecha del último dato recibido.
 *
 * El token se pinta tapado. Es una credencial: quien la tenga puede escribir
 * días en esta cuenta, así que se enseña cuando ella lo pide, se copia de un
 * tap, y se puede regenerar si se le escapó en una captura de pantalla.
 */

export type HealthCardProps = {
  token: string;
  lastDate: string | null;
  avgSteps: number | null;
  avgSleepMin: number | null;
};

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function longDate(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso}T12:00:00.000Z`));
}

function sleepLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function HealthCard({
  token,
  lastDate,
  avgSteps,
  avgSleepMin,
}: HealthCardProps): React.JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const endpoint = `${origin}/api/health/ingest`;

  async function copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("No se pudo copiar. Manténlo presionado y cópialo a mano.");
    }
  }

  function rotate(): void {
    if (!window.confirm("¿Estrenar token? El atajo que ya tienes deja de funcionar.")) return;
    startTransition(async () => {
      await rotateHealthToken();
      setRevealed(false);
      toast.success("Token nuevo. Pégalo en el atajo para que vuelva a subir datos.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-2 space-y-0">
        <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1.5">
          <CardTitle className="text-base">Tu reloj</CardTitle>
          <CardDescription>
            {lastDate
              ? `Último dato recibido: ${longDate(lastDate)}.`
              : "Todavía no llega nada. Arma el atajo una vez y se sube solo cada mañana."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {avgSteps !== null ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pasos (7 días)</p>
              <p className="text-xl font-bold tabular-nums">{avgSteps.toLocaleString("es-MX")}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sueño (7 días)</p>
              <p className="text-xl font-bold tabular-nums">
                {avgSleepMin === null ? "—" : sleepLabel(avgSleepMin)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Para el atajo
          </p>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Dirección (POST)</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                {endpoint || "…"}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Copiar dirección"
                onClick={() => void copy(endpoint, "Enlace")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Token (encabezado Authorization)</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                {revealed ? token : "•".repeat(24)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label={revealed ? "Ocultar token" : "Ver token"}
                onClick={() => setRevealed((current) => !current)}
              >
                {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Copiar token"
                onClick={() => void copy(`Bearer ${token}`, "Token")}
              >
                {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Es una llave: con ella se pueden escribir datos en tu cuenta. No la compartas.
            </p>
          </div>
        </div>

        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Cómo armar el atajo</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Abre Atajos → + → Añadir acción → &quot;Buscar muestras de Salud&quot;.</li>
            <li>
              Pasos de ayer, sumados. Repite la acción para energía activa, minutos de ejercicio,
              sueño y frecuencia cardiaca en reposo.
            </li>
            <li>
              Agrega &quot;Obtener contenido de URL&quot;: método POST, la dirección de arriba,
              encabezado <code>Authorization</code> con el token, y el cuerpo en JSON con la fecha
              y los números.
            </li>
            <li>
              En Automatización, crea una personal diaria a las 9:00 que ejecute el atajo sin
              preguntar.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            El paso a paso completo, con los nombres exactos de cada campo, está en la
            documentación del proyecto (<code>docs/atajo-salud.md</code>).
          </p>
        </details>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={rotate}
        >
          <RefreshCw className="size-4" /> Estrenar token
        </Button>
      </CardContent>
    </Card>
  );
}
