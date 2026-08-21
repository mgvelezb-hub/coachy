import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { persistCheckIn } from "@/lib/checkin-write";
import { previousCheckIn, toChartSeries } from "@/lib/checkins";
import { prisma } from "@/lib/prisma";
import { checkInSchema, type CheckInInput } from "@/lib/validation/checkin";

/**
 * Prueba de integración contra la base local.
 *
 * Se salta sola si no hay `DATABASE_URL` o si la base no responde, para que
 * `pnpm test` siga sirviendo en una máquina recién clonada o en CI sin Postgres.
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

function input(overrides: Partial<CheckInInput> = {}): CheckInInput {
  return checkInSchema.parse({
    date: "2026-08-23",
    waistCm: 89.5,
    weightKg: 75,
    legLeftCm: 61,
    legRightCm: 63,
    armLeftCm: 32,
    armRightCm: 33,
    inflammation: 3,
    energy: 4,
    hunger: 2,
    satiety: 4,
    sleep: 3,
    strengthRpe: 8,
    strengthTrend: "SUBE",
    dietCompliance: 85,
    trainingCompliance: 100,
    symptoms: [],
    comment: "",
    ...overrides,
  });
}

describe.skipIf(!available)("persistCheckIn contra la base", () => {
  const userId = randomUUID();
  const email = `test-${userId}@coachy.invalid`;

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email, role: "ATHLETE" } });
    await prisma.profile.create({
      data: {
        userId,
        displayName: "Atleta de prueba",
        sex: "FEMALE",
        heightCm: "162.0",
        weightKg: "75.0",
        liftingDays: 4,
        mealsPerDay: 4,
        goal: "RECOMPOSICION",
        onboardingCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // El borrado en cascada se lleva check-ins, fotos y decisiones.
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("guarda el check-in con las medidas intactas", async () => {
    const checkIn = await persistCheckIn(userId, input());

    expect(checkIn.userId).toBe(userId);
    expect(Number(checkIn.waistCm)).toBe(89.5);
    expect(Number(checkIn.weightKg)).toBe(75);
    expect(checkIn.dietCompliance).toBe(85);
    expect(checkIn.strengthTrend).toBe("SUBE");
  });

  it("es idempotente por semana: reenviar corrige, no duplica", async () => {
    await persistCheckIn(userId, input({ waistCm: 89.5 }));
    const corrected = await persistCheckIn(userId, input({ waistCm: 88.9 }));

    const count = await prisma.checkIn.count({ where: { userId } });
    expect(count).toBe(1);
    expect(Number(corrected.waistCm)).toBe(88.9);
  });

  it("pega el síntoma 'otro' al comentario, para que quede legible", async () => {
    const checkIn = await persistCheckIn(
      userId,
      input({ symptoms: ["otro"], otherSymptom: "dolor de muñeca", comment: "Semana rara" }),
    );

    expect(checkIn.comment).toContain("Semana rara");
    expect(checkIn.comment).toContain("dolor de muñeca");
  });

  it("guarda null en las medidas opcionales que se dejaron vacías", async () => {
    const checkIn = await persistCheckIn(
      userId,
      input({ date: "2026-08-30", weightKg: null, legLeftCm: null }),
    );

    expect(checkIn.weightKg).toBeNull();
    expect(checkIn.legLeftCm).toBeNull();
  });

  it("encuentra el check-in anterior, que es lo que alimenta la foto guía", async () => {
    const previous = await previousCheckIn(userId, new Date("2026-08-30T12:00:00.000Z"));

    expect(previous).not.toBeNull();
    expect(previous?.date.toISOString().slice(0, 10)).toBe("2026-08-23");
  });

  it("devuelve la serie para las gráficas ordenada y ya en números", async () => {
    const series = await toChartSeries(userId);

    expect(series.length).toBe(2);
    expect(series[0]?.date).toBe("2026-08-23");
    expect(series[1]?.date).toBe("2026-08-30");
    expect(typeof series[0]?.waistCm).toBe("number");
  });

  it("no deja ver los check-ins de otro atleta", async () => {
    const otherId = randomUUID();
    await prisma.user.create({
      data: { id: otherId, email: `test-${otherId}@coachy.invalid`, role: "ATHLETE" },
    });

    const series = await toChartSeries(otherId);
    expect(series).toEqual([]);

    await prisma.user.deleteMany({ where: { id: otherId } });
  });
});

describe.skipIf(available)("persistCheckIn sin base", () => {
  it("se salta la suite de integración cuando no hay Postgres", () => {
    expect(available).toBe(false);
  });
});
