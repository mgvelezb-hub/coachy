import { describe, expect, it } from "vitest";

import {
  checkInSchema,
  coerceCheckInPayload,
  complianceStepSchema,
  measurementsStepSchema,
  sensationsStepSchema,
  validatePhotoFile,
} from "@/lib/validation/checkin";

/** Un check-in mínimo válido, para mutarlo en cada caso. */
function validCheckIn() {
  return {
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
    strengthTrend: "SUBE" as const,
    dietCompliance: 85,
    trainingCompliance: 100,
    symptoms: [],
    cyclePhase: "FOLICULAR" as const,
    comment: "Buena semana",
  };
}

describe("measurementsStepSchema", () => {
  it("acepta la cintura sola: es el único dato obligatorio", () => {
    const result = measurementsStepSchema.safeParse({ date: "2026-08-23", waistCm: 90 });
    expect(result.success).toBe(true);
  });

  it("rechaza un check-in sin cintura", () => {
    const result = measurementsStepSchema.safeParse({ date: "2026-08-23" });
    expect(result.success).toBe(false);
  });

  it("rechaza medidas con más de un decimal", () => {
    const result = measurementsStepSchema.safeParse({ date: "2026-08-23", waistCm: 90.25 });
    expect(result.success).toBe(false);
  });

  it("rechaza medidas fuera del rango físico", () => {
    expect(measurementsStepSchema.safeParse({ date: "2026-08-23", waistCm: 5 }).success).toBe(false);
    expect(measurementsStepSchema.safeParse({ date: "2026-08-23", waistCm: 900 }).success).toBe(
      false,
    );
  });

  it("rechaza una fecha que no es ISO", () => {
    const result = measurementsStepSchema.safeParse({ date: "23/08/2026", waistCm: 90 });
    expect(result.success).toBe(false);
  });

  it("deja pasar las medidas opcionales en null", () => {
    const result = measurementsStepSchema.safeParse({
      date: "2026-08-23",
      waistCm: 90,
      weightKg: null,
      legLeftCm: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("sensationsStepSchema", () => {
  it("acepta la escala completa 1-5", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      const result = sensationsStepSchema.safeParse({
        inflammation: value,
        energy: value,
        hunger: value,
        satiety: value,
        sleep: value,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rechaza un 0 y un 6 en la escala", () => {
    const base = { inflammation: 3, energy: 3, hunger: 3, satiety: 3, sleep: 3 };
    expect(sensationsStepSchema.safeParse({ ...base, energy: 0 }).success).toBe(false);
    expect(sensationsStepSchema.safeParse({ ...base, energy: 6 }).success).toBe(false);
  });

  it("acota el RPE a 1-10", () => {
    const base = { inflammation: 3, energy: 3, hunger: 3, satiety: 3, sleep: 3 };
    expect(sensationsStepSchema.safeParse({ ...base, strengthRpe: 10 }).success).toBe(true);
    expect(sensationsStepSchema.safeParse({ ...base, strengthRpe: 11 }).success).toBe(false);
  });
});

describe("complianceStepSchema", () => {
  it("acepta 0 y 100 por ciento", () => {
    expect(
      complianceStepSchema.safeParse({ dietCompliance: 0, trainingCompliance: 100 }).success,
    ).toBe(true);
  });

  it("rechaza más de 100 por ciento", () => {
    expect(
      complianceStepSchema.safeParse({ dietCompliance: 120, trainingCompliance: 100 }).success,
    ).toBe(false);
  });

  it("rechaza un síntoma que no está en el catálogo", () => {
    const result = complianceStepSchema.safeParse({
      dietCompliance: 90,
      trainingCompliance: 90,
      symptoms: ["dolor_de_alma"],
    });
    expect(result.success).toBe(false);
  });

  it("deja los síntomas vacíos por defecto", () => {
    const result = complianceStepSchema.parse({ dietCompliance: 90, trainingCompliance: 90 });
    expect(result.symptoms).toEqual([]);
  });
});

describe("checkInSchema", () => {
  it("acepta un check-in completo", () => {
    expect(checkInSchema.safeParse(validCheckIn()).success).toBe(true);
  });

  it("junta los cuatro pasos: falla si falta cualquiera", () => {
    const { inflammation: _drop, ...incomplete } = validCheckIn();
    expect(checkInSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("coerceCheckInPayload", () => {
  it("convierte los strings del formulario a números", () => {
    const raw = {
      date: "2026-08-23",
      waistCm: "89.5",
      inflammation: "3",
      energy: "4",
      hunger: "2",
      satiety: "4",
      sleep: "3",
      dietCompliance: "85",
      trainingCompliance: "100",
      symptoms: [],
    };
    const result = checkInSchema.safeParse(coerceCheckInPayload(raw));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.waistCm).toBe(89.5);
  });

  it("acepta la coma decimal del teclado en español", () => {
    const coerced = coerceCheckInPayload({ waistCm: "89,5" }) as { waistCm: number };
    expect(coerced.waistCm).toBe(89.5);
  });

  it("convierte los campos opcionales vacíos en null, no en cero", () => {
    const coerced = coerceCheckInPayload({ weightKg: "", legLeftCm: "" }) as Record<string, unknown>;
    expect(coerced.weightKg).toBeNull();
    expect(coerced.legLeftCm).toBeNull();
  });

  it("redondea a un decimal, que es lo que aguanta la columna", () => {
    const coerced = coerceCheckInPayload({ waistCm: "89.47" }) as { waistCm: number };
    expect(coerced.waistCm).toBe(89.5);
  });
});

describe("validatePhotoFile", () => {
  it("acepta un JPEG normal", () => {
    expect(validatePhotoFile({ size: 1_200_000, type: "image/jpeg" }).ok).toBe(true);
  });

  it("rechaza un archivo vacío", () => {
    expect(validatePhotoFile({ size: 0, type: "image/jpeg" }).ok).toBe(false);
  });

  it("rechaza una foto de más de 8 MB", () => {
    expect(validatePhotoFile({ size: 9_000_000, type: "image/jpeg" }).ok).toBe(false);
  });

  it("rechaza un PDF disfrazado de foto", () => {
    expect(validatePhotoFile({ size: 1000, type: "application/pdf" }).ok).toBe(false);
  });
});
