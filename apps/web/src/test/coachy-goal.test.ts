import type Anthropic from "@anthropic-ai/sdk";
import type { Profile } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACTION_TEXT,
  analyzeGoal,
  GOAL_ACTIONS,
  GOAL_FRAMING,
  GOAL_GAPS,
  GOAL_TRENDS,
  GOAL_VIEWS,
  GOAL_ZONES,
  goalFingerprint,
  goalLines,
  goalPhotoPath,
  goalViewFromObjectName,
  isBiweeklyDue,
  parseGoalReading,
  parseGoalReadings,
  readingToLine,
  type GoalReference,
  type GoalZoneReading,
} from "@/lib/coachy/goal";
import { validatePhotoFile } from "@/lib/validation/checkin";

/**
 * "Rumbo a tu objetivo": el vocabulario cerrado y sus candados.
 *
 * Lo que se prueba no es la visión sino la frontera — el modelo solo puede
 * elegir llaves de listas cerradas, y el texto que lee la atleta lo escribimos
 * nosotros. Si el modelo devuelve cualquier otra cosa, se tira.
 */

function reading(overrides: Partial<GoalZoneReading> = {}): GoalZoneReading {
  return {
    zona: "cintura",
    brecha: "media",
    tendencia: "acercándose",
    accion: "mantener_deficit",
    ...overrides,
  };
}

describe("rutas de las referencias", () => {
  it("cuelgan de la carpeta del usuario, que es donde aplica la RLS de Storage", () => {
    const path = goalPhotoPath("11111111-2222-3333-4444-555555555555", "FRENTE");
    expect(path).toBe("11111111-2222-3333-4444-555555555555/goal/frente.jpg");
    expect(path.split("/")[0]).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("nunca chocan con las del check-in, que llevan un uuid en medio", () => {
    for (const view of GOAL_VIEWS) {
      expect(goalPhotoPath("u", view)).toContain("/goal/");
    }
  });

  it("reconoce la vista desde el nombre del objeto y rechaza lo demás", () => {
    expect(goalViewFromObjectName("frente.jpg")).toBe("FRENTE");
    expect(goalViewFromObjectName("u/goal/espalda.png")).toBe("ESPALDA");
    expect(goalViewFromObjectName(".emptyFolderPlaceholder")).toBeNull();
    expect(goalViewFromObjectName("selfie.jpg")).toBeNull();
  });
});

describe("validación de la subida", () => {
  it("acepta un jpeg normal", () => {
    expect(validatePhotoFile({ size: 500_000, type: "image/jpeg" })).toEqual({ ok: true });
  });

  it("rechaza el archivo vacío, el pesado y el formato raro", () => {
    expect(validatePhotoFile({ size: 0, type: "image/jpeg" }).ok).toBe(false);
    expect(validatePhotoFile({ size: 9_000_000, type: "image/jpeg" }).ok).toBe(false);
    expect(validatePhotoFile({ size: 1000, type: "application/pdf" }).ok).toBe(false);
  });
});

describe("el vocabulario cerrado", () => {
  it("cada acción del enum tiene texto escrito por nosotros", () => {
    for (const action of GOAL_ACTIONS) {
      expect(ACTION_TEXT[action], action).toBeTruthy();
    }
    expect(Object.keys(ACTION_TEXT).sort()).toEqual([...GOAL_ACTIONS].sort());
  });

  it("ningún texto trae cifras: el motor es el único que da números", () => {
    const todo = [...Object.values(ACTION_TEXT), ...GOAL_FRAMING];
    for (const text of todo) {
      expect(text, text).not.toMatch(/\d/);
    }
  });

  it("el marco de expectativas dice las tres cosas obligatorias", () => {
    const marco = GOAL_FRAMING.join(" ").toLowerCase();
    expect(marco).toContain("dirección, no promesa");
    expect(marco).toContain("proporciones");
    expect(marco).toContain("identidades");
    expect(marco).toContain("estructura ósea");
    expect(marco).toContain("distribución de grasa");
  });
});

describe("mapeo enum → texto", () => {
  it("arma una frase con zona, brecha, tendencia y acción", () => {
    const line = readingToLine(
      reading({ zona: "cadera_gluteo", brecha: "lejos", accion: "mas_volumen_gluteo" }),
    );
    expect(line).toBe(
      "Cadera y glúteo: todavía está lejos de la referencia y se está acercando. " +
        "Suma una serie de glúteo en cada día de pierna.",
    );
  });

  it("pone primero la zona que se alejó: la mala noticia no se esconde", () => {
    const lines = goalLines([
      reading({ zona: "cintura", tendencia: "acercándose" }),
      reading({ zona: "brazo", tendencia: "igual" }),
      reading({ zona: "espalda", tendencia: "alejándose" }),
    ]);
    expect(lines[0]).toMatch(/^Espalda/);
    expect(lines[2]).toMatch(/^Cintura/);
  });

  it("cubre toda combinación de zona × brecha × tendencia sin huecos", () => {
    for (const zona of GOAL_ZONES) {
      for (const brecha of GOAL_GAPS) {
        for (const tendencia of GOAL_TRENDS) {
          const line = readingToLine(reading({ zona, brecha, tendencia }));
          expect(line, `${zona}/${brecha}/${tendencia}`).not.toContain("undefined");
        }
      }
    }
  });
});

describe("parseo de la herramienta", () => {
  it("acepta la fila bien formada", () => {
    expect(
      parseGoalReading({
        zona: "espalda",
        brecha: "cerca",
        tendencia: "acercándose",
        accion_sugerida: "priorizar_espalda",
      }),
    ).toEqual({
      zona: "espalda",
      brecha: "cerca",
      tendencia: "acercándose",
      accion: "priorizar_espalda",
    });
  });

  it("tolera que el modelo escriba la tendencia sin acentos", () => {
    const parsed = parseGoalReading({
      zona: "pierna",
      brecha: "media",
      tendencia: "ALEJANDOSE",
      accion_sugerida: "mas_volumen_pierna",
    });
    expect(parsed?.tendencia).toBe("alejándose");
  });

  it("tira la fila con una zona, una acción o una brecha fuera del enum", () => {
    expect(parseGoalReading({ zona: "gluteos", brecha: "cerca", tendencia: "igual", accion_sugerida: "seguir_igual" })).toBeNull();
    expect(parseGoalReading({ zona: "brazo", brecha: "casi", tendencia: "igual", accion_sugerida: "seguir_igual" })).toBeNull();
    expect(parseGoalReading({ zona: "brazo", brecha: "cerca", tendencia: "igual", accion_sugerida: "bajar 2 kg" })).toBeNull();
  });

  it("tira cualquier texto libre que el modelo cuele de más", () => {
    const parsed = parseGoalReading({
      zona: "cintura",
      brecha: "cerca",
      tendencia: "igual",
      accion_sugerida: "seguir_igual",
      nota: "se ve mucho mejor que antes",
    });
    // El campo extra no sobrevive: la lectura solo tiene las cuatro llaves.
    expect(Object.keys(parsed ?? {}).sort()).toEqual(["accion", "brecha", "tendencia", "zona"]);
  });

  it("deja una sola lectura por zona, en el orden del enum", () => {
    const readings = parseGoalReadings([
      { zona: "espalda", brecha: "lejos", tendencia: "igual", accion_sugerida: "priorizar_espalda" },
      { zona: "cintura", brecha: "cerca", tendencia: "igual", accion_sugerida: "seguir_igual" },
      { zona: "espalda", brecha: "cerca", tendencia: "igual", accion_sugerida: "seguir_igual" },
      "basura",
    ]);
    expect(readings.map((r) => r.zona)).toEqual(["cintura", "espalda"]);
    expect(readings.find((r) => r.zona === "espalda")?.brecha).toBe("lejos");
  });

  it("devuelve vacío si no vino un arreglo", () => {
    expect(parseGoalReadings(null)).toEqual([]);
    expect(parseGoalReadings({ zonas: [] })).toEqual([]);
  });
});

describe("cadencia quincenal", () => {
  it("sin análisis previo, toca", () => {
    expect(isBiweeklyDue(null, "2026-08-24T00:00:00.000Z")).toBe(true);
  });

  it("a los 13 días todavía no, a los 14 sí", () => {
    const last = "2026-08-01T00:00:00.000Z";
    expect(isBiweeklyDue(last, "2026-08-14T00:00:00.000Z")).toBe(false);
    expect(isBiweeklyDue(last, "2026-08-15T00:00:00.000Z")).toBe(true);
  });

  it("una fecha ilegible se trata como si no hubiera", () => {
    expect(isBiweeklyDue("ayer", "2026-08-24T00:00:00.000Z")).toBe(true);
  });
});

describe("los candados antes de mandar una foto", () => {
  const consented = { photoConsentAt: new Date("2026-01-01") } as Profile;
  const reference: GoalReference = {
    view: "FRENTE",
    storagePath: "u/goal/frente.jpg",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const current = [{ storagePath: "u/c1/frente.jpg", view: "FRENTE" }];

  /** Si algo llega hasta aquí, es que un candado no cerró. */
  const explodingClient = {
    messages: {
      create: () => {
        throw new Error("no debió llamarse a la API");
      },
    },
  } as unknown as Anthropic;

  const previousVision = process.env.VISION_ENABLED;
  afterEach(() => {
    process.env.VISION_ENABLED = previousVision;
  });

  it("no corre con la visión apagada", async () => {
    process.env.VISION_ENABLED = "false";
    const result = await analyzeGoal(
      { profile: consented, current, earlier: [], references: [reference] },
      { client: explodingClient },
    );
    expect(result).toBeNull();
  });

  it("no corre sin consentimiento, aunque la visión esté prendida", async () => {
    process.env.VISION_ENABLED = "true";
    const result = await analyzeGoal(
      {
        profile: { photoConsentAt: null } as Profile,
        current,
        earlier: [],
        references: [reference],
      },
      { client: explodingClient },
    );
    expect(result).toBeNull();
  });

  it("sin referencia no hay nada que comparar: ni se llama a la API", async () => {
    process.env.VISION_ENABLED = "true";
    const result = await analyzeGoal(
      { profile: consented, current, earlier: [], references: [] },
      { client: explodingClient },
    );
    expect(result).toBeNull();
  });

  it("con referencia pero sin fotos de la atleta, tampoco", async () => {
    process.env.VISION_ENABLED = "true";
    const result = await analyzeGoal(
      { profile: consented, current: [], earlier: [], references: [reference] },
      { client: explodingClient },
    );
    expect(result).toBeNull();
  });
});

describe("huella del caché", () => {
  const reference: GoalReference = {
    view: "FRENTE",
    storagePath: "u/goal/frente.jpg",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const current = [{ storagePath: "u/c1/frente.jpg" }, { storagePath: "u/c1/perfil.jpg" }];

  it("no cambia si las entradas son las mismas en otro orden", () => {
    expect(goalFingerprint([reference], [...current].reverse())).toBe(
      goalFingerprint([reference], current),
    );
  });

  it("cambia al reemplazar la referencia", () => {
    const replaced = { ...reference, updatedAt: "2026-08-20T00:00:00.000Z" };
    expect(goalFingerprint([replaced], current)).not.toBe(goalFingerprint([reference], current));
  });

  it("cambia cuando llegan fotos nuevas del check-in", () => {
    const nextWeek = [{ storagePath: "u/c2/frente.jpg" }];
    expect(goalFingerprint([reference], nextWeek)).not.toBe(
      goalFingerprint([reference], current),
    );
  });
});
