"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { removeGoalReference, saveGoalPhotos } from "@/app/app/objetivo/actions";
import { INITIAL_GOAL_PHOTO_STATE } from "@/app/app/objetivo/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Las tres referencias, en un solo formulario.
 *
 * Cada hueco muestra la referencia vigente (si existe) y la reemplaza al elegir
 * una foto nueva. Nada se sube hasta guardar, así se pueden cambiar las tres de
 * un jalón. "Quitar" es un `formAction` del mismo formulario: sin formularios
 * anidados, que son HTML inválido.
 */

export interface GoalSlot {
  view: string;
  label: string;
  /** URL firmada de la referencia vigente, o `null` si todavía no hay. */
  url: string | null;
}

function Slot({ slot }: { slot: GoalSlot }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  const shown = preview ?? slot.url;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-sm font-medium">{slot.label}</span>
        {preview ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
            Sin guardar
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 transition-colors",
          shown && "border-solid",
          preview && "border-primary",
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={`Referencia de ${slot.label.toLowerCase()}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-center text-xs text-muted-foreground">
            <ImagePlus className="size-5" />
            Elegir
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        name={`goal_${slot.view}`}
        accept="image/*"
        onChange={handleChange}
        className="sr-only"
      />

      {slot.url && !preview ? (
        <Button
          type="submit"
          name="view"
          value={slot.view}
          formAction={removeGoalReference}
          variant="ghost"
          size="sm"
          disabled={pending}
          className="h-8 w-full px-1 text-xs text-muted-foreground"
        >
          <Trash2 /> Quitar
        </Button>
      ) : null}
    </div>
  );
}

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Guardando…" : "Guardar referencias"}
    </Button>
  );
}

export function GoalPhotoForm({ slots }: { slots: GoalSlot[] }): React.JSX.Element {
  const [state, action] = useActionState(saveGoalPhotos, INITIAL_GOAL_PHOTO_STATE);

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot) => (
              <Slot key={slot.view} slot={slot} />
            ))}
          </div>

          {state.status !== "idle" ? (
            <p
              className={cn(
                "text-sm",
                state.status === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {state.message}
            </p>
          ) : null}

          <SubmitButton />
        </CardContent>
      </Card>
    </form>
  );
}
