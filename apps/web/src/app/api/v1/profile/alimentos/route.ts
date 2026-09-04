import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import {
  alimentoPropioSchema,
  grupoDeRol,
  idDelMotor,
} from "@/lib/coachy/alimentos-propios";
import { aFila } from "@/lib/coachy/alimentos-propios-db";
import { parsePantry } from "@/lib/coachy/mapping";
import { prisma } from "@/lib/prisma";

/**
 * Los alimentos que la persona da de alta porque el catálogo no los tiene: el
 * yogur de su marca, la proteína que compra, el pan de su panadería.
 *
 * Nació de buscar "Yogurt Griego" en la despensa y no encontrarlo. La
 * búsqueda tolerante arregló la mitad; la otra mitad es que hay comida que
 * simplemente no está, y sin poder darla de alta el menú sigue proponiendo lo
 * que no hay en casa.
 *
 * Lo que se guarda aquí entra al motor por el mismo camino que el catálogo
 * (`alimentosPropiosDe` en `@/lib/coachy/alimentos-propios-db`): compite con
 * las mismas reglas y no se cuela a la fuerza. Esta ruta NO rearma la semana
 * —eso lo pide la despensa, que es donde se decide qué hay en casa—.
 */

export const dynamic = "force-dynamic";

/** Tope por persona: más que esto ya no es "lo que me falta", es otro catálogo. */
const MAX_PROPIOS = 60;

const conDespensa = alimentoPropioSchema.and(
  z.object({
    /** "Guardar y marcar en mi alacena": queda declarado como que ya está en casa. */
    enDespensa: z.boolean().optional(),
  }),
);

const paraEditar = z.object({ id: z.string().uuid() }).and(conDespensa);

/** El alimento como lo lee la app: lo guardado más el grupo con el que se pinta. */
function aRespuesta(fila: Parameters<typeof aFila>[0]) {
  const datos = aFila(fila);
  return { ...datos, grupo: grupoDeRol(datos.role), idMotor: idDelMotor(datos.id) };
}

/** Marca o desmarca ese alimento en la despensa del perfil. */
async function sincronizaDespensa(
  userId: string,
  idMotor: string,
  enDespensa: boolean | undefined,
): Promise<void> {
  if (enDespensa === undefined) return;
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { pantry: true },
  });
  if (!profile) return;

  const actual = parsePantry(profile.pantry);
  const pantry = enDespensa
    ? [...new Set([...actual, idMotor])]
    : actual.filter((id) => id !== idMotor);
  if (pantry.length === actual.length && enDespensa) return;

  await prisma.profile.update({ where: { userId }, data: { pantry } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const filas = await prisma.customFood.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ alimentos: filas.map(aRespuesta) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = conDespensa.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "alimento inválido", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const cuantos = await prisma.customFood.count({ where: { userId: user.id } });
  if (cuantos >= MAX_PROPIOS) {
    return NextResponse.json(
      { error: `Ya tienes ${MAX_PROPIOS} alimentos propios. Borra alguno para agregar otro.` },
      { status: 409 },
    );
  }

  const { enDespensa, ...datos } = parsed.data;
  const fila = await prisma.customFood.create({ data: { userId: user.id, ...datos } });
  await sincronizaDespensa(user.id, idDelMotor(fila.id), enDespensa);

  return NextResponse.json({ alimento: aRespuesta(fila) }, { status: 201 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = paraEditar.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "alimento inválido", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const { id, enDespensa, ...datos } = parsed.data;
  // El `where` lleva el userId: nadie edita el alimento de otra persona
  // aunque adivine el uuid.
  const actualizados = await prisma.customFood.updateMany({
    where: { id, userId: user.id },
    data: datos,
  });
  if (actualizados.count === 0) {
    return NextResponse.json({ error: "ese alimento no existe" }, { status: 404 });
  }

  await sincronizaDespensa(user.id, idDelMotor(id), enDespensa);
  const fila = await prisma.customFood.findUnique({ where: { id } });

  return NextResponse.json({ alimento: fila ? aRespuesta(fila) : null });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const borrados = await prisma.customFood.deleteMany({ where: { id, userId: user.id } });
  if (borrados.count === 0) {
    return NextResponse.json({ error: "ese alimento no existe" }, { status: 404 });
  }

  // Sale también de la despensa: dejarlo ahí sería declarar que tienes en casa
  // un alimento que ya no existe, y el motor lo buscaría en cada menú.
  await sincronizaDespensa(user.id, idDelMotor(id), false);

  return NextResponse.json({ borrado: true });
}
