import { describe, expect, it } from "vitest";

import { REFERENCIAS_CONOCIDAS, faltaPara, metasDesdeReferencia } from "@/lib/referencia";

/**
 * Traducir el cuerpo de otra persona en metas propias.
 *
 * Lo que se cuida: que las proporciones escalen, que las extremidades se
 * anclen al tronco y no a la estatura, y que el porcentaje de grasa no cruce
 * de un sexo a otro.
 */

const yun = REFERENCIAS_CONOCIDAS[0]!;

describe("metas desde una referencia", () => {
  it("escala la cintura por estatura, no la copia", () => {
    const { metas } = metasDesdeReferencia({ estaturaCm: 160, sexo: "FEMALE", referencia: yun });
    const cintura = metas.find((meta) => meta.label === "Cintura")!;

    // 77/178 = 0.433 → sobre 160 cm da ~69.2, no 77.
    expect(cintura.metaCm).toBeCloseTo(69.2, 1);
    expect(cintura.metaCm).not.toBe(yun.cinturaCm);
  });

  it("ancla brazo y pierna a la cintura objetivo, no a la estatura", () => {
    const { metas } = metasDesdeReferencia({ estaturaCm: 160, sexo: "FEMALE", referencia: yun });
    const cintura = metas.find((meta) => meta.label === "Cintura")!.metaCm;
    const pierna = metas.find((meta) => meta.label === "Piernas")!;

    expect(pierna.metaCm).toBeCloseTo((yun.musloCm! / yun.cinturaCm!) * cintura, 1);
  });

  it("nunca sugiere una cintura por encima de la mitad de tu estatura", () => {
    const referenciaAncha = { ...yun, cinturaCm: 100, estaturaCm: 178 };
    const { metas } = metasDesdeReferencia({
      estaturaCm: 160,
      sexo: "FEMALE",
      referencia: referenciaAncha,
    });
    const cintura = metas.find((meta) => meta.label === "Cintura")!;

    expect(cintura.metaCm).toBeLessThanOrEqual(80);
    expect(cintura.origen).toContain("mitad de tu estatura");
  });

  it("avisa cuando la referencia es de otro sexo", () => {
    const { avisos } = metasDesdeReferencia({ estaturaCm: 160, sexo: "FEMALE", referencia: yun });
    expect(avisos.some((aviso) => aviso.includes("otro sexo"))).toBe(true);
  });

  it("no copia un porcentaje de grasa por debajo del piso", () => {
    const { avisos } = metasDesdeReferencia({ estaturaCm: 160, sexo: "FEMALE", referencia: yun });
    // 8.3 % en una referencia masculina, leído para una mujer: se frena.
    expect(avisos.some((aviso) => aviso.includes("piso"))).toBe(true);
    expect(avisos.some((aviso) => aviso.includes("médico"))).toBe(true);
  });

  it("sin estatura no inventa nada", () => {
    const { metas, avisos } = metasDesdeReferencia({
      estaturaCm: null,
      sexo: "FEMALE",
      referencia: yun,
    });
    expect(metas).toEqual([]);
    expect(avisos[0]).toContain("estatura");
  });

  it("lo que falta se dice con dirección", () => {
    expect(faltaPara(80, 69.2)).toContain("por bajar");
    expect(faltaPara(60, 69.2)).toContain("por subir");
    expect(faltaPara(69, 69.2)).toBe("ya estás ahí");
    expect(faltaPara(null, 69.2)).toBe("sin medir todavía");
  });
});
