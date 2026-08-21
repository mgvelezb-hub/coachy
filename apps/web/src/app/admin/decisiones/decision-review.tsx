"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Pencil } from "lucide-react";

import {
  approveDecision,
  correctDecision,
  type DecisionState,
} from "@/app/admin/decisiones/actions";
import { EMPTY_DECISION_STATE } from "@/app/admin/decisiones/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PHASES = [
  "REINTRO",
  "BASE",
  "CUT",
  "CUT_AGRESIVO",
  "REFEED",
  "ESTABILIZACION",
  "MANTENIMIENTO",
] as const;

function ApproveButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="flex-1" disabled={pending}>
      <Check /> {pending ? "Publicando…" : "Aprobar"}
    </Button>
  );
}

function SaveCorrectionButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar corrección y publicar"}
    </Button>
  );
}

function Feedback({ state }: { state: DecisionState }): React.JSX.Element | null {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={
        state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
      }
    >
      {state.message}
    </p>
  );
}

/**
 * Los dos caminos de la cola: aprobar de un tap, o abrir el editor y corregir.
 * La corrección es lo que alimenta el banco de few-shot, así que el textarea
 * llega con la propuesta completa: se edita, no se escribe desde cero.
 */
export function DecisionReview({
  decisionId,
  phase,
  kcal,
  proposedText,
}: {
  decisionId: string;
  phase: string;
  kcal: number;
  proposedText: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [approveState, approveAction] = useActionState<DecisionState, FormData>(
    approveDecision,
    EMPTY_DECISION_STATE,
  );
  const [correctState, correctAction] = useActionState<DecisionState, FormData>(
    correctDecision,
    EMPTY_DECISION_STATE,
  );

  if (editing) {
    return (
      <form action={correctAction} className="space-y-4">
        <input type="hidden" name="decisionId" value={decisionId} />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`phase-${decisionId}`}>Fase</Label>
            <select
              id={`phase-${decisionId}`}
              name="phase"
              defaultValue={phase}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {PHASES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`kcal-${decisionId}`}>kcal</Label>
            <Input
              id={`kcal-${decisionId}`}
              name="kcal"
              type="number"
              inputMode="numeric"
              defaultValue={kcal}
              min={800}
              max={6000}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`text-${decisionId}`}>Mensaje que verá el atleta</Label>
          <Textarea
            id={`text-${decisionId}`}
            name="text"
            rows={12}
            defaultValue={proposedText}
            className="font-normal"
          />
          <p className="text-xs text-muted-foreground">
            Lo que dejes aquí se publica tal cual y se guarda como ejemplo de tono para las
            próximas semanas. Los macros se recalculan con el motor a partir de la fase y las kcal.
          </p>
        </div>

        <Feedback state={correctState} />

        <div className="flex gap-2">
          <SaveCorrectionButton />
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <form action={approveAction} className="flex flex-1">
          <input type="hidden" name="decisionId" value={decisionId} />
          <ApproveButton />
        </form>
        <Button type="button" variant="outline" size="lg" onClick={() => setEditing(true)}>
          <Pencil /> Corregir
        </Button>
      </div>
      <Feedback state={approveState} />
    </div>
  );
}
