import { describe, expect, it } from "vitest";

import {
  PANELES,
  layoutPorDefecto,
  mover,
  panelesDisponibles,
  sanearLayout,
  siguienteVariante,
  definicionDe,
  alternarAncho,
} from "@/lib/paneles";

/**
 * El tablero configurable del Resumen.
 *
 * Lo que se cuida aquí es que el acomodo de alguien nunca se rompa: una app
 * vieja que guardó un panel que ya no existe, un ancho que ese panel no
 * soporta, o un tablero que quedó vacío.
 */

describe("catálogo de paneles", () => {
  it("cada panel declara al menos una variante y un ancho", () => {
    for (const panel of PANELES) {
      expect(panel.variantes.length, panel.id).toBeGreaterThan(0);
      expect(panel.anchos.length, panel.id).toBeGreaterThan(0);
    }
  });

  it("el acomodo de fábrica no repite paneles y respeta lo que cada uno soporta", () => {
    const layout = layoutPorDefecto();
    expect(new Set(layout.map((panel) => panel.id)).size).toBe(layout.length);

    for (const panel of layout) {
      const def = definicionDe(panel.id)!;
      expect(def.variantes, panel.id).toContain(panel.variante);
      expect(def.anchos, panel.id).toContain(panel.ancho);
    }
  });
});

describe("acomodo guardado", () => {
  it("descarta ids que ya no existen en vez de romperse", () => {
    const limpio = sanearLayout([
      { id: "cintura", variante: "normal", ancho: "medio" },
      { id: "panel_de_una_version_vieja", variante: "normal", ancho: "medio" },
    ]);
    expect(limpio.map((panel) => panel.id)).toEqual(["cintura"]);
  });

  it("corrige una variante o un ancho que ese panel no soporta", () => {
    const limpio = sanearLayout([{ id: "checkin", variante: "detallado", ancho: "ancho" }]);
    const def = definicionDe("checkin")!;

    expect(def.variantes).toContain(limpio[0]!.variante);
    expect(def.anchos).toContain(limpio[0]!.ancho);
  });

  it("quita repetidos: un panel dos veces se pintaría dos veces", () => {
    const limpio = sanearLayout([
      { id: "racha", variante: "normal", ancho: "medio" },
      { id: "racha", variante: "compacto", ancho: "medio" },
    ]);
    expect(limpio).toHaveLength(1);
  });

  it("un acomodo vacío o corrupto vuelve al de fábrica", () => {
    expect(sanearLayout([]).length).toBe(layoutPorDefecto().length);
    expect(sanearLayout(null).length).toBe(layoutPorDefecto().length);
    expect(sanearLayout("cualquier cosa").length).toBe(layoutPorDefecto().length);
  });
});

describe("edición", () => {
  it("mover respeta los extremos", () => {
    const layout = layoutPorDefecto();
    const primero = layout[0]!.id;

    expect(mover(layout, primero, -1)).toEqual(layout);
    expect(mover(layout, primero, 1)[1]!.id).toBe(primero);
  });

  it("las variantes rotan en ciclo", () => {
    const def = definicionDe("cintura")!;
    let variante = def.variantes[0]!;
    for (let i = 0; i < def.variantes.length; i += 1) variante = siguienteVariante(def, variante);
    expect(variante).toBe(def.variantes[0]);
  });

  it("un panel de un solo ancho no cambia de ancho", () => {
    const def = definicionDe("checkin")!;
    expect(alternarAncho(def, def.anchos[0]!)).toBe(def.anchos[0]);
  });

  it("lo que ya está en el tablero no aparece como disponible", () => {
    const layout = layoutPorDefecto();
    const disponibles = panelesDisponibles(layout).map((panel) => panel.id);
    for (const panel of layout) expect(disponibles).not.toContain(panel.id);
  });
});
