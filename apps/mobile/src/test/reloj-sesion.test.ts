import { describe, expect, it } from "vitest";

import {
  aplicarDelReloj,
  paraElReloj,
  type SerieCerradaEnReloj,
} from "@/lib/reloj-sesion";
import { cerrarSerie, estadoInicial, type EjercicioVivo } from "@/lib/sesion-viva";

/**
 * El puente con el reloj.
 *
 * Lo que se prueba aquí no es que los campos se copien: es que una serie que
 * llega tarde desde la muñeca no borre lo que alguien ya tecleó en el teléfono,
 * y que la sesión quede parada donde de verdad va después de sincronizar.
 */

function sesionDePrueba(): EjercicioVivo[] {
  return [
    {
      indice: 0,
      nombre: "Sentadilla",
      descansoSeg: 120,
      series: [
        { objetivo: 10, hechas: null, pesoKg: 60, calentamiento: true },
        { objetivo: 8, hechas: null, pesoKg: 100, calentamiento: false },
        { objetivo: 8, hechas: null, pesoKg: 100, calentamiento: false },
      ],
    },
    {
      indice: 1,
      nombre: "Press banca",
      descansoSeg: 90,
      series: [{ objetivo: 10, hechas: null, pesoKg: 70, calentamiento: false }],
    },
  ];
}

const WORKOUT = "w-1";

function cerrada(campos: Partial<SerieCerradaEnReloj>): SerieCerradaEnReloj {
  return {
    workoutId: WORKOUT,
    ejercicioIndice: 0,
    serieIndice: 0,
    reps: 10,
    pesoKg: null,
    cerradaEn: "2026-08-30T10:00:00.000Z",
    muestra: [],
    duracionSeg: 30,
    ...campos,
  };
}

describe("lo que viaja a la muñeca", () => {
  it("lleva lo justo para contestar qué toca ahora", () => {
    const espejo = paraElReloj(WORKOUT, "Pierna", estadoInicial(sesionDePrueba()));

    expect(espejo.workoutId).toBe(WORKOUT);
    expect(espejo.titulo).toBe("Pierna");
    expect(espejo.ejercicios).toHaveLength(2);
    expect(espejo.ejercicios[0]!.series[0]).toEqual({
      indice: 0,
      objetivo: 10,
      pesoKg: 60,
      calentamiento: true,
      hechas: null,
    });
  });

  it("las series ya cerradas viajan cerradas: el reloj no las vuelve a pedir", () => {
    const { estado } = cerrarSerie(estadoInicial(sesionDePrueba()), { reps: 9, pesoKg: 60 });
    const espejo = paraElReloj(WORKOUT, "Pierna", estado);

    expect(espejo.ejercicios[0]!.series[0]!.hechas).toBe(9);
    expect(espejo.ejercicios[0]!.series[1]!.hechas).toBeNull();
  });
});

describe("lo que llega de la muñeca", () => {
  it("cierra la serie y deja la sesión parada en la siguiente", () => {
    const { estado, aplicadas } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ reps: 10 })],
      WORKOUT,
    );

    expect(aplicadas).toHaveLength(1);
    expect(estado.ejercicios[0]!.series[0]!.hechas).toBe(10);
    expect(estado.ejercicioActual).toBe(0);
    expect(estado.serieActual).toBe(1);
  });

  it("varias de golpe dejan la sesión donde de verdad va", () => {
    const { estado } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [
        cerrada({ serieIndice: 0, reps: 10 }),
        cerrada({ serieIndice: 1, reps: 8 }),
        cerrada({ serieIndice: 2, reps: 7 }),
      ],
      WORKOUT,
    );

    expect(estado.ejercicioActual).toBe(1);
    expect(estado.serieActual).toBe(0);
    expect(estado.terminada).toBe(false);
  });

  it("cerrar la última desde el reloj termina la sesión", () => {
    const todas = [0, 1, 2].map((serieIndice) => cerrada({ serieIndice, reps: 8 }));
    todas.push(cerrada({ ejercicioIndice: 1, serieIndice: 0, reps: 10 }));

    const { estado } = aplicarDelReloj(estadoInicial(sesionDePrueba()), todas, WORKOUT);

    expect(estado.terminada).toBe(true);
    expect(estado.descansoHasta).toBeNull();
  });
});

describe("lo que NO se aplica", () => {
  it("una serie que el teléfono ya cerró: los kilos tecleados no se pierden", () => {
    const { estado: conTelefono } = cerrarSerie(estadoInicial(sesionDePrueba()), {
      reps: 6,
      pesoKg: 110,
    });

    const { estado, aplicadas } = aplicarDelReloj(
      conTelefono,
      [cerrada({ serieIndice: 0, reps: 10, pesoKg: null })],
      WORKOUT,
    );

    expect(aplicadas).toHaveLength(0);
    expect(estado.ejercicios[0]!.series[0]!.hechas).toBe(6);
    expect(estado.ejercicios[0]!.series[0]!.pesoKg).toBe(110);
  });

  it("una serie de otra sesión", () => {
    const { aplicadas } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ workoutId: "otra" })],
      WORKOUT,
    );
    expect(aplicadas).toHaveLength(0);
  });

  it("índices que no existen, en vez de reventar", () => {
    const { estado, aplicadas } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ ejercicioIndice: 9 }), cerrada({ ejercicioIndice: 1, serieIndice: 5 })],
      WORKOUT,
    );
    expect(aplicadas).toHaveLength(0);
    expect(estado.terminada).toBe(false);
  });

  it("reps imposibles", () => {
    const { aplicadas } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ reps: -3 }), cerrada({ reps: 2.5 })],
      WORKOUT,
    );
    expect(aplicadas).toHaveLength(0);
  });
});

describe("el peso, que el reloj no sabe teclear", () => {
  it("sin peso del reloj se conserva el del plan", () => {
    const { estado } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ serieIndice: 1, reps: 8, pesoKg: null })],
      WORKOUT,
    );
    expect(estado.ejercicios[0]!.series[1]!.pesoKg).toBe(100);
  });

  it("si el reloj sí lo trae, manda el del reloj", () => {
    const { estado } = aplicarDelReloj(
      estadoInicial(sesionDePrueba()),
      [cerrada({ serieIndice: 1, reps: 8, pesoKg: 105 })],
      WORKOUT,
    );
    expect(estado.ejercicios[0]!.series[1]!.pesoKg).toBe(105);
  });
});
