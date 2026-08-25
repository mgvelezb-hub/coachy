import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";

import { COMPOSE_MODEL, anthropicClient, hasAnthropicKey } from "@/lib/coachy/anthropic";
import {
  citableNumbers,
  computeProgressMetrics,
  formatDelta,
  templateSummary,
  type ProgressInput,
  type ProgressMetrics,
} from "@/lib/coachy/progress-metrics";
import { toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * "Tu avance": las cifras del historial, ya interpretadas.
 *
 * La frontera es la misma que en `compose.ts` y por la misma razón: **el
 * historial da los números, la IA solo los lee en voz alta**. La herramienta no
 * tiene ningún campo numérico, y lo que redacta se valida contra la lista de
 * cifras calculadas antes de guardarse. Si cita una que no salió del historial,
 * se tira el texto y se usa la plantilla determinista.
 *
 * El texto se cachea por (atleta, huella del historial) en `conversations`: se
 * paga la API una vez por check-in nuevo, no en cada render.
 */

const SUMMARY_TOOL_NAME = "resumir_avance";

/** Marca del contexto que distingue estas filas del resto de la conversación. */
export const SUMMARY_KIND = "resumen_avance";

const SUMMARY_TOOL: Anthropic.Tool = {
  name: SUMMARY_TOOL_NAME,
  description: "Entrega la interpretación del avance del atleta, en frases sueltas.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      frases: {
        type: "array",
        items: { type: "string" },
        description:
          "Entre 2 y 4 frases que interpreten los números que se te dieron. Cada cifra que escribas tiene que ser una de las del contexto, tal cual.",
      },
    },
    required: ["frases"],
  },
};

const SYSTEM_PROMPT = `Eres Holy Gains. Le explicas a un atleta qué dicen sus propios números de las
últimas semanas. Escribes en español de México, en segunda persona, cálido y directo.

## Qué escribes
Entre 2 y 4 frases cortas que respondan "¿voy bien?". Cada frase dice qué significa un número,
no lo repite nada más. Empiezas por lo que más importa y cierras con algo accionable.

## Reglas duras (violarlas invalida la respuesta)
- La CINTA manda sobre la BÁSCULA. Si el peso sube o no se mueve y la cintura baja, eso es
  recomposición y así se explica. El peso nunca es el titular.
- SOLO usas las cifras del contexto, escritas exactamente igual. No calculas, no promedias,
  no proyectas, no inventas ninguna otra.
- No escribes fechas ni porcentajes que no estén en el contexto.
- NUNCA haces comentarios sobre el cuerpo, la apariencia ni la estética.
- NUNCA das consejo médico, ni interpretas estudios, ni nombras enfermedades.
- NUNCA regañas ni culpas por un dato que no se movió. Un estancamiento es información.
- Nada de promesas de resultados futuros.`;

export interface ProgressSummary {
  metrics: ProgressMetrics;
  /** Las frases de interpretación, en orden. */
  lines: string[];
  source: "IA" | "PLANTILLA";
}

/** Números que aparecen en un texto, incluidos los decimales. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

/**
 * El candado: cada cifra escrita tiene que ser una de las calculadas.
 *
 * Se toleran 1 y 2 porque aparecen en giros del idioma ("un par", "las dos
 * medidas") y no pueden confundirse con una medida corporal.
 */
export function citesOnlyEngineNumbers(lines: readonly string[], metrics: ProgressMetrics): boolean {
  const allowed = citableNumbers(metrics);

  return lines.every((line) =>
    numbersIn(line).every(
      (value) => value <= 2 || allowed.some((candidate) => Math.abs(candidate - value) < 0.05),
    ),
  );
}

/** El contexto que ve el modelo: cifras ya calculadas, en texto. */
export function renderMetrics(metrics: ProgressMetrics): string {
  const lines: string[] = ["## Cifras del historial — son las únicas que puedes citar"];

  if (metrics.waistTotal) {
    lines.push(
      `- Cintura desde el primer registro: ${formatDelta(metrics.waistTotal.value, "cm")} en ${metrics.waistTotal.weeks} semanas.`,
    );
  } else {
    lines.push("- Cintura desde el primer registro: no hay dos mediciones que comparar.");
  }

  if (metrics.waistRecent) {
    lines.push(
      `- Cintura en las últimas semanas concluyentes: ${formatDelta(metrics.waistRecent.value, "cm")} en ${metrics.waistRecent.weeks} semanas.`,
    );
  } else {
    lines.push("- Cintura reciente: no hay suficientes semanas concluyentes.");
  }

  if (metrics.weight) {
    lines.push(`- Peso en el mismo periodo: ${formatDelta(metrics.weight.value, "kg")}.`);
  } else {
    lines.push("- Peso: no hay dos registros que comparar.");
  }

  if (metrics.bestRecord) {
    lines.push(
      `- Mejor marca reciente en el gimnasio: ${metrics.bestRecord.weightKg} kg × ${metrics.bestRecord.reps} reps.`,
    );
  } else {
    lines.push("- Gimnasio: todavía no hay cargas registradas.");
  }

  lines.push(`- Check-ins seguidos: ${metrics.streakWeeks}.`);
  lines.push(`- Check-ins en total: ${metrics.totalCheckIns}.`);
  lines.push("");
  lines.push(`Contesta llamando a la herramienta ${SUMMARY_TOOL_NAME}, sin texto fuera de ella.`);

  return lines.join("\n");
}

export interface ComposeSummaryOptions {
  client?: Anthropic;
}

/**
 * Redacta la interpretación. Devuelve la plantilla determinista si no hay
 * llave, si el modelo no coopera o si se inventa una cifra.
 */
export async function composeProgressSummary(
  metrics: ProgressMetrics,
  options: ComposeSummaryOptions = {},
): Promise<ProgressSummary> {
  const fallback: ProgressSummary = {
    metrics,
    lines: templateSummary(metrics),
    source: "PLANTILLA",
  };

  if (options.client === undefined && !hasAnthropicKey()) return fallback;

  try {
    const client = options.client ?? anthropicClient();
    const response = await client.messages.create({
      model: COMPOSE_MODEL,
      max_tokens: 1000,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "tool", name: SUMMARY_TOOL_NAME },
      messages: [{ role: "user", content: renderMetrics(metrics) }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === SUMMARY_TOOL_NAME,
    );
    if (!toolUse) return fallback;

    const raw = typeof toolUse.input === "string" ? JSON.parse(toolUse.input) : toolUse.input;
    const frases = (raw as { frases?: unknown }).frases;
    if (!Array.isArray(frases)) return fallback;

    const lines = frases
      .filter((line): line is string => typeof line === "string")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);

    if (lines.length < 2 || !citesOnlyEngineNumbers(lines, metrics)) return fallback;

    return { metrics, lines, source: "IA" };
  } catch (error) {
    console.error("[coachy] no se pudo redactar el resumen de avance", error);
    return fallback;
  }
}

/**
 * Huella del historial. Mientras no cambie, el texto cacheado sigue vigente:
 * un render más no vuelve a pagar la API.
 */
export function fingerprintOf(metrics: ProgressMetrics): string {
  return [
    metrics.lastCheckInDate ?? "sin-checkin",
    metrics.totalCheckIns,
    metrics.streakWeeks,
    metrics.waistTotal?.value ?? "-",
    metrics.waistRecent?.value ?? "-",
    metrics.weight?.value ?? "-",
    metrics.bestRecord ? `${metrics.bestRecord.weightKg}x${metrics.bestRecord.reps}` : "-",
  ].join("|");
}

function cachedLines(contextJson: Prisma.JsonValue | null, fingerprint: string): string[] | null {
  if (contextJson === null || typeof contextJson !== "object" || Array.isArray(contextJson)) {
    return null;
  }
  const context = contextJson as Record<string, unknown>;
  if (context.kind !== SUMMARY_KIND || context.fingerprint !== fingerprint) return null;
  if (!Array.isArray(context.lines)) return null;

  const lines = context.lines.filter((line): line is string => typeof line === "string");
  return lines.length > 0 ? lines : null;
}

/**
 * El resumen del atleta, cacheado por huella del historial.
 *
 * Se llama desde el render de `/app/historial`, así que nunca lanza: si algo
 * falla, la plantilla determinista deja la sección viva.
 */
export async function progressSummaryFor(
  userId: string,
  input: ProgressInput,
): Promise<ProgressSummary> {
  const metrics = computeProgressMetrics(input);
  const fingerprint = fingerprintOf(metrics);

  const stored = await prisma.conversation
    .findMany({
      where: { userId, role: "COACHY" },
      orderBy: { date: "desc" },
      take: 10,
      select: { contextJson: true },
    })
    .catch(() => []);

  for (const row of stored) {
    const lines = cachedLines(row.contextJson, fingerprint);
    if (lines) return { metrics, lines, source: "IA" };
  }

  const summary = await composeProgressSummary(metrics);

  if (summary.source === "IA") {
    await prisma.conversation
      .create({
        data: {
          userId,
          role: "COACHY",
          text: summary.lines.join("\n\n"),
          contextJson: {
            kind: SUMMARY_KIND,
            fingerprint,
            lines: summary.lines,
            generatedFor: metrics.lastCheckInDate,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch((error) => {
        console.error("[coachy] no se pudo cachear el resumen de avance", error);
        return null;
      });
  }

  return summary;
}

/** Hoy en ISO, para que el cálculo reciba la fecha como dato. */
export function todayISO(): string {
  return toISODate(new Date());
}
