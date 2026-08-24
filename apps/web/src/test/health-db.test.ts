import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/health/ingest/route";
import {
  activityWindow,
  ensureHealthToken,
  healthStatus,
  regenerateHealthToken,
  sleepMinutesFor,
  upsertHealthDays,
  userIdForToken,
} from "@/lib/health/db";
import { rateLimit, resetRateLimit } from "@/lib/health/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * Integración de la Fase 8 contra la base local. Se salta sola si no hay
 * Postgres, igual que las demás pruebas de base.
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`select 1`;
    return true;
  } catch {
    return false;
  }
}

const available = await databaseReachable();

function ingest(token: string | null, body: unknown): Request {
  return new Request("http://localhost/api/health/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!available)("datos del reloj contra la base", () => {
  const userId = randomUUID();
  const email = `test-${userId}@coachy.invalid`;
  let token = "";

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email, role: "ATHLETE" } });
    await prisma.profile.create({
      data: { userId, displayName: "Atleta de prueba", sex: "FEMALE", heightCm: "162.0" },
    });
    token = await ensureHealthToken(userId);
  });

  beforeEach(() => {
    resetRateLimit();
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("el token se crea una vez y se puede regenerar", async () => {
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(await ensureHealthToken(userId)).toBe(token);
    expect(await userIdForToken(token)).toBe(userId);

    const rotated = await regenerateHealthToken(userId);
    expect(rotated).not.toBe(token);
    // El atajo viejo deja de servir en ese instante.
    expect(await userIdForToken(token)).toBeNull();
    token = rotated;
  });

  it("un token con forma inválida no llega ni a la base", async () => {
    expect(await userIdForToken("no-es-un-uuid")).toBeNull();
    expect(await userIdForToken("")).toBeNull();
  });

  it("guarda un día y lo devuelve en el GET", async () => {
    const response = await POST(
      ingest(token, {
        date: "2026-08-20",
        steps: 9_120,
        activeKcal: 430,
        exerciseMin: 62,
        sleepMin: 402,
        restingHr: 58,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, guardados: 1 });

    const read = await GET(
      new Request("http://localhost/api/health/ingest", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const body = (await read.json()) as { dias: Array<{ date: string; steps: number }> };
    expect(body.dias[0]).toMatchObject({ date: "2026-08-20", steps: 9_120 });
  });

  it("reenviar el mismo día corrige y no duplica", async () => {
    await POST(ingest(token, { date: "2026-08-20", steps: 10_000 }));

    const rows = await prisma.healthDay.findMany({ where: { userId, date: new Date("2026-08-20") } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.steps).toBe(10_000);
    // Lo que no vino en el segundo envío no se borró.
    expect(rows[0]?.sleepMin).toBe(402);
  });

  it("acepta varios días de golpe", async () => {
    const response = await POST(
      ingest(token, {
        days: [
          { date: "2026-08-18", steps: 7_000 },
          { date: "2026-08-19", steps: 8_000, sleepMin: 300 },
        ],
      }),
    );

    expect(await response.json()).toMatchObject({ guardados: 2 });
    expect(await sleepMinutesFor(userId, "2026-08-19")).toBe(300);
    expect(await sleepMinutesFor(userId, "2026-08-17")).toBeNull();
  });

  it("sin token, con token ajeno o con basura: la misma respuesta", async () => {
    const sinToken = await POST(ingest(null, { date: "2026-08-21", steps: 1 }));
    const ajeno = await POST(ingest(randomUUID(), { date: "2026-08-21", steps: 1 }));
    const basura = await POST(ingest("no-es-un-uuid", { date: "2026-08-21", steps: 1 }));

    expect([sinToken.status, ajeno.status, basura.status]).toEqual([401, 401, 401]);
    expect(await ajeno.json()).toEqual(await basura.json());
  });

  it("un cuerpo fuera de rango se rechaza sin escribir nada", async () => {
    const response = await POST(ingest(token, { date: "20 de agosto", steps: 9_000 }));
    expect(response.status).toBe(422);

    const negativo = await POST(ingest(token, { date: "2026-08-22", steps: -5 }));
    expect(negativo.status).toBe(422);
    expect(await prisma.healthDay.count({ where: { userId, date: new Date("2026-08-22") } })).toBe(0);
  });

  it("la respuesta nunca trae el token", async () => {
    const response = await POST(ingest(token, { date: "2026-08-23", steps: 5_000 }));
    expect(JSON.stringify(await response.json())).not.toContain(token);
  });

  it("arma la ventana de actividad y el estado de la tarjeta", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      steps: 12_500,
      sleepMin: 420,
    }));
    await upsertHealthDays(userId, many);

    const window = await activityWindow(userId, new Date("2026-08-25T12:00:00.000Z"));
    expect(window?.days).toBeGreaterThanOrEqual(20);
    expect(window?.band).toBe("muy_activo");

    const status = await healthStatus(userId);
    expect(status.lastDate).not.toBeNull();
    expect(status.avgSteps).toBeGreaterThan(0);
  });
});

describe("freno del endpoint", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("deja pasar lo normal y corta el abuso", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("t:prueba", now, { max: 5, windowMs: 1_000 }).ok).toBe(true);
    }

    const blocked = rateLimit("t:prueba", now, { max: 5, windowMs: 1_000 });
    expect(blocked.ok).toBe(false);

    // Pasada la ventana, la cuenta se reinicia.
    expect(rateLimit("t:prueba", now + 1_001, { max: 5, windowMs: 1_000 }).ok).toBe(true);
  });

  it("cada llave lleva su propia cuenta", () => {
    const now = Date.now();
    expect(rateLimit("t:uno", now, { max: 1 }).ok).toBe(true);
    expect(rateLimit("t:uno", now, { max: 1 }).ok).toBe(false);
    expect(rateLimit("t:dos", now, { max: 1 }).ok).toBe(true);
  });
});
