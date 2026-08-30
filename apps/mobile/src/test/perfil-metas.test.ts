import { describe, expect, it } from "vitest";

import { brechasDelMes, metasDelMes } from "@/lib/metas";
import { perfilDeEjes } from "@/lib/perfil";
import type { CheckInPoint, HealthDayPayload, WeekView } from "@/lib/api";

/**
 * Los dos gráficos que se leían al revés.
 *
 * Las dos pruebas centrales salen de lo que reportó la primera persona que usó
 * la pantalla: "3.4 kg más" leído como que había que subir, y una telaraña
 * ancha leída como "voy bien" a mitad de semana con dos sesiones de cinco.
 */

function punto(date: string, over: Partial<CheckInPoint> = {}): CheckInPoint {
  return {
    id: date,
    date,
    waistCm: null,
    weightKg: null,
    armLeftCm: null,
    armRightCm: null,
    legLeftCm: null,
    legRightCm: null,
    dietCompliance: 100,
    ...over,
  } as CheckInPoint;
}

describe("metas del mes", () => {
  it("dice POR BAJAR cuando la meta está debajo, no solo el número", () => {
    const metas = metasDelMes(
      [punto("2026-08-01", { weightKg: 100 }), punto("2026-08-29", { weightKg: 99 })],
      "PERDIDA_GRASA",
      "2026-08-29",
    );
    const peso = brechasDelMes(metas.medidas).find((brecha) => brecha.label === "Peso");

    expect(peso?.nota).toContain("por bajar");
    expect(peso?.nota).not.toContain("más");
  });

  it("dice POR SUBIR cuando la meta está arriba", () => {
    const metas = metasDelMes(
      [
        punto("2026-08-01", { armLeftCm: 30, armRightCm: 30 }),
        punto("2026-08-29", { armLeftCm: 30, armRightCm: 30 }),
      ],
      "GANANCIA_MUSCULO",
      "2026-08-29",
    );
    const brazos = brechasDelMes(metas.medidas).find((brecha) => brecha.label === "Brazos");

    expect(brazos?.nota).toContain("por subir");
  });

  it("lleva el valor de hoy y el del escalón, no solo el riel", () => {
    const metas = metasDelMes(
      [punto("2026-08-01", { waistCm: 100 }), punto("2026-08-29", { waistCm: 98 })],
      "PERDIDA_GRASA",
      "2026-08-29",
    );
    const cintura = brechasDelMes(metas.medidas).find((brecha) => brecha.label === "Cintura");

    expect(cintura?.actual).toBe("98 cm");
    expect(cintura?.meta).toBe("98 cm");
  });

  it("las medidas de cinta se marcan como mensuales", () => {
    const metas = metasDelMes(
      [
        punto("2026-08-01", { armLeftCm: 30, armRightCm: 30, waistCm: 100 }),
        punto("2026-08-29", { armLeftCm: 31, armRightCm: 31, waistCm: 98 }),
      ],
      "RECOMPOSICION",
      "2026-08-29",
    );
    const brechas = brechasDelMes(metas.medidas);

    expect(brechas.find((brecha) => brecha.label === "Brazos")?.cadencia).toBe("mensual");
    expect(brechas.find((brecha) => brecha.label === "Cintura")?.cadencia).toBe("semanal");
  });
});

describe("perfil de la telaraña", () => {
  const dias: HealthDayPayload[] = [];

  function semana(fechas: Array<{ date: string; hecha: boolean }>): WeekView {
    return {
      weekStart: "2026-08-24",
      today: "2026-08-26",
      sessions: fechas.map((entrada, index) => ({
        workoutId: `w${index}`,
        date: entrada.date,
        muscleGroup: "Pierna",
        scheme: "PIRAMIDAL",
        schemeLabel: "Piramidal",
        cardioMinutes: null,
        completedAt: entrada.hecha ? `${entrada.date}T18:00:00.000Z` : null,
        trimmedMinutes: null,
        cycleNote: null,
        readinessNote: null,
        exercises: [],
      })),
    } as unknown as WeekView;
  }

  it("la rutina se mide contra lo que YA TOCABA, no contra la semana entera", () => {
    // Miércoles: tocaban dos y se hicieron dos. Eso es ir al corriente, aunque
    // falten tres sesiones de aquí al domingo.
    const ejes = perfilDeEjes({
      healthDays: dias,
      week: semana([
        { date: "2026-08-24", hecha: true },
        { date: "2026-08-25", hecha: true },
        { date: "2026-08-27", hecha: false },
        { date: "2026-08-28", hecha: false },
        { date: "2026-08-29", hecha: false },
      ]),
      points: [],
      hoy: "2026-08-26",
    });

    const rutina = ejes.find((eje) => eje.label === "Rutina");
    expect(rutina?.value).toBe(1);
    expect(rutina?.detalle).toBe("2 de 2 que ya tocaban");
  });

  it("y castiga cuando de verdad se falló", () => {
    const ejes = perfilDeEjes({
      healthDays: dias,
      week: semana([
        { date: "2026-08-24", hecha: true },
        { date: "2026-08-25", hecha: false },
        { date: "2026-08-26", hecha: false },
      ]),
      points: [],
      hoy: "2026-08-26",
    });

    expect(ejes.find((eje) => eje.label === "Rutina")?.value).toBeCloseTo(1 / 3, 2);
  });

  it("todos los ejes traen su referencia esperada y su dato legible", () => {
    const ejes = perfilDeEjes({
      healthDays: dias,
      week: semana([{ date: "2026-08-24", hecha: true }]),
      points: [],
      hoy: "2026-08-26",
    });

    for (const eje of ejes) {
      expect(typeof eje.esperado, eje.label).toBe("number");
      expect(eje.referencia, eje.label).toBeTruthy();
    }
  });
});
