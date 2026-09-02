import { describe, expect, it } from "vitest";

import { aplicaCambios, conCambio, parseCambiosDeBloque } from "@/lib/training/bloques";

describe("cambios de bloque", () => {
  it("lee solo fechas y disciplinas de verdad", () => {
    expect(
      parseCambiosDeBloque({
        "2026-09-01": "PESAS",
        "ayer": "PESAS",
        "2026-09-02": "PILATES_DE_LA_LUNA",
        "2026-09-03": 7,
      }),
    ).toEqual({ "2026-09-01": "PESAS" });
  });

  it("un json raro no rompe nada", () => {
    expect(parseCambiosDeBloque(null)).toEqual({});
    expect(parseCambiosDeBloque(["2026-09-01"])).toEqual({});
  });

  it("guarda el cambio y tira los de hace más de tres semanas", () => {
    const previos = { "2026-08-01": "PESAS" as const, "2026-08-28": "NATACION" as const };
    const salida = conCambio(previos, "2026-09-01", "PESAS", "2026-09-01");

    expect(salida["2026-09-01"]).toBe("PESAS");
    expect(salida["2026-08-28"]).toBe("NATACION");
    // El de hace un mes ya no describe nada.
    expect(salida["2026-08-01"]).toBeUndefined();
  });

  it("el bloque cambiado a pesas sale de la lista de otras disciplinas", () => {
    const sesiones = [
      { date: "2026-09-01", discipline: "SQUASH" },
      { date: "2026-09-02", discipline: "NATACION" },
    ];

    expect(aplicaCambios(sesiones, { "2026-09-01": "PESAS" })).toEqual([
      { date: "2026-09-02", discipline: "NATACION" },
    ]);
  });

  it("cambiar a otra disciplina conserva el bloque, con la nueva", () => {
    const sesiones = [{ date: "2026-09-01", discipline: "SQUASH", minutos: 60 }];

    expect(aplicaCambios(sesiones, { "2026-09-01": "NATACION" })).toEqual([
      { date: "2026-09-01", discipline: "NATACION", minutos: 60 },
    ]);
  });
});
