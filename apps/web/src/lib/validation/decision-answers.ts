import { z } from "zod";

/**
 * Validación de `POST /api/v1/decision/answers` (Fase 9, app nativa).
 *
 * Mismo par pregunta/respuesta que guarda `answerQuestions`
 * (`src/app/app/actions.ts`), pero por JSON en vez de `FormData`. `pregunta`
 * siempre trae texto (es la pregunta fija de Coachy); `respuesta` puede llegar
 * vacía — el endpoint filtra esas antes de guardar, así que aquí no se rechaza
 * un string vacío, solo el tamaño.
 */

const answerItemSchema = z.object({
  pregunta: z.string().trim().min(1, "Falta el texto de la pregunta").max(2000),
  respuesta: z.string().trim().max(2000, "Máximo 2000 caracteres"),
});

export const decisionAnswersSchema = z.object({
  decisionId: z.string().trim().min(1, "Falta la semana a la que contestas"),
  respuestas: z
    .array(answerItemSchema)
    .min(1, "Escribe al menos una respuesta")
    .max(10, "Máximo 10 respuestas"),
});

export type DecisionAnswerItem = z.infer<typeof answerItemSchema>;
export type DecisionAnswersInput = z.infer<typeof decisionAnswersSchema>;
