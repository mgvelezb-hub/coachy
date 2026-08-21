import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente de Anthropic, perezoso como los de Supabase: el build no necesita la
 * llave y el error aparece cuando algo intenta usarla de verdad.
 *
 * Modelos (spec 03 §4): Sonnet 5 para redacción y visión, Haiku para lo barato
 * (transcripción, clasificación). Se pueden sobreescribir por env para probar
 * sin tocar código.
 */

export const COMPOSE_MODEL = process.env.COACHY_COMPOSE_MODEL ?? "claude-sonnet-5";
export const VISION_MODEL = process.env.COACHY_VISION_MODEL ?? "claude-sonnet-5";
export const FAST_MODEL = process.env.COACHY_FAST_MODEL ?? "claude-haiku-4-5";

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super(
      "Falta ANTHROPIC_API_KEY. Ponla en apps/web/.env.local (o exportala en la shell) " +
        "para que Coachy pueda redactar. Consíguela en console.anthropic.com.",
    );
    this.name = "MissingAnthropicKeyError";
  }
}

export function hasAnthropicKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  // El placeholder de .env.example no cuenta como llave.
  return Boolean(key) && key !== "sk-ant-..." && (key?.length ?? 0) > 20;
}

let client: Anthropic | null = null;
let testClient: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (testClient) return testClient;
  if (!hasAnthropicKey()) throw new MissingAnthropicKeyError();
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Solo para pruebas: inyecta un doble del cliente y evita salir a la red. */
export function setAnthropicClientForTests(fake: Anthropic | null): void {
  testClient = fake;
}
