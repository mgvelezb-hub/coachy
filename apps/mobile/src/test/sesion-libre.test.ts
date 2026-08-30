import { describe, expect, it } from "vitest";

import {
  cerrarTramo,
  cronometro,
  estadoInicialLibre,
  iniciar,
  intervaloDe,
  minutosDe,
  pausar,
  reanudar,
  transcurridoMs,
  type TramoPlan,
} from "@/lib/sesion-libre";

/**
 * La sesión que se mide en tiempo.
 *
 * Lo que se cuida: que una pausa no infle la duración —dejar el teléfono en la
 * banca durante una llamada no es entrenar— y que cada tramo quede con su
 * intervalo real, que es lo que después se le pregunta al reloj.
 */

const TRAMOS: TramoPlan[] = [
  { titulo: "Calentamiento", detalle: "200 m suaves" },
  { titulo: "Principal", detalle: "4 × 100 m" },
];

const T0 = 1_000_000;
const MINUTO = 60_000;

describe("sesión por tiempo", () => {
  it("no corre hasta que se inicia", () => {
    const estado = estadoInicialLibre(TRAMOS);
    expect(transcurridoMs(estado, T0 + MINUTO)).toBe(0);
  });

  it("cuenta el tiempo desde que arranca", () => {
    const estado = iniciar(estadoInicialLibre(TRAMOS), T0);
    expect(transcurridoMs(estado, T0 + 5 * MINUTO)).toBe(5 * MINUTO);
  });

  it("la pausa no cuenta como entrenamiento", () => {
    let estado = iniciar(estadoInicialLibre(TRAMOS), T0);
    estado = pausar(estado, T0 + 5 * MINUTO);

    // Diez minutos de llamada: el cronómetro no se movió.
    expect(transcurridoMs(estado, T0 + 15 * MINUTO)).toBe(5 * MINUTO);

    estado = reanudar(estado, T0 + 15 * MINUTO);
    expect(transcurridoMs(estado, T0 + 20 * MINUTO)).toBe(10 * MINUTO);
  });

  it("cada tramo empieza donde terminó el anterior", () => {
    let estado = iniciar(estadoInicialLibre(TRAMOS), T0);
    estado = cerrarTramo(estado, T0 + 4 * MINUTO).estado;
    estado = cerrarTramo(estado, T0 + 20 * MINUTO).estado;

    expect(estado.hechos).toHaveLength(2);
    expect(estado.hechos[0]).toMatchObject({ desdeMs: 0, hastaMs: 4 * MINUTO });
    expect(estado.hechos[1]).toMatchObject({ desdeMs: 4 * MINUTO, hastaMs: 20 * MINUTO });
  });

  it("cerrar el último tramo termina la sesión", () => {
    let estado = iniciar(estadoInicialLibre(TRAMOS), T0);
    estado = cerrarTramo(estado, T0 + MINUTO).estado;
    expect(estado.terminada).toBe(false);

    const ultimo = cerrarTramo(estado, T0 + 2 * MINUTO);
    expect(ultimo.termino).toBe(true);
    expect(ultimo.estado.terminada).toBe(true);
  });

  it("el intervalo de un tramo se traduce a fechas reales para el reloj", () => {
    let estado = iniciar(estadoInicialLibre(TRAMOS), T0);
    estado = cerrarTramo(estado, T0 + 4 * MINUTO).estado;

    const intervalo = intervaloDe(estado, estado.hechos[0]!)!;
    expect(intervalo.desde.getTime()).toBe(T0);
    expect(intervalo.hasta.getTime()).toBe(T0 + 4 * MINUTO);
  });

  it("no se puede cerrar un tramo antes de arrancar", () => {
    const estado = estadoInicialLibre(TRAMOS);
    expect(cerrarTramo(estado, T0).estado.hechos).toEqual([]);
  });

  it("el cronómetro se lee en minutos y segundos", () => {
    expect(cronometro(0)).toBe("0:00");
    expect(cronometro(65_000)).toBe("1:05");
    expect(cronometro(12 * MINUTO + 4_000)).toBe("12:04");
  });

  it("una sesión de segundos cuenta como un minuto, no como cero", () => {
    expect(minutosDe(20_000)).toBe(1);
    expect(minutosDe(45 * MINUTO)).toBe(45);
  });
});
