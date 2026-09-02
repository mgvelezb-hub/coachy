import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HouseholdError,
  aceptarInvitacion,
  crearInvitacion,
  disolver,
  guardaSuperComprados,
  superCompradosDe,
  vinculoDe,
} from "@/lib/household";
import { prisma } from "@/lib/prisma";

/**
 * El vínculo entre cuentas, de punta a punta contra Postgres: crear
 * invitación, aceptarla, ver el vínculo con correo enmascarado, disolverlo,
 * y la lista de súper compartida que vive sobre ese vínculo.
 *
 * Se salta sola si no hay Postgres, igual que las demás pruebas de base.
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`select 1`;
    return true;
  } catch {
    return false;
  }
}

const available = await databaseReachable();

describe.skipIf(!available)("vínculo de household contra la base", () => {
  let aId: string;
  let bId: string;
  let cId: string;

  async function crearUsuario(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `test-${id}@coachy.invalid`, role: "ATHLETE" } });
    return id;
  }

  beforeEach(async () => {
    aId = await crearUsuario();
    bId = await crearUsuario();
    cId = await crearUsuario();
  });

  afterEach(async () => {
    // Cascade se encarga de los household_links: inviterId es ON DELETE CASCADE.
    await prisma.user.deleteMany({ where: { id: { in: [aId, bId, cId] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("crea una invitación PENDIENTE con código y vigencia de 48 h", async () => {
    const antes = Date.now();
    const { code, expiresAt } = await crearInvitacion(aId);

    expect(code).toHaveLength(6);
    const horas = (expiresAt.getTime() - antes) / (60 * 60 * 1000);
    expect(horas).toBeGreaterThan(47.9);
    expect(horas).toBeLessThan(48.1);

    const vinculo = await vinculoDe(aId);
    expect(vinculo).toMatchObject({ status: "PENDIENTE", pareja: null });
  });

  it("reutiliza la invitación PENDIENTE vigente en vez de crear otra", async () => {
    const primera = await crearInvitacion(aId);
    const segunda = await crearInvitacion(aId);
    expect(segunda.code).toBe(primera.code);

    const total = await prisma.householdLink.count({ where: { inviterId: aId } });
    expect(total).toBe(1);
  });

  it("rechaza crear una segunda invitación si ya hay un vínculo ACTIVO", async () => {
    const { code } = await crearInvitacion(aId);
    await aceptarInvitacion(bId, code);

    await expect(crearInvitacion(aId)).rejects.toThrow(HouseholdError);
    await expect(crearInvitacion(bId)).rejects.toThrow(HouseholdError);
  });

  it("acepta un código válido y dos deja el vínculo ACTIVO para ambos", async () => {
    const { code } = await crearInvitacion(aId);
    const resultado = await aceptarInvitacion(bId, code);

    expect(resultado.status).toBe("ACTIVO");

    const vinculoA = await vinculoDe(aId);
    const vinculoB = await vinculoDe(bId);
    expect(vinculoA?.status).toBe("ACTIVO");
    expect(vinculoB?.status).toBe("ACTIVO");
    // Cada quien ve el correo del OTRO, enmascarado — nunca el propio ni completo.
    expect(vinculoA?.pareja).not.toBeNull();
    expect(vinculoA?.pareja).toMatch(/^.\*\*\*@/);
  });

  it("rechaza un código inexistente", async () => {
    await expect(aceptarInvitacion(aId, "ZZZZZZ")).rejects.toThrow(HouseholdError);
  });

  it("rechaza vincularse con el propio código", async () => {
    const { code } = await crearInvitacion(aId);
    await expect(aceptarInvitacion(aId, code)).rejects.toThrow(HouseholdError);
  });

  it("rechaza aceptar dos veces el mismo código", async () => {
    const { code } = await crearInvitacion(aId);
    await aceptarInvitacion(bId, code);
    await expect(aceptarInvitacion(cId, code)).rejects.toThrow(HouseholdError);
  });

  it("rechaza aceptar si quien acepta ya tiene un vínculo vigente", async () => {
    const otraInvitacion = await crearInvitacion(bId);
    await aceptarInvitacion(cId, otraInvitacion.code);

    const { code } = await crearInvitacion(aId);
    // c ya está vinculada con b; no puede aceptar también la de a.
    await expect(aceptarInvitacion(cId, code)).rejects.toThrow(HouseholdError);
  });

  it("cualquiera de los dos puede disolver, y libera el cupo para invitar de nuevo", async () => {
    const { code } = await crearInvitacion(aId);
    await aceptarInvitacion(bId, code);

    await disolver(bId);

    expect(await vinculoDe(aId)).toBeNull();
    expect(await vinculoDe(bId)).toBeNull();

    // Con el vínculo disuelto, a puede volver a invitar sin choque.
    const nueva = await crearInvitacion(aId);
    expect(nueva.code).not.toBe(code);
  });

  it("disolver sin vínculo vigente da un error claro", async () => {
    await expect(disolver(aId)).rejects.toThrow(HouseholdError);
  });

  describe("lista de súper compartida", () => {
    it("sin vínculo, superCompradosDe da null y guardar rechaza con error claro", async () => {
      expect(await superCompradosDe(aId)).toBeNull();
      await expect(guardaSuperComprados(aId, ["leche"])).rejects.toThrow(HouseholdError);
    });

    it("con vínculo PENDIENTE (sin aceptar todavía), sigue sin compartir", async () => {
      await crearInvitacion(aId);
      expect(await superCompradosDe(aId)).toBeNull();
      await expect(guardaSuperComprados(aId, ["leche"])).rejects.toThrow(HouseholdError);
    });

    it("con vínculo ACTIVO, empieza vacía y lo que guarda uno lo ve el otro", async () => {
      const { code } = await crearInvitacion(aId);
      await aceptarInvitacion(bId, code);

      expect(await superCompradosDe(aId)).toEqual([]);
      expect(await superCompradosDe(bId)).toEqual([]);

      await guardaSuperComprados(aId, ["leche", "huevo"]);

      expect(await superCompradosDe(aId)).toEqual(["leche", "huevo"]);
      expect(await superCompradosDe(bId)).toEqual(["leche", "huevo"]);
    });

    it("guardar reemplaza la lista completa, no la combina con la anterior", async () => {
      const { code } = await crearInvitacion(aId);
      await aceptarInvitacion(bId, code);

      await guardaSuperComprados(aId, ["leche", "huevo"]);
      await guardaSuperComprados(bId, ["pan"]);

      expect(await superCompradosDe(aId)).toEqual(["pan"]);
    });

    it("al disolver el vínculo, vuelve a no haber lista compartida", async () => {
      const { code } = await crearInvitacion(aId);
      await aceptarInvitacion(bId, code);
      await guardaSuperComprados(aId, ["leche"]);

      await disolver(aId);

      expect(await superCompradosDe(aId)).toBeNull();
      expect(await superCompradosDe(bId)).toBeNull();
    });
  });
});
