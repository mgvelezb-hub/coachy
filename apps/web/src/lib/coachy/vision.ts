import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { Photo, Profile } from "@prisma/client";

import { VISION_MODEL, anthropicClient, hasAnthropicKey } from "@/lib/coachy/anthropic";
import {
  PHOTO_CHANGES,
  PHOTO_ZONES,
  type PhotoChange,
  type PhotoZoneReading,
  type VisionAnalysis,
} from "@/lib/coachy/types";
import { visionEnabled } from "@/lib/env";
import { SHORT_SIGNED_URL_TTL_SECONDS, signedPhotoUrl } from "@/lib/storage";

/**
 * Análisis de fotos de progreso.
 *
 * Tres candados antes de que una foto salga del bucket:
 *   1. `VISION_ENABLED` tiene que estar prendido;
 *   2. el perfil tiene que tener `photoConsentAt` — consentimiento explícito con
 *      fecha y versión, registrado en la app;
 *   3. la foto se descarga con una URL firmada de 60 segundos y los bytes van
 *      únicamente a la API de Anthropic. Nunca se guarda la URL ni se comparte.
 *
 * Y un candado sobre la salida: el modelo solo puede reportar **cambio** por
 * zona. Cualquier comentario estético o sobre la apariencia está prohibido; el
 * esquema no tiene dónde escribirlo y el prompt lo dice explícitamente.
 */

const VISION_TOOL_NAME = "registrar_analisis_fotos";

const READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    zona: { type: "string", enum: [...PHOTO_ZONES] },
    cambio: { type: "string", enum: [...PHOTO_CHANGES] },
    nota_breve: {
      type: "string",
      description:
        "Máximo 12 palabras describiendo únicamente el cambio observable. Prohibido opinar sobre la apariencia.",
    },
  },
  required: ["zona", "cambio", "nota_breve"],
} as const;

const VISION_TOOL: Anthropic.Tool = {
  name: VISION_TOOL_NAME,
  description: "Registra el cambio observado por zona corporal entre dos series de fotos.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vs_semana_anterior: { type: "array", items: READING_SCHEMA },
      vs_dia_1: { type: "array", items: READING_SCHEMA },
    },
    required: ["vs_semana_anterior", "vs_dia_1"],
  },
};

const VISION_SYSTEM = `Comparas fotos de progreso de un atleta para su coach.

Tu única tarea es reportar CAMBIO por zona: abdomen, cintura, espalda, brazos, piernas.
Para cada zona eliges: mejora | igual | retroceso | no_comparable.

Usa "no_comparable" siempre que la luz, la pose, la distancia o el encuadre no permitan comparar.
Es la respuesta correcta más seguido de lo que parece; prefiérela antes que adivinar.

PROHIBIDO ABSOLUTAMENTE:
- cualquier comentario sobre la apariencia, el atractivo, el peso o el cuerpo de la persona;
- adjetivos estéticos ("se ve bien", "bonita", "gorda", "delgada");
- estimar porcentaje de grasa, peso, medidas o edad;
- describir a la persona, su rostro, su ropa o su entorno;
- cualquier juicio o consejo.

Solo cambio observable, en lenguaje técnico y neutro. Contesta llamando a la herramienta.`;

export interface VisionInput {
  profile: Profile;
  current: Photo[];
  previous: Photo[];
  baseline: Photo[];
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * Descarga una foto del bucket privado con una URL firmada de vida corta y la
 * vuelve base64. La URL no se guarda ni se comparte: vive lo que tarda el
 * `fetch`. Lo comparten el análisis semanal y el de objetivo (`goal.ts`).
 */
export async function fetchPhotoBase64(
  storagePath: string,
): Promise<{ media_type: ImageMediaType; data: string } | null> {
  const url = await signedPhotoUrl(storagePath, {
    asAdmin: true,
    ttlSeconds: SHORT_SIGNED_URL_TTL_SECONDS,
  });
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mediaType = contentType.split(";")[0]?.trim() || "image/jpeg";

  return { media_type: mediaType as ImageMediaType, data: buffer.toString("base64") };
}

/** Bloques `text` + `image` para una serie de fotos, ya rotulados. */
export async function photoContentBlocks(
  photos: Array<{ storagePath: string; view: string }>,
  label: string,
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];

  for (const photo of photos) {
    const image = await fetchPhotoBase64(photo.storagePath);
    if (!image) continue;
    blocks.push({ type: "text", text: `${label} — vista ${photo.view.toLowerCase()}` });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: image.media_type, data: image.data },
    });
  }

  return blocks;
}

function isReading(value: unknown): value is PhotoZoneReading {
  if (value === null || typeof value !== "object") return false;
  const reading = value as Record<string, unknown>;
  return (
    PHOTO_ZONES.includes(reading.zona as never) &&
    PHOTO_CHANGES.includes(reading.cambio as never) &&
    typeof reading.nota_breve === "string"
  );
}

function readings(value: unknown): PhotoZoneReading[] {
  return Array.isArray(value) ? value.filter(isReading) : [];
}

/**
 * Tendencia que consume el motor (`photosTrend`).
 * Manda la comparación contra la semana anterior; abdomen y cintura pesan más
 * porque son el KPI del coach (metodología §4).
 */
export function summarizeTrend(vsPrevious: PhotoZoneReading[]): PhotoChange {
  const comparable = vsPrevious.filter((reading) => reading.cambio !== "no_comparable");
  if (comparable.length === 0) return "no_comparable";

  const core = comparable.filter(
    (reading) => reading.zona === "abdomen" || reading.zona === "cintura",
  );
  const decisive = core.length > 0 ? core : comparable;

  if (decisive.some((reading) => reading.cambio === "retroceso")) return "retroceso";
  if (decisive.some((reading) => reading.cambio === "mejora")) return "mejora";
  return "igual";
}

/**
 * Devuelve `null` cuando el análisis no aplica: apagado, sin consentimiento, sin
 * llave, sin fotos de esta semana o sin nada contra qué comparar.
 */
export async function analyzePhotos(input: VisionInput): Promise<VisionAnalysis | null> {
  if (!visionEnabled()) return null;
  if (!input.profile.photoConsentAt) return null;
  if (!hasAnthropicKey()) return null;
  if (input.current.length === 0) return null;
  if (input.previous.length === 0 && input.baseline.length === 0) return null;

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text:
        "Compara las fotos de ESTA SEMANA contra las de la SEMANA ANTERIOR y contra las del DÍA 1. " +
        "Una fila por zona en cada comparación. Si una zona no se ve en alguna serie, usa no_comparable.",
    },
    ...(await photoContentBlocks(input.current, "ESTA SEMANA")),
    ...(await photoContentBlocks(input.previous, "SEMANA ANTERIOR")),
    ...(await photoContentBlocks(input.baseline, "DÍA 1")),
  ];

  const client = anthropicClient();
  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: VISION_SYSTEM,
    tools: [VISION_TOOL],
    tool_choice: { type: "tool", name: VISION_TOOL_NAME },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") return null;

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === VISION_TOOL_NAME,
  );
  if (!toolUse) return null;

  const raw = (
    typeof toolUse.input === "string" ? JSON.parse(toolUse.input) : toolUse.input
  ) as Record<string, unknown>;

  const vsPrevious = readings(raw.vs_semana_anterior);
  const vsBaseline = readings(raw.vs_dia_1);

  if (vsPrevious.length === 0 && vsBaseline.length === 0) return null;

  return {
    vsPrevious,
    vsBaseline,
    trend: summarizeTrend(vsPrevious.length > 0 ? vsPrevious : vsBaseline),
    model: VISION_MODEL,
    analyzedAt: new Date().toISOString(),
  };
}
