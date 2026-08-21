"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { answerQuestions, type AnswerState } from "@/app/app/actions";
import { EMPTY_ANSWER_STATE } from "@/app/app/state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function SendButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Contestar"}
    </Button>
  );
}

/** Respuesta inline a las preguntas de la semana. Sin salir de la home. */
export function CoachyQuestions({
  decisionId,
  questions,
}: {
  decisionId: string;
  questions: string[];
}): React.JSX.Element {
  const [state, formAction] = useActionState<AnswerState, FormData>(
    answerQuestions,
    EMPTY_ANSWER_STATE,
  );

  if (state.status === "success") {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="decisionId" value={decisionId} />

      {questions.map((question, index) => (
        <div key={question} className="space-y-1.5">
          <p className="text-sm font-medium">{question}</p>
          <input type="hidden" name={`question-${index}`} value={question} />
          <Textarea
            name={`answer-${index}`}
            rows={2}
            placeholder="Escribe aquí…"
            aria-label={question}
          />
        </div>
      ))}

      {state.status === "error" ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <SendButton />
    </form>
  );
}
