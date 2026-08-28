import { describe, expect, it } from "vitest";

import { sundayOf, toISODate, weekdayIn } from "@/lib/format";
import { mondayOf, sundayEndOf } from "@/lib/training/generate";

/**
 * El bug que estas pruebas cuidan: Vercel corre en UTC. El jueves 27 de agosto
 * de 2026 a las 18:31 en CDMX ya es viernes 28 en UTC, así que el servidor
 * abría la sesión del día siguiente y la semana entera se recorría.
 *
 * Este instante es exactamente ese: 2026-08-28T00:31:00Z = jueves 27, 18:31 en
 * México. Si alguien vuelve a calcular fechas con `getDate()` sobre la hora
 * del servidor, estas pruebas truenan.
 */
const JUEVES_NOCHE_EN_MEXICO = new Date("2026-08-28T00:31:00.000Z");

describe("fechas en la zona de la atleta, no en la del servidor", () => {
  it("de noche en CDMX el día sigue siendo el de México, no el de UTC", () => {
    expect(JUEVES_NOCHE_EN_MEXICO.toISOString().slice(0, 10)).toBe("2026-08-28");
    expect(toISODate(JUEVES_NOCHE_EN_MEXICO)).toBe("2026-08-27");
  });

  it("el día de la semana es jueves (4), no viernes", () => {
    expect(weekdayIn(JUEVES_NOCHE_EN_MEXICO)).toBe(4);
  });

  it("el lunes de esa semana es el 24, no el 25", () => {
    expect(toISODate(mondayOf(JUEVES_NOCHE_EN_MEXICO))).toBe("2026-08-24");
  });

  it("la semana termina el domingo 30", () => {
    expect(toISODate(sundayEndOf(JUEVES_NOCHE_EN_MEXICO))).toBe("2026-08-30");
  });

  it("el domingo del check-in es el 23, no el 24", () => {
    expect(toISODate(sundayOf(JUEVES_NOCHE_EN_MEXICO))).toBe("2026-08-23");
  });

  it("a media tarde en México, cuando UTC coincide, nada cambia", () => {
    const jueves2PM = new Date("2026-08-27T20:00:00.000Z"); // 14:00 en CDMX
    expect(toISODate(jueves2PM)).toBe("2026-08-27");
    expect(weekdayIn(jueves2PM)).toBe(4);
    expect(toISODate(mondayOf(jueves2PM))).toBe("2026-08-24");
  });
});
