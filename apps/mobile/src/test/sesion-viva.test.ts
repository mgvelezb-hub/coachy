import { describe, expect, it } from "vitest";

import {
  ajustarDescanso,
  cerrarDescanso,
  cerrarSerie,
  descansoTermino,
  editarSerie,
  estadoInicial,
  formatoReloj,
  primeraPendiente,
  progreso,
  restanteSeg,
  saltarDescanso,
  volumenKg,
  type EjercicioVivo,
} from "@/lib/sesion-viva";

/** Una hora fija: el descanso se mide contra el reloj y las pruebas no lo leen. */
const AHORA = new Date("2026-09-01T18:00:00Z").getTime();

/**
 * La máquina de la sesión en vivo.
 *
 * Lo que se prueba son las reglas que se sienten en el gimnasio: que el
 * descanso arranque solo, que también corra al cambiar de máquina, y que
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
    const { estado: siguiente, siguiente: que } = cerrarSerie(
      estado,
      { reps: 10, pesoKg: 60 },
      AHORA,
    );

    expect(que).toBe("descanso");
    expect(siguiente.descansoHasta).toBe(AHORA + 120_000);
    expect(siguiente.serieActual).toBe(1);
  });

  it("la última serie de un ejercicio TAMBIÉN descansa", () => {
    // Antes no: se asumía que el traslado a la otra máquina era el descanso.
    // En el gimnasio la otra máquina está a diez pasos, y quien acababa una
    // serie pesada arrancaba la siguiente sin nada de por medio.
    const estado = estadoInicial([ejercicio("Sentadilla", 1, 120), ejercicio("Prensa", 3)]);
    const { estado: siguiente, siguiente: que } = cerrarSerie(
      estado,
      { reps: 10, pesoKg: 60 },
      AHORA,
    );

    expect(que).toBe("otro_ejercicio");
    expect(siguiente.descansoHasta).toBe(AHORA + 120_000);
    expect(siguiente.ejercicioActual).toBe(1);
    expect(siguiente.serieActual).toBe(0);
  });

  it("la última serie de la sesión termina la sesión, no abre descanso", () => {
    const estado = estadoInicial([ejercicio("Sentadilla", 1)]);
    const { estado: siguiente, siguiente: que } = cerrarSerie(estado, { reps: 8, pesoKg: 80 });

    expect(que).toBe("fin");
    expect(siguiente.terminada).toBe(true);
    expect(siguiente.descansoHasta).toBeNull();
  });

  it("el descanso se mide contra el reloj, no contra los ticks de la app", () => {
    // iOS congela los timers en segundo plano: quien contesta un mensaje a
    // media serie volvía con el descanso parado en el segundo en que salió.
    let estado = estadoInicial([ejercicio("Sentadilla", 3, 120)]);
    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }, AHORA).estado;

    expect(restanteSeg(estado, AHORA)).toBe(120);
    expect(restanteSeg(estado, AHORA + 30_000)).toBe(90);

    // Cinco minutos en el fondo: al volver, el descanso ya se acabó.
    expect(restanteSeg(estado, AHORA + 300_000)).toBe(0);
    expect(descansoTermino(estado, AHORA + 300_000)).toBe(true);
    expect(cerrarDescanso(estado).descansoHasta).toBeNull();
  });

  it("se puede alargar o saltar el descanso", () => {
    let estado = estadoInicial([ejercicio("Sentadilla", 3, 60)]);
    estado = cerrarSerie(estado, { reps: 10, pesoKg: 60 }, AHORA).estado;

    expect(restanteSeg(ajustarDescanso(estado, 30, AHORA), AHORA)).toBe(90);
    expect(saltarDescanso(estado).descansoHasta).toBeNull();
  });

  it("una serie ya cerrada se puede corregir sin mover dónde vas", () => {
    // Cerrar una serie sin peso no tenía vuelta atrás: quedaba capturada en
    // cero y la única salida era rehacer la sesión.
    let estado = estadoInicial([ejercicio("Sentadilla", 3, 60)]);
    estado = cerrarSerie(estado, { reps: 10, pesoKg: null }, AHORA).estado;
    estado = cerrarSerie(estado, { reps: 9, pesoKg: 60 }, AHORA).estado;

    const corregido = editarSerie(estado, 0, 0, { reps: 10, pesoKg: 62.5 });

    expect(corregido.ejercicios[0]!.series[0]).toMatchObject({ hechas: 10, pesoKg: 62.5 });
    // El cursor no se mueve: quien corrige la serie 1 sigue en la 3.
    expect(corregido.serieActual).toBe(estado.serieActual);
    expect(corregido.descansoHasta).toBe(estado.descansoHasta);
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
