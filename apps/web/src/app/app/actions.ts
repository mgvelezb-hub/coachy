"use server";

import type { AnswerState } from "./state";
export type { AnswerState };
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Respuestas del atleta a las preguntas de Coachy.
 *
 * Se guardan como `Conversation` con rol `ATHLETE` y el `decisionId` en el
 * contexto: así la semana que viene el coach (y el prompt) pueden leer qué
 * contestó, que es la mitad del valor del check-in.
 */

export async function answerQuestions(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const user = await requireOnboardedUser();

  const decisionId = String(formData.get("decisionId") ?? "");
  if (!decisionId) return { status: "error", message: "Falta la semana a la que contestas." };

  // El filtro por `userId` no es opcional: Prisma se conecta con un rol que
  // ignora RLS, así que la defensa real es esta consulta.
  const decision = await prisma.decision.findFirst({
    where: { id: decisionId, userId: user.id },
  });
  if (!decision) return { status: "error", message: "Esa semana no es tuya." };

  const answers: Array<{ pregunta: string; respuesta: string }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("answer-")) continue;
    const text = String(value).trim();
    if (!text) continue;
    answers.push({ pregunta: formData.get(`question-${key.slice(7)}`)?.toString() ?? "", respuesta: text });
  }

  if (answers.length === 0) {
    return { status: "error", message: "Escribe al menos una respuesta." };
  }

  await prisma.conversation.create({
    data: {
      userId: user.id,
      role: "ATHLETE",
      text: answers.map((answer) => `${answer.pregunta}\n${answer.respuesta}`).join("\n\n"),
      contextJson: { decisionId, respuestas: answers } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/app", "layout");

  return { status: "success", message: "Listo, ya lo tiene Coachy." };
}
