import { describe, expect, it } from "vitest";

import {
  agregarBloqueDelDia,
  avisoDeBloque,
  parseDayBlocks,
  quitarBloqueDelDia,
  sesionesDeBloquesDelDia,
} from "@/lib/training/bloques-dia";

const HOY = "2026-09-04";

describe("bloques del día", () => {
  it("un JSON corrupto no deja a nadie sin día", () => {
    expect(parseDayBlocks(null)).toEqual({});
    expect(parseDayBlocks(["2026-09-04"])).toEqual({});
    expect(parseDayBlocks({ "no-es-fecha": [{ discipline: "NATACION", tipo: "ENTRENO", minutos: 40 }] })).toEqual({});
    expect(
      parseDayBlocks({
        [HOY]: [
          { discipline: "NATACION", tipo: "ENTRENO", minutos: 40 },
          { discipline: "NO_EXISTE", tipo: "ENTRENO", minutos: 40 },
          { discipline: "GOLF", tipo: "LO_QUE_SEA", minutos: 40 },
          { discipline: "BOX", tipo: "LIBRE", minutos: 9000 },
        ],
      }),
    ).toEqual({ [HOY]: [{ discipline: "NATACION", tipo: "ENTRENO", minutos: 40 }] });
  });

  it("agregar y quitar el mismo día", () => {
    const conBloque = agregarBloqueDelDia({}, HOY, {
      discipline: "NATACION",
      tipo: "ENTRENO",
      minutos: 40,
    });
    expect(conBloque[HOY]).toHaveLength(1);

    // La misma disciplina no entra dos veces: se actualiza.
    const otraVez = agregarBloqueDelDia(conBloque, HOY, {
      discipline: "NATACION",
      tipo: "LIBRE",
      minutos: 30,
    });
    expect(otraVez[HOY]).toEqual([{ discipline: "NATACION", tipo: "LIBRE", minutos: 30 }]);

    // Y quitar el último deja la fecha fuera, no una lista vacía.
    expect(quitarBloqueDelDia(otraVez, HOY, "NATACION")).toEqual({});
  });

  it("un día no lleva más de dos bloques agregados", () => {
    let bloques = agregarBloqueDelDia({}, HOY, { discipline: "NATACION", tipo: "ENTRENO", minutos: 40 });
    bloques = agregarBloqueDelDia(bloques, HOY, { discipline: "GOLF", tipo: "LIBRE", minutos: 60 });
    bloques = agregarBloqueDelDia(bloques, HOY, { discipline: "BOX", tipo: "ENTRENO", minutos: 30 });

    expect(bloques[HOY]).toHaveLength(2);
    expect(bloques[HOY]!.map((bloque) => bloque.discipline)).toEqual(["GOLF", "BOX"]);
  });
});

describe("aviso de compatibilidad al agregar", () => {
  it("pierna pesada y squash el mismo día avisa, pero no bloquea", () => {
    const aviso = avisoDeBloque("SQUASH", { dayKind: "PIERNA_CUADRICEPS" });
    expect(aviso).not.toBeNull();
    expect(aviso).toContain("Pierna");
  });

  it("sin día de pierna no hay aviso que inventar", () => {
    expect(avisoDeBloque("SQUASH", { dayKind: "BRAZO" })).toBeNull();
    expect(avisoDeBloque("NATACION", { dayKind: "PIERNA_CUADRICEPS" })).toBeNull();
    expect(avisoDeBloque("SQUASH", { dayKind: null })).toBeNull();
  });
});

describe("los bloques del día como sesiones", () => {
  const entrada = {
    niveles: { NATACION: "INTERMEDIO" as const },
    objetivo: "RECOMPOSICION",
    isoWeek: 36,
    diasConGimnasio: ["VIE" as const],
  };

  it("ENTRENO trae la sesión prescrita con los minutos dados", () => {
    const sesiones = sesionesDeBloquesDelDia(
      { [HOY]: [{ discipline: "NATACION", tipo: "ENTRENO", minutos: 40 }] },
      new Date("2026-08-31T12:00:00"),
      entrada,
    );

    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]!.minutes).toBe(40);
    expect(sesiones[0]!.sesion).not.toBeNull();
    // Va DESPUÉS del bloque de la base.
    expect(sesiones[0]!.orden).toBe(2);
  });

  it("LIBRE solo reserva el tiempo: no inventa una sesión", () => {
    const sesiones = sesionesDeBloquesDelDia(
      { [HOY]: [{ discipline: "NATACION", tipo: "LIBRE", minutos: 30 }] },
      new Date("2026-08-31T12:00:00"),
      entrada,
    );

    expect(sesiones[0]!.sesion).toBeNull();
    expect(sesiones[0]!.note).toContain("reloj");
  });

  it("un bloque de otra semana no se cuela en esta", () => {
    const sesiones = sesionesDeBloquesDelDia(
      { "2026-10-20": [{ discipline: "NATACION", tipo: "ENTRENO", minutos: 40 }] },
      new Date("2026-08-31T12:00:00"),
      entrada,
    );
    expect(sesiones).toEqual([]);
  });
});
