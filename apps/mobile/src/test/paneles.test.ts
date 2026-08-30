import { describe, expect, it } from "vitest";

import {
  PANELES,
  TAMANOS,
  VISTAS,
  conTamano,
  definicionDe,
  etiquetaDeVista,
  layoutPorDefecto,
  mover,
  moverA,
  panelesDisponibles,
  sanearLayout,
  vistasPara,
} from "@/lib/paneles";

/**
 * El tablero configurable del Resumen.
 *
 * Lo que se cuida aquí es que el acomodo de alguien nunca se rompa: una app
 * vieja que guardó un panel que ya no existe, un tamaño que ese panel no
 * soporta, un tablero vacío, o —lo más delicado— un acomodo guardado con el
 * modelo anterior de ancho + variante.
 */

describe("catálogo de paneles", () => {
  it("cada panel declara al menos un tamaño, y todos son válidos", () => {
    for (const panel of PANELES) {
      expect(panel.tamanos.length, panel.id).toBeGreaterThan(0);
      for (const tamano of panel.tamanos) {
        expect(TAMANOS, panel.id).toContain(tamano);
      }
    }
  });

  it("el tamaño de fábrica de cada panel es uno que sabe pintar", () => {
    for (const panel of PANELES) {
      if (!panel.porDefecto) continue;
      expect(panel.tamanos, panel.id).toContain(panel.porDefecto.tamano);
    }
  });

  it("los paneles de gráfica no ofrecen mini: una telaraña de 150 pt es adorno", () => {
    expect(definicionDe("perfil")!.tamanos).not.toContain("mini");
    expect(definicionDe("anillos")!.tamanos).not.toContain("mini");
  });

  it("cada panel declara al menos una vista, y todas son válidas", () => {
    for (const panel of PANELES) {
      expect(panel.vistas.length, panel.id).toBeGreaterThan(0);
      for (const vista of panel.vistas) expect(VISTAS, panel.id).toContain(vista);
    }
  });

  it("la vista de fábrica cabe en el tamaño de fábrica", () => {
    for (const panel of PANELES) {
      if (!panel.porDefecto) continue;
      expect(vistasPara(panel, panel.porDefecto.tamano), panel.id).toContain(
        panel.porDefecto.vista,
      );
    }
  });

  it("el cuadro chico no ofrece desglose: cinco renglones ahí no se leen", () => {
    for (const panel of PANELES) {
      if (!panel.tamanos.includes("mini")) continue;
      expect(vistasPara(panel, "mini"), panel.id).not.toContain("desglose");
    }
  });

  it("cada vista tiene un nombre que dice algo en su panel", () => {
    const semana = definicionDe("semana")!;
    expect(etiquetaDeVista(semana, "desglose")).toBe("Día por día");

    const plan = definicionDe("plan")!;
    expect(etiquetaDeVista(plan, "desglose")).toBe("Con tus macros");
  });

  it("el acomodo de fábrica no repite paneles", () => {
    const layout = layoutPorDefecto();
    expect(new Set(layout.map((panel) => panel.id)).size).toBe(layout.length);
  });
});

describe("acomodo guardado", () => {
  it("descarta ids que ya no existen en vez de romperse", () => {
    const limpio = sanearLayout([
      { id: "cintura", tamano: "mini" },
      { id: "panel_de_una_version_vieja", tamano: "mini" },
    ]);
    expect(limpio.map((panel) => panel.id)).toEqual(["cintura"]);
  });

  it("corrige un tamaño que ese panel no soporta", () => {
    const limpio = sanearLayout([{ id: "perfil", tamano: "mini" }]);
    expect(definicionDe("perfil")!.tamanos).toContain(limpio[0]!.tamano);
    expect(limpio[0]!.tamano).not.toBe("mini");
  });

  it("quita repetidos: un panel dos veces se pintaría dos veces", () => {
    const limpio = sanearLayout([
      { id: "racha", tamano: "mini" },
      { id: "racha", tamano: "compacta" },
    ]);
    expect(limpio).toHaveLength(1);
  });

  it("un acomodo vacío o corrupto vuelve al de fábrica", () => {
    expect(sanearLayout([]).length).toBe(layoutPorDefecto().length);
    expect(sanearLayout(null).length).toBe(layoutPorDefecto().length);
    expect(sanearLayout("cualquier cosa").length).toBe(layoutPorDefecto().length);
  });

  it("traduce el modelo viejo de ancho + variante sin perder la intención", () => {
    const viejo = sanearLayout([
      { id: "cintura", ancho: "medio", variante: "normal" },
      { id: "semana", ancho: "ancho", variante: "detallado" },
      { id: "plan", ancho: "ancho", variante: "normal" },
    ]);

    // Media pantalla era el cuadro chico; ancho con detalle era todo.
    expect(viejo.find((panel) => panel.id === "cintura")!.tamano).toBe("mini");
    expect(viejo.find((panel) => panel.id === "semana")!.tamano).toBe("completa");
    expect(viejo.find((panel) => panel.id === "plan")!.tamano).toBe("compacta");

    // Y todos salen con una vista que su panel sabe pintar.
    for (const panel of viejo) {
      const def = definicionDe(panel.id)!;
      expect(vistasPara(def, panel.tamano), panel.id).toContain(panel.vista);
    }
  });
});

describe("edición", () => {
  it("mover respeta los extremos", () => {
    const layout = layoutPorDefecto();
    const primero = layout[0]!.id;

    expect(mover(layout, primero, -1)).toEqual(layout);
    expect(mover(layout, primero, 1)[1]!.id).toBe(primero);
  });

  it("arrastrar lleva un panel a la posición exacta", () => {
    const layout = layoutPorDefecto();
    const tercero = layout[2]!.id;

    expect(moverA(layout, tercero, 0)[0]!.id).toBe(tercero);
    expect(moverA(layout, tercero, layout.length - 1).at(-1)!.id).toBe(tercero);
    // Fuera de rango se topa en el extremo, no rompe el acomodo.
    expect(moverA(layout, tercero, 99).at(-1)!.id).toBe(tercero);
    expect(moverA(layout, tercero, -5)[0]!.id).toBe(tercero);
  });

  it("bajar de tamaño ajusta la vista cuando deja de caber", () => {
    const layout = [{ id: "semana", tamano: "completa" as const, vista: "desglose" as const }];
    const chico = conTamano(layout, "semana", "mini");

    expect(chico[0]!.tamano).toBe("mini");
    expect(chico[0]!.vista).not.toBe("desglose");
  });

  it("cambiar de tamaño conserva la vista si sigue cabiendo", () => {
    const layout = [{ id: "cintura", tamano: "mini" as const, vista: "tendencia" as const }];
    const grande = conTamano(layout, "cintura", "completa");
    expect(grande[0]!.vista).toBe("tendencia");
  });

  it("lo que ya está en el tablero no aparece como disponible", () => {
    const layout = layoutPorDefecto();
    const disponibles = panelesDisponibles(layout).map((panel) => panel.id);
    for (const panel of layout) expect(disponibles).not.toContain(panel.id);
  });
});
