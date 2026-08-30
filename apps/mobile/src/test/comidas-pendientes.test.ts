import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La cola de respuestas de comida.
 *
 * Lo que se prueba no es que guarde: es que **no pierda**. Se contesta desde
 * la notificación —a veces desde el reloj, a veces sin señal, a veces con la
 * app cerrada— y una respuesta perdida ahí deja la comida como "no
 * contestada", que es distinto de saltada y ensucia el apego.
 */

const almacen = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (llave: string) => almacen.get(llave) ?? null,
    setItem: async (llave: string, valor: string) => {
      almacen.set(llave, valor);
    },
  },
}));

const enviadas: unknown[] = [];
let falla = false;

vi.mock("@/lib/api", () => ({
  postComidaLog: async (input: unknown) => {
    if (falla) throw new Error("sin señal");
    enviadas.push(input);
    return { registro: input };
  },
}));

const { comidasPendientes, drenarComidas, responderComida } = await import(
  "@/lib/comidas-pendientes"
);

beforeEach(() => {
  almacen.clear();
  enviadas.length = 0;
  falla = false;
});

describe("con señal", () => {
  it("la respuesta sale y no queda nada pendiente", async () => {
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: true });

    expect(enviadas).toEqual([{ date: "2026-08-30", slot: "comida_2", taken: true }]);
    expect(await comidasPendientes()).toBe(0);
  });
});

describe("sin señal", () => {
  it("la respuesta se guarda en vez de perderse", async () => {
    falla = true;
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: false });

    expect(enviadas).toHaveLength(0);
    expect(await comidasPendientes()).toBe(1);
  });

  it("sale sola cuando vuelve la señal", async () => {
    falla = true;
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: false });

    falla = false;
    expect(await drenarComidas()).toBe(1);
    expect(await comidasPendientes()).toBe(0);
    expect(enviadas).toEqual([{ date: "2026-08-30", slot: "comida_2", taken: false }]);
  });

  it("corregirse deja una sola respuesta, la última", async () => {
    falla = true;
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: true });
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: false });

    expect(await comidasPendientes()).toBe(1);

    falla = false;
    await drenarComidas();
    expect(enviadas).toEqual([{ date: "2026-08-30", slot: "comida_2", taken: false }]);
  });

  it("comidas distintas del mismo día conviven", async () => {
    falla = true;
    await responderComida({ date: "2026-08-30", slot: "comida_1", taken: true });
    await responderComida({ date: "2026-08-30", slot: "comida_2", taken: false });

    expect(await comidasPendientes()).toBe(2);
  });
});
