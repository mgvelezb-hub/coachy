import { describe, expect, it } from "vitest";

import {
  citableNumbers,
  computeProgressMetrics,
  formatDelta,
  streakOf,
  templateSummary,
  type ProgressCheckIn,
} from "@/lib/coachy/progress-metrics";
import { citesOnlyEngineNumbers, fingerprintOf } from "@/lib/coachy/progress-summary";

/**
 * "Tu avance": las cifras y el candado.
 *
 * Lo que se prueba aquí no es la redacción sino la frontera — el historial da
 * los números y la IA solo puede citarlos. Si se inventa uno, el texto se tira.
 */

function checkIn(overrides: Partial<ProgressCheckIn> & { date: string }): ProgressCheckIn {
  return { waistCm: null, weightKg: null, inconclusive: false, ...overrides };
}

const HISTORY: ProgressCheckIn[] = [
  checkIn({ date: "2026-01-17", waistCm: 96.5, weightKg: 75 }),
  checkIn({ date: "2026-02-16", waistCm: 90 }),
  checkIn({ date: "2026-02-22", waistCm: 90 }),
  checkIn({ date: "2026-03-01", waistCm: 89 }),
  checkIn({ date: "2026-03-08", waistCm: 88, inconclusive: true }),
  checkIn({ date: "2026-03-21", waistCm: 89 }),
  checkIn({ date: "2026-08-21", weightKg: 80 }),
];

describe("cifras del avance", () => {
  const metrics = computeProgressMetrics({
    checkIns: HISTORY,
    records: [
      { exerciseName: "Prensa de pierna", weightKg: 120, reps: 12, date: "2026-03-10" },
      { exerciseName: "Remo sentado", weightKg: 45, reps: 15, date: "2026-03-18" },
    ],
    today: "2026-08-24",
  });

  it("mide la cintura desde el primer registro con dato", () => {
    expect(metrics.waistTotal?.value).toBe(-7.5);
    expect(metrics.waistTotal?.fromDate).toBe("2026-01-17");
    expect(metrics.waistTotal?.toDate).toBe("2026-03-21");
  });

  it("la tendencia reciente ignora las semanas no concluyentes", () => {
    expect(metrics.waistRecent?.toDate).toBe("2026-03-21");
    expect(metrics.waistRecent?.fromDate).toBe("2026-02-22");
    // El 08/03 baja a 88 pero es lútea: no cuenta.
    expect(metrics.waistRecent?.value).toBe(-1);
  });

  it("reporta el peso, pero nunca es el titular", () => {
    expect(metrics.weight?.value).toBe(5);
    const [primera] = templateSummary(metrics);
    expect(primera).toContain("cintura");
  });

  it("llama recomposición a peso que sube con cintura que baja", () => {
    const texto = templateSummary(metrics).join(" ");
    expect(texto).toContain("recomposición");
    expect(texto).toContain("la cinta pesa más que la báscula");
  });

  it("toma el récord más reciente del gimnasio", () => {
    expect(metrics.bestRecord?.exerciseName).toBe("Remo sentado");
  });

  it("cuenta la racha con cadencia semanal y la corta en el hueco largo", () => {
    expect(metrics.streakWeeks).toBe(1);
    expect(
      streakOf([
        checkIn({ date: "2026-08-02" }),
        checkIn({ date: "2026-08-09" }),
        checkIn({ date: "2026-08-16" }),
      ]),
    ).toBe(3);
  });

  it("sin historial la sección sigue diciendo algo útil", () => {
    const vacio = computeProgressMetrics({ checkIns: [], records: [], today: "2026-08-24" });

    expect(vacio.waistTotal).toBeNull();
    expect(vacio.totalCheckIns).toBe(0);
    expect(templateSummary(vacio).join(" ")).toContain("primer check-in");
  });

  it("con una sola medición no inventa una tendencia", () => {
    const uno = computeProgressMetrics({
      checkIns: [checkIn({ date: "2026-08-16", waistCm: 90 })],
      records: [],
      today: "2026-08-24",
    });

    expect(uno.waistTotal).toBeNull();
    expect(uno.waistRecent).toBeNull();
  });

  it("formatea los deltas con signo y sin ruido", () => {
    expect(formatDelta(-1.5, "cm")).toBe("−1.5 cm");
    expect(formatDelta(2, "kg")).toBe("+2.0 kg");
    expect(formatDelta(0, "cm")).toBe("sin cambio");
  });

  it("la huella cambia cuando llega un check-in nuevo", () => {
    const conMas = computeProgressMetrics({
      checkIns: [...HISTORY, checkIn({ date: "2026-08-28", waistCm: 88 })],
      records: [],
      today: "2026-08-30",
    });

    expect(fingerprintOf(conMas)).not.toBe(fingerprintOf(metrics));
  });
});

describe("candado de cifras", () => {
  const metrics = computeProgressMetrics({
    checkIns: HISTORY,
    records: [{ exerciseName: "Prensa", weightKg: 120, reps: 12, date: "2026-03-10" }],
    today: "2026-08-24",
  });

  it("deja pasar el texto que solo cita números del historial", () => {
    const lines = [
      "La cintura va 7.5 cm abajo desde que empezaste: esa es la cifra que manda.",
      "La prensa ya va en 120 kg por 12 reps, y eso dice que el músculo se queda.",
    ];
    expect(citesOnlyEngineNumbers(lines, metrics)).toBe(true);
  });

  it("tumba el texto que se inventa una cifra", () => {
    const lines = [
      "La cintura va 7.5 cm abajo.",
      "A este ritmo llegas a 82 cm en noviembre.",
    ];
    expect(citesOnlyEngineNumbers(lines, metrics)).toBe(false);
  });

  it("las cifras citables salen todas del historial", () => {
    const allowed = citableNumbers(metrics);
    expect(allowed).toContain(7.5);
    expect(allowed).toContain(120);
    expect(allowed).not.toContain(82);
  });

  it("la plantilla de respaldo siempre pasa su propio candado", () => {
    expect(citesOnlyEngineNumbers(templateSummary(metrics), metrics)).toBe(true);
  });

  it("la plantilla entrega entre 2 y 4 frases", () => {
    const lines = templateSummary(metrics);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(4);
  });
});
