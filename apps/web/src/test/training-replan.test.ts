import { describe, expect, it } from "vitest";

import { horarioDesde, replanificar, type TiempoPorDia } from "@/lib/training/replan";
import { WEEK_DAYS } from "@/lib/training/split";

/**
 * Rearmar la semana desde cero.
 *
 * La prueba que importa es la del tiempo: si el día tiene una hora, no caben
 * gimnasio, alberca y squash. Un plan que no cabe se abandona el jueves, y
 * hasta ahora nada impedía armarlo.
 */

function tiempo(minutos: Partial<TiempoPorDia>): TiempoPorDia {
  return Object.fromEntries(WEEK_DAYS.map((dia) => [dia, minutos[dia] ?? 0])) as TiempoPorDia;
}

describe("replanificar la semana", () => {
  it("la primaria se lleva los días con más tiempo", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 90, MAR: 45, MIE: 90, JUE: 45, VIE: 90 }),
      primaria: "PESAS",
      secundarias: [],
      sesionesPrimaria: 3,
    });

    const dias = replan.asignadas.filter((sesion) => sesion.esPrimaria).map((s) => s.weekday);
    expect(dias).toEqual(["LUN", "MIE", "VIE"]);
  });

  it("un día no lleva dos disciplinas", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MAR: 60, MIE: 60 }),
      primaria: "PESAS",
      secundarias: [
        { discipline: "NATACION", proposito: "ENTRENAMIENTO", importancia: 3 },
        { discipline: "SQUASH", proposito: "HOBBY", importancia: 2 },
      ],
      sesionesPrimaria: 2,
    });

    const porDia = new Map<string, number>();
    for (const sesion of replan.asignadas) {
      porDia.set(sesion.weekday, (porDia.get(sesion.weekday) ?? 0) + 1);
    }
    for (const cuantas of porDia.values()) expect(cuantas).toBe(1);
  });

  it("avisa cuando se pidieron más sesiones de las que caben", () => {
    const replan = replanificar({
      // Solo dos días llegan a los 45 minutos que pide entrenar en serio.
      tiempo: tiempo({ LUN: 60, MAR: 20, MIE: 60, JUE: 20 }),
      primaria: "PESAS",
      secundarias: [],
      sesionesPrimaria: 5,
    });

    expect(replan.asignadas).toHaveLength(2);
    expect(replan.avisos.some((aviso) => aviso.includes("5 sesiones"))).toBe(true);
  });

  it("lo que se entrena en serio pesa más que un pasatiempo", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MAR: 60, MIE: 60, JUE: 60, VIE: 60, SAB: 60 }),
      primaria: "PESAS",
      secundarias: [
        { discipline: "NATACION", proposito: "ENTRENAMIENTO", importancia: 3 },
        { discipline: "SQUASH", proposito: "HOBBY", importancia: 1 },
      ],
      sesionesPrimaria: 2,
    });

    const natacion = replan.cargas.find((carga) => carga.discipline === "NATACION")?.sessionsPerWeek ?? 0;
    const squash = replan.cargas.find((carga) => carga.discipline === "SQUASH")?.sessionsPerWeek ?? 0;

    expect(natacion).toBeGreaterThan(squash);
  });

  it("un día de 20 minutos no recibe nada, y se dice", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 20, MAR: 20, MIE: 20 }),
      primaria: "PESAS",
      secundarias: [{ discipline: "NATACION", proposito: "HOBBY", importancia: 1 }],
      sesionesPrimaria: 3,
    });

    expect(replan.asignadas).toEqual([]);
    expect(replan.avisos.some((aviso) => aviso.includes("juntar el tiempo"))).toBe(true);
  });

  it("el horario resultante marca descanso donde no hay sesión", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MIE: 60 }),
      primaria: "PESAS",
      secundarias: [],
      sesionesPrimaria: 2,
    });

    const horario = horarioDesde(replan, "TARDE");
    expect(horario.LUN).toBe("TARDE");
    expect(horario.MAR).toBe("DESCANSO");
    expect(horario.MIE).toBe("TARDE");
  });

  it("las cargas salen listas para guardarse en el perfil", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MAR: 60, MIE: 60, JUE: 60 }),
      primaria: "PESAS",
      secundarias: [{ discipline: "NATACION", proposito: "COMPLEMENTO", importancia: 2 }],
      sesionesPrimaria: 2,
    });

    const total = replan.cargas.reduce((suma, carga) => suma + carga.sessionsPerWeek, 0);
    expect(total).toBe(replan.asignadas.length);
  });

  it("las cargas conservan el proposito y la importancia que la persona contestó", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MAR: 60, MIE: 60, JUE: 60, VIE: 60 }),
      primaria: "PESAS",
      secundarias: [
        { discipline: "NATACION", proposito: "ENTRENAMIENTO", importancia: 2 },
        { discipline: "SQUASH", proposito: "COMPLEMENTO", importancia: 2 },
      ],
      sesionesPrimaria: 1,
    });

    const natacion = replan.cargas.find((carga) => carga.discipline === "NATACION");
    const squash = replan.cargas.find((carga) => carga.discipline === "SQUASH");

    // Ambas deben haber recibido al menos una sesión para que la prueba diga
    // algo: si una se quedó en cero, no está en `cargas` y no hay nada que
    // conservar.
    expect(natacion?.sessionsPerWeek).toBeGreaterThan(0);
    expect(squash?.sessionsPerWeek).toBeGreaterThan(0);
    expect(natacion).toMatchObject({ proposito: "ENTRENAMIENTO", importancia: 2 });
    expect(squash).toMatchObject({ proposito: "COMPLEMENTO", importancia: 2 });
  });

  it("la carga de la primaria no trae proposito ni importancia: eso es de las secundarias", () => {
    const replan = replanificar({
      tiempo: tiempo({ LUN: 60, MAR: 60 }),
      primaria: "PESAS",
      secundarias: [],
      sesionesPrimaria: 2,
    });

    const pesas = replan.cargas.find((carga) => carga.discipline === "PESAS");
    expect(pesas).not.toHaveProperty("proposito");
    expect(pesas).not.toHaveProperty("importancia");
  });
});
