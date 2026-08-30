import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DISCIPLINE_ICON, iconoDe } from "@/lib/disciplinas";
import { DISCIPLINES } from "@/lib/api";

/**
 * El ícono de cada disciplina, en un solo lugar.
 *
 * Esto empezó con cada pantalla eligiendo el suyo: olas en Rutinas, una
 * mancuerna en Biblioteca, una bici para todo lo que no fuera pesas en Hoy, y
 * squash compartiendo ícono con "Otro" en Registrar sesiones. Un ícono que
 * cambia de pantalla en pantalla deja de ser un ícono y se vuelve decoración.
 */

describe("catálogo de íconos", () => {
  it("cubre todas las disciplinas del enum", () => {
    for (const disciplina of DISCIPLINES) {
      expect(DISCIPLINE_ICON[disciplina], disciplina).toBeTruthy();
    }
  });

  it("ninguna disciplina planeable comparte ícono con otra", () => {
    // `OTRO` es la cubeta de lo que se registra sin planearse: puede repetir
    // el genérico. Las demás no — si dos se ven igual, el ícono no informa.
    const planeables = DISCIPLINES.filter((disciplina) => disciplina !== "OTRO");
    const iconos = planeables.map((disciplina) => DISCIPLINE_ICON[disciplina]);

    expect(new Set(iconos).size).toBe(planeables.length);
  });

  it("una disciplina desconocida cae en el genérico en vez de romperse", () => {
    expect(iconoDe("LO_QUE_SEA" as never)).toBeTruthy();
  });
});

describe("las pantallas usan el catálogo", () => {
  /**
   * Ninguna pantalla vuelve a armar su propio mapa de íconos por disciplina.
   *
   * Se revisa el código fuente y no el render porque el defecto es
   * estructural: en cuanto una pantalla declara su `Record<Discipline, ...>`
   * local, las demás se desalinean sin que ninguna prueba de comportamiento
   * lo note.
   */
  it("ninguna declara su propio Record<Discipline, ...> de íconos", () => {
    const raiz = join(__dirname, "..");
    const sospechosos: string[] = [];

    function recorrer(directorio: string) {
      for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
        const ruta = join(directorio, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name === "test") continue;
          recorrer(ruta);
          continue;
        }
        if (!entrada.name.endsWith(".tsx") && !entrada.name.endsWith(".ts")) continue;
        if (ruta.endsWith(join("lib", "disciplinas.tsx"))) continue;

        const fuente = readFileSync(ruta, "utf8");
        if (/Record<\s*Discipline\s*,\s*(LucideIcon|ComponentType)/.test(fuente)) {
          sospechosos.push(ruta.slice(raiz.length + 1));
        }
      }
    }

    recorrer(raiz);
    expect(sospechosos).toEqual([]);
  });
});
