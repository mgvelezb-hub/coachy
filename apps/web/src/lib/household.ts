import "server-only";

import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Vínculo entre dos cuentas que viven juntas (pareja, roommates) — la BASE
 * de lo que a futuro va a compartir cosas entre ellas. Hoy este módulo solo
 * crea y disuelve el vínculo; no comparte absolutamente nada todavía (eso
 * llega con la lista de súper compartida, el primer caso de uso real).
 *
 * El vínculo se hace por CÓDIGO de invitación, nunca buscando cuentas por
 * correo: exponer una búsqueda por email revelaría quién más usa la app a
 * cualquiera que probara direcciones. El código (6 caracteres, alfabeto sin
 * ambigüedades) se comparte fuera de la app — de palabra, por WhatsApp — y
 * solo sirve para aceptar la invitación de quien ya lo tiene en la mano.
 *
 * Reglas de negocio (decididas, no re-discutir aquí):
 * - Máximo 2 personas por vínculo.
 * - Una cuenta solo puede tener UN vínculo ACTIVO o PENDIENTE vigente a la vez.
 * - El código vive 48 horas; pasado ese tiempo deja de poder aceptarse.
 * - Cualquiera de los dos —quien invitó o quien aceptó— puede disolver.
 */

const VIGENCIA_HORAS = 48;

/** Sin O/I (se confunden con 0/1) ni 0/1 mismos: 8 dígitos + 24 letras = 32 símbolos. */
const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LARGO_CODIGO = 6;

const ESTADOS_VIGENTES = ["ACTIVO", "PENDIENTE"] as const;

export class HouseholdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HouseholdError";
  }
}

/** Código de invitación: 6 caracteres del alfabeto sin ambigüedades, criptográficamente aleatorio. */
export function generaCodigo(): string {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  }
  return codigo;
}

/**
 * Enmascara un correo para mostrarlo sin exponerlo completo: `"irma@gmail.com"`
 * → `"i***@gmail.com"`. Se usa en `vinculoDe` — la app nunca necesita ver el
 * correo completo de la otra persona, solo confirmar con quién está vinculada.
 */
export function enmascaraCorreo(email: string): string {
  const arroba = email.indexOf("@");
  if (arroba <= 0) return "***";

  const local = email.slice(0, arroba);
  const dominio = email.slice(arroba + 1);
  return `${local[0]}***@${dominio}`;
}

function expirado(link: { expiresAt: Date }, ahora: Date): boolean {
  return link.expiresAt.getTime() <= ahora.getTime();
}

/** El vínculo ACTIVO o PENDIENTE vigente de una cuenta, o `null` si no tiene. */
async function vinculoVigente(userId: string) {
  const ahora = new Date();
  const link = await prisma.householdLink.findFirst({
    where: {
      status: { in: [...ESTADOS_VIGENTES] },
      OR: [{ inviterId: userId }, { inviteeId: userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!link) return null;
  if (link.status === "PENDIENTE" && expirado(link, ahora)) return null;
  return link;
}

/**
 * Crea una invitación nueva, o reutiliza la PENDIENTE vigente si ya existe
 * una (mismo código, no se generan dos invitaciones abiertas al mismo tiempo).
 * Si la cuenta tenía una PENDIENTE ya expirada, la marca DISUELTA y emite una
 * nueva. Si ya tiene un vínculo ACTIVO, no deja crear otro: hay que disolver
 * primero.
 */
export async function crearInvitacion(
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const ahora = new Date();
  const existente = await prisma.householdLink.findFirst({
    where: {
      status: { in: [...ESTADOS_VIGENTES] },
      OR: [{ inviterId: userId }, { inviteeId: userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existente) {
    if (existente.status === "ACTIVO") {
      throw new HouseholdError(
        "Ya tienes un vínculo activo. Disuélvelo antes de crear uno nuevo.",
      );
    }

    // PENDIENTE: si sigue vigente, se reutiliza en vez de duplicar la invitación.
    if (!expirado(existente, ahora)) {
      return { code: existente.code, expiresAt: existente.expiresAt };
    }

    // PENDIENTE pero ya expiró: se cierra antes de emitir la nueva.
    await prisma.householdLink.update({
      where: { id: existente.id },
      data: { status: "DISUELTO", dissolvedAt: ahora },
    });
  }

  const expiresAt = new Date(ahora.getTime() + VIGENCIA_HORAS * 60 * 60 * 1000);

  const MAX_INTENTOS = 5;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    try {
      const link = await prisma.householdLink.create({
        data: { inviterId: userId, code: generaCodigo(), expiresAt },
      });
      return { code: link.code, expiresAt: link.expiresAt };
    } catch (error) {
      // P2002: choque de `code` único — reintenta con un código nuevo.
      const esChoqueDeCodigo =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!esChoqueDeCodigo) throw error;
    }
  }

  throw new HouseholdError("No se pudo generar un código de invitación. Intenta de nuevo.");
}

/**
 * Acepta una invitación por código. Valida que el código exista, no haya
 * expirado, siga PENDIENTE, no sea el propio (nadie se vincula consigo
 * mismo) y que quien acepta no tenga ya un vínculo activo o pendiente.
 */
export async function aceptarInvitacion(
  userId: string,
  code: string,
): Promise<{ status: string; pareja: string }> {
  const normalizado = code.trim().toUpperCase();

  const link = await prisma.householdLink.findUnique({
    where: { code: normalizado },
    include: { inviter: { select: { email: true } } },
  });

  if (!link) {
    throw new HouseholdError("Ese código no existe.");
  }
  if (link.status !== "PENDIENTE") {
    throw new HouseholdError("Ese código ya no está disponible.");
  }
  if (expirado(link, new Date())) {
    throw new HouseholdError("Ese código ya expiró.");
  }
  if (link.inviterId === userId) {
    throw new HouseholdError("No puedes vincularte contigo mismo.");
  }

  const propio = await vinculoVigente(userId);
  if (propio) {
    throw new HouseholdError(
      "Ya tienes un vínculo activo o pendiente. Disuélvelo antes de aceptar otro.",
    );
  }

  const ahora = new Date();
  await prisma.householdLink.update({
    where: { id: link.id },
    data: { status: "ACTIVO", inviteeId: userId, acceptedAt: ahora },
  });

  return { status: "ACTIVO", pareja: enmascaraCorreo(link.inviter.email) };
}

export interface VinculoView {
  status: string;
  pareja: string | null;
  expiresAt?: Date;
}

/**
 * El vínculo ACTIVO o PENDIENTE vigente de la cuenta, listo para mostrar: el
 * correo de la otra persona viene ENMASCARADO — nunca completo. `pareja` es
 * `null` mientras el vínculo sigue PENDIENTE (todavía no hay "otra persona").
 */
export async function vinculoDe(userId: string): Promise<VinculoView | null> {
  const link = await vinculoVigente(userId);
  if (!link) return null;

  if (link.status === "PENDIENTE") {
    return { status: link.status, pareja: null, expiresAt: link.expiresAt };
  }

  const otroId = link.inviterId === userId ? link.inviteeId : link.inviterId;
  if (!otroId) {
    // No debería pasar con status ACTIVO, pero sin la otra persona no hay pareja que mostrar.
    return { status: link.status, pareja: null };
  }

  const otro = await prisma.user.findUnique({ where: { id: otroId }, select: { email: true } });
  return { status: link.status, pareja: otro ? enmascaraCorreo(otro.email) : null };
}

/** Disuelve el vínculo vigente de la cuenta. Cualquiera de los dos puede hacerlo. */
export async function disolver(userId: string): Promise<void> {
  const link = await vinculoVigente(userId);
  if (!link) {
    throw new HouseholdError("No tienes un vínculo qué disolver.");
  }

  await prisma.householdLink.update({
    where: { id: link.id },
    data: { status: "DISUELTO", dissolvedAt: new Date() },
  });
}
