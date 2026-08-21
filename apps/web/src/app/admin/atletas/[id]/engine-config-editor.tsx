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

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar config"}
    </Button>
  );
}

/** Editor JSON de la config del motor, validado antes de tocar la DB. */
/**
 * Los JSON de referencia llegan como props desde el servidor: así el motor
 * entero no acaba en el bundle del navegador solo para mostrar un placeholder.
 */
export function EngineConfigEditor({
  userId,
  initialConfig,
  defaultsJson,
  starterJson,
}: {
  userId: string;
  initialConfig: unknown;
  defaultsJson: string;
  starterJson: string;
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
          Overrides para este atleta: solo las llaves que quieras cambiar, el resto sale de los
          defaults del motor. Se valida con el <code>loadConfig</code> real de{" "}
          <code>packages/engine</code>, así que lo que se guarda es lo que el motor va a aceptar.
          Vacío = defaults.
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
            placeholder={starterJson}
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
            <Button type="button" variant="outline" onClick={() => setText(starterJson)}>
              Plantilla
            </Button>
            <Button type="button" variant="outline" onClick={() => setText(defaultsJson)}>
              Config completa
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
