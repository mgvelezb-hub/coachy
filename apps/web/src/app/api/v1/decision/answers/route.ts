import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import { decisionAnswersSchema } from "@/lib/validation/decision-answers";

/**
 * `POST /api/v1/decision/answers` — respuestas del atleta a las preguntas de
 * Coachy, desde la app nativa.
 *
 * El shape que se guarda en `Conversation.contextJson` (`{ decisionId,
 * respuestas: [{ pregunta, respuesta }] }`) es EXACTAMENTE el de
 * `answerQuestions` (`src/app/app/actions.ts`), sin extraer un helper
 * compartido: esa acción está atada a un `FormData` (arma la lista con
 * `answer-*`/`question-*`) y no vale la pena tocar su firma solo para pelar
 * un bloque de tres líneas. El resto del sistema (la marca "ya contestó" del
 * home, `GET /api/v1/decision`) lee ese `contextJson.decisionId`, así que el
 * shape se replica a propósito, no se reinventa.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = decisionAnswersSchema.safeParse(body);
  if (!parsed.success) {
    const detalles: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !detalles[key]) detalles[key] = issue.message;
    }
    return NextResponse.json({ error: "datos inválidos", detalles }, { status: 422 });
  }

  const { decisionId, respuestas } = parsed.data;

  // El filtro por `userId` no es opcional: Prisma corre con un rol que
  // ignora RLS, así que la defensa real es esta consulta (igual que
  // `answerQuestions`).
  const decision = await prisma.decision.findFirst({ where: { id: decisionId, userId: user.id } });
  if (!decision) return NextResponse.json({ error: "no encontrada" }, { status: 404 });

  const answers = respuestas.filter((answer) => answer.respuesta.length > 0);
  if (answers.length === 0) {
    return NextResponse.json({ error: "todas las respuestas vinieron vacías" }, { status: 422 });
  }

  await prisma.conversation.create({
    data: {
      userId: user.id,
      role: "ATHLETE",
      text: answers.map((answer) => `${answer.pregunta}\n${answer.respuesta}`).join("\n\n"),
      contextJson: { decisionId, respuestas: answers } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ guardadas: answers.length }, { status: 201 });
}
