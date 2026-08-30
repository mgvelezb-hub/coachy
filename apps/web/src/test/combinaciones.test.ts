import { describe, expect, it } from "vitest";

import {
  compatibilidad,
  ordenar,
  porqueDeCombo,
  repartirMinutos,
  type BloqueDia,
} from "@/lib/training/combinaciones";

/**
 * Cómo conviven dos bloques el mismo día (Fase 9).
 *
 * No se prueban los números finos de `compatibilidad` —el puntaje exacto no
 * es una promesa del modelo—, sino las cuatro preguntas que el módulo
 * responde: ¿nunca combinan?, ¿en qué orden?, ¿cuántos minutos le tocan a
 * cada uno?, y ¿el porqué se dice de verdad?
 */

const PIERNA: BloqueDia = { discipline: "PESAS", dayKind: "PIERNA_CUADRICEPS" };
const TORSO_GYM: BloqueDia = { discipline: "PESAS", dayKind: "PECHO_ESPALDA" };
const SQUASH: BloqueDia = { discipline: "SQUASH" };
const BOX: BloqueDia = { discipline: "BOX" };
const CROSSFIT: BloqueDia = { discipline: "CROSSFIT" };
const NATACION: BloqueDia = { discipline: "NATACION" };
const CARDIO: BloqueDia = { discipline: "CARDIO" };

describe("compatibilidad: las incompatibilidades duras", () => {
  it("pierna de gimnasio + alto impacto nunca combina, en ningún orden", () => {
    for (const alto of [SQUASH, BOX, CROSSFIT, { discipline: "FUNCIONAL" as const }, CARDIO]) {
      expect(compatibilidad(PIERNA, alto), alto.discipline).toBeNull();
      expect(compatibilidad(alto, PIERNA), alto.discipline).toBeNull();
    }
  });

  it("un día de gimnasio que NO es de pierna sí puede combinar con alto impacto", () => {
    // La regla dura es específica de pierna fatigada, no de "cualquier día de
    // gimnasio": squash con un día de torso no comparte el riesgo de
    // tobillo/rodilla que sí hay con sentadilla o peso muerto reciente.
    expect(compatibilidad(TORSO_GYM, SQUASH)).not.toBeNull();
  });

  it("squash + box nunca combina", () => {
    expect(compatibilidad(SQUASH, BOX)).toBeNull();
    expect(compatibilidad(BOX, SQUASH)).toBeNull();
  });

  it("CrossFit + cualquier día de gimnasio nunca combina", () => {
    expect(compatibilidad(CROSSFIT, PIERNA)).toBeNull();
    expect(compatibilidad(CROSSFIT, TORSO_GYM)).toBeNull();
    expect(compatibilidad(PIERNA, CROSSFIT)).toBeNull();
  });

  it("una disciplina consigo misma nunca combina", () => {
    expect(compatibilidad(PIERNA, { discipline: "PESAS", dayKind: "BRAZO" })).toBeNull();
    expect(compatibilidad(SQUASH, SQUASH)).toBeNull();
    expect(compatibilidad(NATACION, NATACION)).toBeNull();
  });

  it("fuera de las reglas duras, sí hay un puntaje", () => {
    expect(compatibilidad(TORSO_GYM, NATACION)).not.toBeNull();
    expect(compatibilidad(SQUASH, NATACION)).not.toBeNull();
    expect(compatibilidad(TORSO_GYM, CARDIO)).not.toBeNull();
  });
});

describe("compatibilidad: el puntaje", () => {
  it("la natación puntúa mejor que otra combinación equivalente sin natación", () => {
    // Mismo bloque de gimnasio, un lado con natación (bajo impacto, "refresca")
    // y el otro con cardio (grupo compartido: pierna).
    const conNatacion = compatibilidad(TORSO_GYM, NATACION)!;
    const conCardio = compatibilidad(PIERNA, CARDIO); // esto de hecho es null (pierna+cardio alto impacto)
    expect(conCardio).toBeNull();
    // Comparación más justa: torso + cardio (sin bono de natación) vs torso + natación.
    const torsoConCardio = compatibilidad(TORSO_GYM, CARDIO)!;
    expect(conNatacion).toBeGreaterThan(torsoConCardio);
  });

  it("más grupos musculares en común, peor puntaje", () => {
    // PECHO_ESPALDA carga PECHO/ESPALDA; CrossFit fatiga ESPALDA (nivel 2) —
    // pero CrossFit+gimnasio es una regla dura (null), así que se compara con
    // box, que también carga ESPALDA a nivel 1 (no cuenta) y HOMBRO/ABDOMEN a
    // nivel 2 (no se traslapan con pecho+espalda). Se usa squash (PIERNA+ABDOMEN)
    // contra un día de pierna sin la regla dura activa no es posible, así que
    // se compara contra un bloque de pesas sintético sin dayKind (sin carga
    // fuerte) para aislar el efecto del traslape.
    const sinCargaFuerte: BloqueDia = { discipline: "PESAS" };
    const conCargaFuerte: BloqueDia = { discipline: "PESAS", dayKind: "HOMBRO" }; // carga HOMBRO y ABDOMEN

    const sinTraslape = compatibilidad(sinCargaFuerte, BOX)!; // box carga HOMBRO(2) y ABDOMEN(2)
    const conTraslape = compatibilidad(conCargaFuerte, BOX)!;

    expect(conTraslape).toBeLessThan(sinTraslape);
  });
});

describe("ordenar", () => {
  it("natación siempre va al final", () => {
    expect(ordenar(NATACION, SQUASH)).toEqual([SQUASH, NATACION]);
    expect(ordenar(SQUASH, NATACION)).toEqual([SQUASH, NATACION]);
    expect(ordenar(NATACION, TORSO_GYM)).toEqual([TORSO_GYM, NATACION]);
  });

  it("squash y box van antes que pesas", () => {
    expect(ordenar(TORSO_GYM, SQUASH)).toEqual([SQUASH, TORSO_GYM]);
    expect(ordenar(BOX, TORSO_GYM)).toEqual([BOX, TORSO_GYM]);
  });

  it("pesas antes que cardio", () => {
    expect(ordenar(CARDIO, TORSO_GYM)).toEqual([TORSO_GYM, CARDIO]);
    expect(ordenar(TORSO_GYM, CARDIO)).toEqual([TORSO_GYM, CARDIO]);
  });
});

describe("repartirMinutos", () => {
  it("resta la transición y reparte 60/40 a favor del primero, en múltiplos de 5", () => {
    // 90 min totales - 10 transición = 80. 60% de 80 = 48 -> redondeado a 50.
    const reparto = repartirMinutos(90, [TORSO_GYM, NATACION]);
    expect(reparto).not.toBeNull();
    expect(reparto!.minutos[0] % 5).toBe(0);
    expect(reparto!.minutos[1] % 5).toBe(0);
    expect(reparto!.minutos[0] + reparto!.minutos[1]).toBe(80);
    expect(reparto!.minutos[0]).toBeGreaterThan(reparto!.minutos[1]);
  });

  it("respeta el mínimo de 30 para pesas y 25 para cualquier otro", () => {
    // 70 - 10 = 60 disponibles; mínimos 30 + 25 = 55 <= 60: cabe justo.
    const reparto = repartirMinutos(70, [TORSO_GYM, SQUASH]);
    expect(reparto).not.toBeNull();
    expect(reparto!.minutos[0]).toBeGreaterThanOrEqual(30);
    expect(reparto!.minutos[1]).toBeGreaterThanOrEqual(25);
  });

  it("si no caben ambos mínimos aunque compatibilicen, devuelve null", () => {
    // 50 - 10 = 40 disponibles; pesas(30) + squash(25) = 55 > 40: no cabe.
    expect(repartirMinutos(50, [TORSO_GYM, SQUASH])).toBeNull();
  });

  it("un combo imposible por tiempo es null incluso con buena compatibilidad", () => {
    // Natación + torso es compatible (puntaje alto), pero si el día es corto
    // de verdad no hay reparto que alcance.
    expect(compatibilidad(TORSO_GYM, NATACION)).not.toBeNull();
    expect(repartirMinutos(45, [TORSO_GYM, NATACION])).toBeNull();
  });
});

describe("porqueDeCombo", () => {
  it("nunca viene vacío", () => {
    const casos: Array<[BloqueDia, BloqueDia]> = [
      [TORSO_GYM, NATACION],
      [SQUASH, TORSO_GYM],
      [TORSO_GYM, CARDIO],
      [BOX, TORSO_GYM],
    ];
    for (const [primero, segundo] of casos) {
      const texto = porqueDeCombo(primero, segundo);
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  it("cuando natación cierra, explica que es para soltar", () => {
    expect(porqueDeCombo(TORSO_GYM, NATACION)).toContain("soltar");
  });

  it("cuando squash o box abren, explica que es por piernas frescas", () => {
    expect(porqueDeCombo(SQUASH, TORSO_GYM)).toContain("frescas");
    expect(porqueDeCombo(BOX, TORSO_GYM)).toContain("frescas");
  });
});
