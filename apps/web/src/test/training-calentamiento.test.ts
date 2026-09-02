import { describe, expect, it } from "vitest";

import { calentamientoPara } from "@/lib/training/calentamiento";
import { parseStoredPlan } from "@/lib/training/db";
import type { DayKind } from "@/lib/training/types";

/**
 * El calentamiento dinámico previo a la sesión (feedback del dueño,
 * 2026-09): SIEMPRE antes del primer ejercicio, dinámico (nunca estático),
 * 6-8 min, específico del grupo del día.
 */

const DAY_KINDS: DayKind[] = [
  "PIERNA_CUADRICEPS",
  "PIERNA_FEMORAL",
  "PIERNA_GLUTEO",
  "HOMBRO",
  "PECHO_ESPALDA",
  "BRAZO",
  "HOMBRO_BRAZO",
  "TORSO",
];

describe("calentamientoPara", () => {
  it("dura entre 6 y 8 minutos para cada tipo de día", () => {
    for (const dayKind of DAY_KINDS) {
      const { totalSeg } = calentamientoPara(dayKind);
      expect(totalSeg).toBeGreaterThanOrEqual(6 * 60);
      expect(totalSeg).toBeLessThanOrEqual(8 * 60);
    }
  });

  it("siempre empieza elevando el pulso, 2 minutos", () => {
    for (const dayKind of DAY_KINDS) {
      const { pasos } = calentamientoPara(dayKind);
      expect(pasos[0]?.nombre).toBe("Eleva el pulso: caminadora, cuerda o saltos suaves");
      expect(pasos[0]?.segundos).toBe(120);
    }
  });

  it("todos los pasos duran entre 20 y 120 segundos", () => {
    for (const dayKind of DAY_KINDS) {
      const { pasos } = calentamientoPara(dayKind);
      for (const paso of pasos) {
        expect(paso.segundos).toBeGreaterThanOrEqual(20);
        expect(paso.segundos).toBeLessThanOrEqual(120);
      }
    }
  });

  it("el totalSeg es la suma exacta de los pasos", () => {
    for (const dayKind of DAY_KINDS) {
      const { pasos, totalSeg } = calentamientoPara(dayKind);
      const suma = pasos.reduce((total, paso) => total + paso.segundos, 0);
      expect(totalSeg).toBe(suma);
    }
  });

  it("trae al menos 4 movimientos además de elevar el pulso, específicos del día", () => {
    for (const dayKind of DAY_KINDS) {
      const { pasos } = calentamientoPara(dayKind);
      expect(pasos.length - 1).toBeGreaterThanOrEqual(4);
    }
  });

  it("un día de pierna y uno de torso no calientan con los mismos movimientos", () => {
    const pierna = calentamientoPara("PIERNA_CUADRICEPS").pasos.map((p) => p.nombre);
    const torso = calentamientoPara("TORSO").pasos.map((p) => p.nombre);
    const compartidos = pierna.filter((nombre) => torso.includes(nombre));
    // Comparten a lo más el paso de elevar el pulso, que siempre va primero.
    expect(compartidos).toEqual(["Eleva el pulso: caminadora, cuerda o saltos suaves"]);
  });
});

describe("parseStoredPlan — warmup tolerante", () => {
  it("una sesión guardada sin warmup (antes de esta fase) devuelve null, no truena", () => {
    const plan = parseStoredPlan({
      dayKind: "PIERNA_CUADRICEPS",
      schemeLabel: "5 series 10-8-6-4-2 subiendo peso",
      cardioMinutes: null,
      exercises: [],
    });
    expect(plan.warmup).toBeNull();
  });

  it("una sesión con warmup corrupto (sin pasos utilizables) devuelve null", () => {
    const plan = parseStoredPlan({
      dayKind: "PIERNA_CUADRICEPS",
      schemeLabel: "",
      cardioMinutes: null,
      warmup: { pasos: "no es un array" },
      exercises: [],
    });
    expect(plan.warmup).toBeNull();
  });

  it("una sesión con warmup válido lo devuelve tal cual, con el total recalculado si falta", () => {
    const plan = parseStoredPlan({
      dayKind: "HOMBRO",
      schemeLabel: "",
      cardioMinutes: null,
      warmup: {
        pasos: [
          { nombre: "Eleva el pulso: caminadora, cuerda o saltos suaves", segundos: 120 },
          { nombre: "Círculos de brazos", segundos: 45 },
        ],
      },
      exercises: [],
    });
    expect(plan.warmup).not.toBeNull();
    expect(plan.warmup?.pasos).toHaveLength(2);
    expect(plan.warmup?.totalSeg).toBe(165);
  });

  it("un array pelón (formato pre-Fase-4) también devuelve warmup null", () => {
    const plan = parseStoredPlan([]);
    expect(plan.warmup).toBeNull();
  });
});
