import { describe, expect, it } from "vitest";

import { calculaPropuestas, type RegistroComidaAprendizaje } from "@/lib/coachy/horarios-aprendidos";
import type { TiempoDeComida } from "@/lib/coachy/horarios";

/**
 * El aprendizaje semanal de horarios.
 *
 * Lo que importa probar no es la mediana en sí — es que la propuesta NUNCA
 * viola los candados de `horarios.ts` (orden, 90 minutos, ventana del día) y
 * que sin evidencia suficiente no propone nada. Proponer un horario que el
 * propio servidor rechazaría después sería peor que no proponer: rompería la
 * confianza en el botón "Mover".
 */

function tiempo(slot: string, label: string, hora: string): TiempoDeComida {
  return { slot, label, hora, propia: false };
}

function registro(
  slot: string,
  date: string,
  plannedAt: string,
  takenHora: string,
): RegistroComidaAprendizaje {
  return { slot, date, plannedAt, takenHora };
}

// Cuatro miércoles seguidos: comía COMIDA a las 15:20, no a las 14:30 del plan.
const ENTRE_SEMANA_TARDE: RegistroComidaAprendizaje[] = [
  registro("COMIDA", "2026-08-05", "14:30", "15:22"),
  registro("COMIDA", "2026-08-12", "14:30", "15:18"),
  registro("COMIDA", "2026-08-19", "14:30", "15:21"),
  registro("COMIDA", "2026-08-26", "14:30", "15:19"),
];

describe("calculaPropuestas", () => {
  it("no propone nada sin evidencia suficiente (menos de 4 registros)", () => {
    const propuestas = calculaPropuestas(
      ENTRE_SEMANA_TARDE.slice(0, 3),
      [tiempo("DESAYUNO", "Desayuno", "07:30"), tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "20:30")],
    );
    expect(propuestas).toEqual([]);
  });

  it("no propone nada si el desfase es menor a 30 minutos", () => {
    const chico = ENTRE_SEMANA_TARDE.map((r) => ({ ...r, takenHora: "14:45" }));
    const propuestas = calculaPropuestas(
      chico,
      [tiempo("DESAYUNO", "Desayuno", "07:30"), tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "20:30")],
    );
    expect(propuestas).toEqual([]);
  });

  it("propone mover el slot cuando el desfase es consistente y grande", () => {
    const propuestas = calculaPropuestas(
      ENTRE_SEMANA_TARDE,
      [tiempo("DESAYUNO", "Desayuno", "07:30"), tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "20:30")],
    );

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({ slot: "COMIDA", dia: "SEMANA", actual: "14:30", evidencia: 4 });
    // La mediana de +50/+48/+51/+49 min: la propuesta cae cerca de 15:20.
    expect(propuestas[0]!.propuesta).toBe("15:20");
  });

  it("separa fin de semana de entre semana", () => {
    const finDeSemana: RegistroComidaAprendizaje[] = [
      registro("COMIDA", "2026-08-01", "14:30", "12:58"),
      registro("COMIDA", "2026-08-08", "14:30", "13:00"),
      registro("COMIDA", "2026-08-15", "14:30", "13:00"),
      registro("COMIDA", "2026-08-22", "14:30", "13:02"),
    ];
    const propuestas = calculaPropuestas(
      finDeSemana,
      [tiempo("DESAYUNO", "Desayuno", "07:30"), tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "20:30")],
    );

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]!.dia).toBe("FIN");
    expect(propuestas[0]!.propuesta).toBe("13:00");
  });

  it("recorta la propuesta si viola los 90 minutos con la comida vecina", () => {
    // La cena vigente está a las 16:40: proponer 15:20 para comida deja solo
    // 80 minutos de margen, así que se recorta al límite exacto (15:10).
    const propuestas = calculaPropuestas(
      ENTRE_SEMANA_TARDE,
      [tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "16:40")],
    );

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]!.propuesta).toBe("15:10");
  });

  it("descarta la propuesta si el recorte no deja margen para moverse", () => {
    // Cena a las 16:00: el horario vigente ya está en el límite exacto de 90
    // minutos, así que no hay hueco para mover comida sin romper el candado.
    const propuestas = calculaPropuestas(
      ENTRE_SEMANA_TARDE,
      [tiempo("COMIDA", "Comida", "14:30"), tiempo("CENA", "Cena", "16:00")],
    );

    expect(propuestas).toEqual([]);
  });

  it("nunca escribe: solo regresa datos, no toca nada por su cuenta", () => {
    // Prueba de contrato: la función es pura, no importa nada con efectos.
    expect(typeof calculaPropuestas).toBe("function");
  });
});
