import { describe, expect, it } from "vitest";

import { activitiesIngestSchema, activitySessionSchema } from "@/lib/activity/schema";

/**
 * Zod de `/api/v1/activities`. Pruebas puras: nada de Postgres, solo la
 * forma del payload y los topes de cordura.
 */

function session(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    discipline: "NATACION",
    source: "APP",
    startedAt: "2026-08-27T07:00:00.000Z",
    endedAt: "2026-08-27T07:45:00.000Z",
    date: "2026-08-27",
    durationMin: 45,
    ...overrides,
  };
}

describe("activitySessionSchema", () => {
  it("acepta una sesión mínima capturada a mano", () => {
    const parsed = activitySessionSchema.safeParse(session());
    expect(parsed.success).toBe(true);
  });

  it("acepta una sesión de HealthKit con externalId y métricas completas", () => {
    const parsed = activitySessionSchema.safeParse(
      session({
        source: "HEALTHKIT",
        externalId: "a1b2c3d4-0000-4000-8000-000000000000",
        activeKcal: 420,
        avgHr: 132,
        maxHr: 168,
        distanceM: 1500,
        notes: "Serie continua",
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rechaza una disciplina que no existe", () => {
    const parsed = activitySessionSchema.safeParse(session({ discipline: "YOGA" }));
    expect(parsed.success).toBe(false);
  });

  it("rechaza endedAt antes de startedAt", () => {
    const parsed = activitySessionSchema.safeParse(
      session({
        startedAt: "2026-08-27T07:45:00.000Z",
        endedAt: "2026-08-27T07:00:00.000Z",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rechaza una sesión de 3 días", () => {
    const parsed = activitySessionSchema.safeParse(session({ durationMin: 3 * 24 * 60 }));
    expect(parsed.success).toBe(false);
  });

  it("rechaza una distancia imposible (900 km)", () => {
    const parsed = activitySessionSchema.safeParse(session({ distanceM: 900_000 }));
    expect(parsed.success).toBe(false);
  });

  it("rechaza una frecuencia cardiaca fuera de rango humano", () => {
    const parsed = activitySessionSchema.safeParse(session({ avgHr: 400 }));
    expect(parsed.success).toBe(false);
  });

  it("rechaza una fecha con formato inválido", () => {
    const parsed = activitySessionSchema.safeParse(session({ date: "27-08-2026" }));
    expect(parsed.success).toBe(false);
  });

  it("no acepta userId en el cuerpo: no es parte del esquema", () => {
    // El esquema simplemente ignora campos desconocidos por default en zod;
    // lo que importa es que `userId` nunca llegue a `ActivitySessionInput`.
    const parsed = activitySessionSchema.parse(session({ userId: "otro-atleta" }));
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("activitiesIngestSchema", () => {
  it("acepta un lote de varias sesiones", () => {
    const parsed = activitiesIngestSchema.safeParse({ activities: [session(), session()] });
    expect(parsed.success).toBe(true);
  });

  it("rechaza un lote vacío", () => {
    const parsed = activitiesIngestSchema.safeParse({ activities: [] });
    expect(parsed.success).toBe(false);
  });

  it("rechaza un lote de más de 50 sesiones", () => {
    const activities = Array.from({ length: 51 }, () => session());
    const parsed = activitiesIngestSchema.safeParse({ activities });
    expect(parsed.success).toBe(false);
  });
});
