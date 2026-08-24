import { describe, expect, it } from "vitest";

import {
  buildPhotoColumns,
  resolveSlot,
  type PhotoCandidate,
} from "@/app/app/historial/photo-select";

/**
 * El comparador contra el historial real, donde casi nunca hay tres fotos el
 * mismo domingo. El reporte que originó estas pruebas: "las del 17/May aparecen
 * como 'Sin foto'" — ese check-in solo trae espalda, y frente y perfil existen
 * a dos semanas de distancia.
 */

function candidate(
  date: string,
  views: Array<"FRENTE" | "PERFIL" | "ESPALDA">,
): PhotoCandidate {
  const paths: PhotoCandidate["paths"] = {};
  for (const view of views) paths[view] = `${date}/${view.toLowerCase()}.jpg`;
  return { checkInId: date, date, paths };
}

describe("comparador de fotos", () => {
  it("rellena la vista que falta con la del check-in con foto más cercano", () => {
    const pool = [
      candidate("2026-05-02", ["FRENTE", "PERFIL", "ESPALDA"]),
      candidate("2026-05-17", ["ESPALDA"]),
    ];

    const slot = resolveSlot(pool[1] as PhotoCandidate, "FRENTE", pool);

    expect(slot).not.toBeNull();
    expect(slot?.borrowed).toBe(true);
    expect(slot?.date).toBe("2026-05-02");
    expect(slot?.storagePath).toBe("2026-05-02/frente.jpg");
  });

  it("no toma prestada una foto de hace más de tres semanas", () => {
    const pool = [
      candidate("2026-03-01", ["FRENTE"]),
      candidate("2026-05-17", ["ESPALDA"]),
    ];

    expect(resolveSlot(pool[1] as PhotoCandidate, "FRENTE", pool)).toBeNull();
  });

  it("la foto propia manda sobre la prestada", () => {
    const pool = [
      candidate("2026-05-02", ["FRENTE"]),
      candidate("2026-05-10", ["FRENTE"]),
    ];

    const slot = resolveSlot(pool[1] as PhotoCandidate, "FRENTE", pool);
    expect(slot?.borrowed).toBe(false);
    expect(slot?.date).toBe("2026-05-10");
  });

  it("prefiere como columna el check-in con las tres vistas", () => {
    const columns = buildPhotoColumns([
      candidate("2026-01-20", ["FRENTE", "PERFIL", "ESPALDA"]),
      candidate("2026-05-02", ["FRENTE", "PERFIL", "ESPALDA"]),
      candidate("2026-05-17", ["ESPALDA"]),
    ]);

    // 17/May es más reciente, pero 02/May compara mejor y cae en la ventana.
    expect(columns[0]?.label).toBe("Más reciente");
    expect(columns[0]?.date).toBe("2026-05-02");
    expect(Object.keys(columns[0]?.slots ?? {})).toHaveLength(3);
  });

  it("arma hasta tres columnas sin repetir check-in", () => {
    const columns = buildPhotoColumns([
      candidate("2026-01-20", ["FRENTE"]),
      candidate("2026-03-01", ["FRENTE", "PERFIL"]),
      candidate("2026-05-31", ["FRENTE", "PERFIL", "ESPALDA"]),
    ]);

    expect(columns.map((column) => column.label)).toEqual(["Más reciente", "Anterior", "Día 1"]);
    expect(new Set(columns.map((column) => column.checkInId)).size).toBe(3);
  });

  it("con un solo check-in con foto entrega una sola columna", () => {
    const columns = buildPhotoColumns([candidate("2026-05-31", ["PERFIL"])]);

    expect(columns).toHaveLength(1);
    expect(columns[0]?.label).toBe("Más reciente");
    expect(columns[0]?.slots.PERFIL?.borrowed).toBe(false);
    expect(columns[0]?.slots.FRENTE).toBeUndefined();
  });

  it("sin fotos no hay columnas", () => {
    expect(buildPhotoColumns([])).toEqual([]);
  });

  it("completa las tres vistas juntando check-ins cercanos", () => {
    const columns = buildPhotoColumns([
      candidate("2026-05-03", ["FRENTE", "PERFIL"]),
      candidate("2026-05-17", ["ESPALDA"]),
    ]);

    const latest = columns[0];
    expect(latest?.date).toBe("2026-05-03");
    expect(Object.keys(latest?.slots ?? {}).sort()).toEqual(["ESPALDA", "FRENTE", "PERFIL"]);
    expect(latest?.slots.ESPALDA?.borrowed).toBe(true);
    expect(latest?.slots.ESPALDA?.date).toBe("2026-05-17");
    expect(latest?.slots.FRENTE?.borrowed).toBe(false);
  });
});
