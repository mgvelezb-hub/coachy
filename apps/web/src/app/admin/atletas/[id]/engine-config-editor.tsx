"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  EMPTY_CONFIG_STATE,
  saveEngineConfig,
  type ConfigState,
} from "@/app/admin/atletas/[id]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/engine-config";

const DEFAULTS_JSON = JSON.stringify(DEFAULT_ENGINE_CONFIG, null, 2);

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar config"}
    </Button>
  );
}

/** Editor JSON de la config del motor, validado antes de tocar la DB. */
export function EngineConfigEditor({
  userId,
  initialConfig,
}: {
  userId: string;
  initialConfig: unknown;
}): React.JSX.Element {
  const [state, formAction] = useActionState<ConfigState, FormData>(
    saveEngineConfig,
    EMPTY_CONFIG_STATE,
  );
  const [text, setText] = useState(
    initialConfig ? JSON.stringify(initialConfig, null, 2) : "",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Config del motor</CardTitle>
        <CardDescription>
          Overrides para este atleta (spec 02 §7). Déjalo vacío para usar los valores por defecto.
          Si el JSON no cuadra con el esquema, no se guarda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <Textarea
            name="config"
            rows={18}
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={DEFAULTS_JSON}
            className="font-mono text-xs"
          />

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

          {state.status === "success" ? (
            <p className="text-sm font-medium text-primary">{state.message}</p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton />
            <Button type="button" variant="outline" onClick={() => setText(DEFAULTS_JSON)}>
              Cargar defaults
            </Button>
            <Button type="button" variant="ghost" onClick={() => setText("")}>
              Vaciar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
