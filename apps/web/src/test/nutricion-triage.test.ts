import { describe, expect, it } from "vitest";

import { triageQuestion } from "@/lib/nutricion/triage";
import { checkInbodyCoherence, labResultSchema, outsideLabRange } from "@/lib/labs/schema";

/**
 * El freno de la nutrióloga virtual y la lectura de estudios (Fase 8).
 *
 * Las dos comparten el mismo principio: la app se detiene donde empieza lo
 * clínico, y se detiene con código, no con una instrucción en un prompt.
 */

describe("triage de preguntas", () => {
  it("deja pasar una duda normal del plan", () => {
    const result = triageQuestion("¿Puedo cambiar el pollo de la comida por atún?");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("OK");
  });

  it("frena una urgencia y manda a emergencias", () => {
    const result = triageQuestion("Me dio dolor en el pecho después de entrenar, ¿qué como?");
    expect(result.category).toBe("URGENCIA");
    expect(result.message).toContain("911");
  });

  it("frena el contexto clínico", () => {
    expect(triageQuestion("Estoy embarazada, ¿sigo con el déficit?").category).toBe("CLINICO");
    expect(triageQuestion("Tomo metformina, ¿me sirve la keto?").category).toBe("CLINICO");
  });

  it("frena las señales de conducta alimentaria, aunque suenen técnicas", () => {
    const result = triageQuestion("¿Está bien comer 500 calorias al dia para bajar más rápido?");
    expect(result.category).toBe("TCA");
    expect(result.message).toContain("800 911 2000");
  });

  it("la urgencia gana sobre lo demás", () => {
    const result = triageQuestion("Tengo diabetes y hoy me desmaye en el gym");
    expect(result.category).toBe("URGENCIA");
  });

  it("no prescribe fármacos ni sustancias", () => {
    expect(triageQuestion("¿Me recomiendas ozempic?").category).toBe("FUERA_DE_ALCANCE");
    expect(triageQuestion("¿Qué ciclo de esteroides me pongo?").category).toBe("FUERA_DE_ALCANCE");
  });

  it("los acentos y las mayúsculas no rodean el filtro", () => {
    expect(triageQuestion("ESTOY EMBARAZADA").category).toBe("CLINICO");
    expect(triageQuestion("me desmayé ayer").category).toBe("URGENCIA");
  });

  it("lo que disparó el freno no viaja en el mensaje", () => {
    const result = triageQuestion("Estoy embarazada, ¿qué como?");
    expect(result.matched.length).toBeGreaterThan(0);
    expect(result.message).not.toContain("embarazada");
  });
});

describe("lectura de estudios", () => {
  it("detecta un InBody que se contradice a sí mismo", () => {
    // El caso real de mayo: 33.5 % de grasa con una masa libre que implica 39 %.
    const check = checkInbodyCoherence([
      { key: "peso_kg", label: "Peso", value: 120, unit: "kg", refLow: null, refHigh: null },
      { key: "grasa_pct", label: "Grasa", value: 33.5, unit: "%", refLow: null, refHigh: null },
      {
        key: "masa_libre_grasa_kg",
        label: "Masa libre de grasa",
        value: 73,
        unit: "kg",
        refLow: null,
        refHigh: null,
      },
    ]);

    expect(check.coherent).toBe(false);
    expect(check.reason).toContain("no cuadra");
  });

  it("acepta un reporte que sí cuadra", () => {
    const check = checkInbodyCoherence([
      { key: "peso_kg", label: "Peso", value: 100, unit: "kg", refLow: null, refHigh: null },
      { key: "grasa_pct", label: "Grasa", value: 30, unit: "%", refLow: null, refHigh: null },
      {
        key: "masa_libre_grasa_kg",
        label: "Masa libre de grasa",
        value: 70,
        unit: "kg",
        refLow: null,
        refHigh: null,
      },
    ]);
    expect(check.coherent).toBe(true);
  });

  it("solo compara contra el rango del propio laboratorio", () => {
    const values = [
      { key: "glucosa", label: "Glucosa", value: 100, unit: "mg/dL", refLow: 70, refHigh: 99 },
      { key: "urea", label: "Urea", value: 30, unit: "mg/dL", refLow: null, refHigh: null },
    ];

    // La urea no trae rango: no se opina sobre ella, aunque el número exista.
    expect(outsideLabRange(values).map((value) => value.key)).toEqual(["glucosa"]);
  });

  it("rechaza un estudio sin valores", () => {
    const parsed = labResultSchema.safeParse({ kind: "QUIMICA", takenOn: "2026-03-02", values: [] });
    expect(parsed.success).toBe(false);
  });

  it("rechaza un rango invertido del laboratorio", () => {
    const parsed = labResultSchema.safeParse({
      kind: "QUIMICA",
      takenOn: "2026-03-02",
      values: [
        { key: "glucosa", label: "Glucosa", value: 100, unit: "mg/dL", refLow: 120, refHigh: 80 },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
