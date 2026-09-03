import { describe, expect, it } from "vitest";

import {
  horaDeMinutos,
  minutosDeHora,
  normalizaHorarios,
  parseMealTimes,
  parseMealTimesByDay,
  validaHorarios,
  validaHorariosPorDia,
  type TiempoDeComida,
} from "@/lib/coachy/horarios";

function tiempo(slot: string, label: string, hora: string): TiempoDeComida {
  return { slot, label, hora, propia: true };
}

describe("horas", () => {
  it("lee y escribe horas de 24 horas", () => {
    expect(minutosDeHora("07:30")).toBe(450);
    expect(minutosDeHora("23:59")).toBe(1439);
    expect(horaDeMinutos(450)).toBe("07:30");
  });

  it("rechaza lo que no es una hora", () => {
    expect(minutosDeHora("25:00")).toBeNull();
    expect(minutosDeHora("7:5")).toBeNull();
    expect(minutosDeHora("mañana")).toBeNull();
  });
});

describe("validaHorarios", () => {
  it("acepta un día normal", () => {
    const resultado = validaHorarios([
      tiempo("DESAYUNO", "Desayuno", "07:30"),
      tiempo("COMIDA", "Comida", "14:00"),
      tiempo("CENA", "Cena", "20:30"),
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.errores).toEqual([]);
  });

  it("no deja que la cena quede antes que la comida", () => {
    const resultado = validaHorarios([
      tiempo("COMIDA", "Comida", "15:00"),
      tiempo("CENA", "Cena", "12:00"),
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]).toContain("no puede ser antes que");
  });

  it("no deja dos comidas pegadas", () => {
    const resultado = validaHorarios([
      tiempo("COMIDA", "Comida", "14:00"),
      tiempo("CENA", "Cena", "15:00"),
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]).toContain("90 minutos");
  });

  it("no deja comer de madrugada", () => {
    const resultado = validaHorarios([tiempo("DESAYUNO", "Desayuno", "03:00")]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]).toContain("fuera del día");
  });

  it("deja alejar el post-entreno, pero lo dice", () => {
    const resultado = validaHorarios([
      tiempo("PRE", "Pre-entreno", "07:00"),
      tiempo("POST", "Post-entreno", "13:00"),
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.avisos[0]).toContain("post-entreno");
  });

  it("avisa cuando el día de comidas se estira demasiado", () => {
    const resultado = validaHorarios([
      tiempo("DESAYUNO", "Desayuno", "05:00"),
      tiempo("CENA", "Cena", "22:00"),
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.avisos.some((aviso) => aviso.includes("16 horas"))).toBe(true);
  });
});

describe("guardado", () => {
  it("normaliza y tira lo que no es hora", () => {
    expect(normalizaHorarios({ COMIDA: "9:5", CENA: "8:00", SNACK: "nope" })).toEqual({
      CENA: "08:00",
    });
  });

  it("un json raro del perfil no rompe nada", () => {
    expect(parseMealTimes(null)).toEqual({});
    expect(parseMealTimes(["07:00"])).toEqual({});
    expect(parseMealTimes({ COMIDA: 14 })).toEqual({});
    expect(parseMealTimes({ COMIDA: "14:00" })).toEqual({ COMIDA: "14:00" });
  });
});

describe("validaHorariosPorDia", () => {
  it("valida cada día por separado, con sus propios candados", () => {
    const resultado = validaHorariosPorDia({
      SAB: [tiempo("DESAYUNO", "Desayuno", "10:00"), tiempo("COMIDA", "Comida", "15:00")],
      DOM: [tiempo("DESAYUNO", "Desayuno", "10:00"), tiempo("COMIDA", "Comida", "10:30")],
    });

    expect(resultado.SAB!.ok).toBe(true);
    expect(resultado.DOM!.ok).toBe(false);
    expect(resultado.DOM!.errores[0]).toContain("90 minutos");
  });

  it("un día vacío es válido: no hay nada que chocar", () => {
    const resultado = validaHorariosPorDia({ SAB: [] });
    expect(resultado.SAB!.ok).toBe(true);
  });
});

describe("mealTimesByDay", () => {
  it("un json raro no rompe nada", () => {
    expect(parseMealTimesByDay(null)).toEqual({});
    expect(parseMealTimesByDay({ SAB: "10:00" })).toEqual({ SAB: {} });
    expect(parseMealTimesByDay({ SAB: { COMIDA: 14 } })).toEqual({ SAB: {} });
    expect(parseMealTimesByDay({ SAB: { COMIDA: "10:00" }, LUNES_MAL: { COMIDA: "10:00" } })).toEqual({
      SAB: { COMIDA: "10:00" },
    });
  });
});
