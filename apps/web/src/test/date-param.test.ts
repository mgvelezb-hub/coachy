import { describe, expect, it } from "vitest";

import { resolveWeekReference } from "@/lib/api/date-param";

describe("resolveWeekReference", () => {
  it("sin query param, usa ahora", () => {
    const result = resolveWeekReference(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.date).toBeInstanceOf(Date);
  });

  it("con una fecha ISO válida, la usa como referencia a mediodía UTC", () => {
    const result = resolveWeekReference("2026-08-20");
    expect(result.ok).toBe(true);
    // Mediodía UTC, igual que `fromISODate`: evita saltos de día sea cual sea
    // la zona horaria donde corran las pruebas.
    if (result.ok) expect(result.date.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("rechaza una fecha con formato mexicano", () => {
    expect(resolveWeekReference("20/08/2026").ok).toBe(false);
  });

  it("rechaza basura", () => {
    expect(resolveWeekReference("no-es-una-fecha").ok).toBe(false);
    expect(resolveWeekReference("").ok).toBe(false);
  });

  it("rechaza una fecha con hora pegada", () => {
    expect(resolveWeekReference("2026-08-20T12:00:00.000Z").ok).toBe(false);
  });
});
