import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integración de `POST /api/v1/onboarding` contra la base local. Se salta
 * sola si no hay Postgres, igual que las demás pruebas de base
 * (`health-db.test.ts`, `training-db.test.ts`, ...).
 *
 * `apiUser` (`@/lib/api/auth`) valida el JWT contra Supabase por red — no hay
 * forma de fabricar uno válido en una prueba local. Se mockea SOLO esa
 * función, con una implementación que sigue yendo a la base real: lee el id
 * de un header de prueba (`x-test-user-id`) y hace el mismo
 * `prisma.user.findUnique({ include: { profile: true } })` que haría
 * `upsertSessionUser` con un JWT de verdad. Todo lo demás —la ruta, el
 * helper `saveOnboarding`, el upsert— corre sin mockear.
 */
vi.mock("@/lib/api/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/auth")>("@/lib/api/auth");
  return {
    ...actual,
    apiUser: vi.fn(async (request: Request) => {
      const userId = request.headers.get("x-test-user-id");
      if (!userId) return null;
      const { prisma } = await import("@/lib/prisma");
      return prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    }),
  };
});

const { POST } = await import("@/app/api/v1/onboarding/route");
const { prisma } = await import("@/lib/prisma");

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

function onboardingRequest(userId: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (userId) headers["x-test-user-id"] = userId;
  return new Request("http://localhost/api/v1/onboarding", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Cuestionario mínimo válido — mismo shape de ENTRADA que `onboardingSchema`. */
function validPayload() {
  return {
    displayName: "Atleta de API",
    sex: "FEMALE",
    birthDate: "1998-04-12",
    heightCm: 162,
    weightKg: 60,
    liftingDays: 4,
    mealsPerDay: 4,
    goal: "RECOMPOSICION",
  };
}

describe.skipIf(!available)("POST /api/v1/onboarding contra la base", () => {
  const userId = randomUUID();
  const email = `test-onboarding-${userId}@coachy.invalid`;

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email, role: "ATHLETE" } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("sin sesión, 401", async () => {
    const response = await POST(onboardingRequest(null, validPayload()));
    expect(response.status).toBe(401);
  });

  it("un cuestionario incompleto se rechaza con 422 y los campos marcados", async () => {
    const response = await POST(onboardingRequest(userId, {}));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { detalles: Record<string, string> };
    expect(Object.keys(body.detalles)).toEqual(
      expect.arrayContaining(["displayName", "sex", "birthDate", "heightCm", "weightKg", "liftingDays", "mealsPerDay", "goal"]),
    );
  });

  it("crea el perfil y marca el onboarding completo — misma escritura que la web", async () => {
    const response = await POST(onboardingRequest(userId, validPayload()));
    expect(response.status).toBe(201);

    const body = (await response.json()) as { onboarded: boolean; profile: { displayName: string } };
    expect(body.onboarded).toBe(true);
    expect(body.profile.displayName).toBe("Atleta de API");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    expect(profile?.onboardingCompletedAt).not.toBeNull();
    expect(profile?.goal).toBe("RECOMPOSICION");
  });

  it("reenviar el mismo cuestionario se rechaza con 409: no se pisa un perfil ya completo", async () => {
    const response = await POST(onboardingRequest(userId, validPayload()));
    expect(response.status).toBe(409);

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("ya completaste tu perfil");
  });
});
