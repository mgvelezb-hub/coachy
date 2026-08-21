"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  importAthleteHistory,
  type ImportState,
} from "@/app/admin/import/actions";
import { EMPTY_IMPORT_STATE } from "@/app/admin/import/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IMPORT_EXAMPLE } from "@/lib/validation/import";

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Importando…" : "Importar"}
    </Button>
  );
}

export function ImportForm(): React.JSX.Element {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importAthleteHistory,
    EMPTY_IMPORT_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Archivo JSON</CardTitle>
          <CardDescription>
            El archivo se lee en memoria y se escribe directo a la base. No se guarda copia en el
            servidor ni en el repo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Subir archivo</Label>
            <Input id="file" name="file" type="file" accept="application/json,.json" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="json">…o pegar el JSON</Label>
            <Textarea
              id="json"
              name="json"
              rows={14}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={IMPORT_EXAMPLE}
            />
          </div>

          {state.status === "error" ? (
            <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">{state.message}</p>
              <ul className="space-y-0.5 text-xs text-destructive">
                {state.errors.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.status === "success" && state.summary ? (
            <div className="rounded-lg border border-primary/40 bg-accent/40 p-3 text-sm">
              <p className="font-medium">{state.message}</p>
              <p className="text-muted-foreground">
                {state.summary.checkIns} check-ins · {state.summary.decisions} decisiones ·{" "}
                {state.summary.trainingExamples} ejemplos de tono
              </p>
            </div>
          ) : null}

          <SubmitButton />
        </CardContent>
      </Card>
    </form>
  );
}
