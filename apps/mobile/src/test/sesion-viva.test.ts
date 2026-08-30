import { describe, expect, it } from "vitest";

import {
  ajustarDescanso,
  cerrarSerie,
  estadoInicial,
  formatoReloj,
  primeraPendiente,
  progreso,
  saltarDescanso,
  tick,
  volumenKg,
  type EjercicioVivo,
} from "@/lib/sesion-viva";

/**
 * La máquina de la sesión en vivo.
 *
 * Lo que se prueba son las reglas que se sienten en el gimnasio: que el
 * descanso arranque solo, que no arranque al cambiar de máquina, y que
 * retomar una sesión a medias caiga en la serie correcta.
 */

function ejercicio(nombre: string, series: number, descanso = 90): EjercicioVivo {
  return {
    indice: 0,
    nombre,
    descansoSeg: descanso,
    series: Array.from({ length: series }, () => ({
      objetivo: 10,
      hechas: null,
      pesoKg: 40,
      calentamiento: false,
    })),
  };
}

describe("sesión en vivo", () => {
  it("arranca en la primera serie sin cerrar", () => {
    const estado = estadoInicial([ejercicio("Sentadilla", 3), ejercicio("Prensa", 3)]);
    expect(estado.ejercicioActual).toBe(0);
    expect(estado.serieActual).toBe(0);
    expect(estado.terminada).toBe(false);
  });

  it("retoma donde se quedó cuando ya había series capturadas", () => {
    const previo = ejercicio("Sentadilla", 3);
    previo.series[0]!.hechas = 10;
    previo.series[1]!.hechas = 9;

    const estado = estadoInicial([previo, ejercicio("Prensa", 3)]);
    expect(estado.ejercicioActual).toBe(0);
    expect(estado.serieActual).toBe(2);
  });

  it("al cerrar una serie arranca el descanso solo", () => {
    const estado = estadoInicial([ejercicio("Sentadilla", 3, 120)]);
    const { estado: siguiente, siguiente: que } = cerrarSerie(estado, { reps: 10, pesoKg: 60 });

    expect(que).toBe("descanso");
    expect(siguiente.descansoRestante).toBe(120);
    expect(siguiente.serieActual).toBe(1);
  });

  it("entre ejercicios NO cuenta descanso: el traslado ya es el descanso", () => {
    const estado = estadoInicial([ejercicio("Sentadilla", 1), ejercicio("Prensa", 3)]);
    const { estado: siguiente, siguiente: que } = cerrarSerie(estado, { reps: 10, pesoKg: 60 });

    expect(que).toBe("otro_ejercicio");
    expect(siguiente.descansoRestante).toBeNull();
    expect(siguiente.ejercicioActual).toBe(1);
    expect(siguiente.serieActual).toBe(0);
  });

  it("la última serie de la sesión termina la sesión, no abre descanso", () => {
    const estado = estadoInicial([ejercicio("Sentadilla", 1)]);
    const { estado: siguiente, siguiente: que } = cerrarSerie(estado, { reps: 8, pesoKg: 80 });

    expect(que).toBe("fin");
    expect(siguiente.terminada).toBe(true);
    expect(siguiente.descansoRestante).toBeNull();
  });

  it("el descanso baja de segundo en segundo y avisa una sola vez al terminar", () => {
    let estado = estadoInicial([ejercicio("Sentadilla", 3, 2)]);
    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }).estado;

    const primero = tick(estado);
    expect(primero.termino).toBe(false);
    expect(primero.estado.descansoRestante).toBe(1);

    const segundo = tick(primero.estado);
    expect(segundo.termino).toBe(true);
    expect(segundo.estado.descansoRestante).toBeNull();

    // Ya sin descanso corriendo, otro tick no vuelve a avisar.
    expect(tick(segundo.estado).termino).toBe(false);
  });

  it("se puede alargar o saltar el descanso", () => {
    let estado = estadoInicial([ejercicio("Sentadilla", 3, 60)]);
    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }).estado;

    expect(ajustarDescanso(estado, 30).descansoRestante).toBe(90);
    expect(saltarDescanso(estado).descansoRestante).toBeNull();
  });

  it("el progreso cuenta todas las series de la sesión", () => {
    let estado = estadoInicial([ejercicio("Sentadilla", 3), ejercicio("Prensa", 2)]);
    expect(progreso(estado)).toEqual({ hechas: 0, total: 5 });

    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }).estado;
    expect(progreso(estado)).toEqual({ hechas: 1, total: 5 });
  });

  it("el volumen ignora el calentamiento", () => {
    const uno = ejercicio("Sentadilla", 2);
    uno.series[0]!.calentamiento = true;

    let estado = estadoInicial([uno]);
    estado = cerrarSerie(estado, { reps: 20, pesoKg: 20 }).estado; // calentamiento
    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }).estado; // serie real

    expect(volumenKg(estado)).toBe(600);
  });

  it("no hay pendientes cuando todo está cerrado", () => {
    const uno = ejercicio("Sentadilla", 1);
    uno.series[0]!.hechas = 10;
    expect(primeraPendiente([uno])).toBeNull();
  });

  it("el descanso se lee en minutos y segundos", () => {
    expect(formatoReloj(90)).toBe("1:30");
    expect(formatoReloj(60)).toBe("1:00");
    expect(formatoReloj(5)).toBe("0:05");
  });
});
