/**
 * Importa el historial privado de un atleta desde la terminal.
 *
 * Es la misma puerta que `/admin/import` (mismo validador, mismos upserts por
 * `(userId, date)`), pero sin navegador: sirve para cargar un historial
 * reconstruido a mano cuando el admin ya está en la terminal con el JSON
 * armado, y para repetir la carga sin volver a subir el archivo.
 *
 *   pnpm -F web tsx scripts/import-history.ts ../../data/private/mau-import.json
 *
 * La base es la de `DATABASE_URL`. Por defecto lee `.env.local` (producción);
 * con `--env .env` apunta a la base local. Nada de esto vive en el repo: los
 * JSON con datos de personas van en `data/private/`, que está ignorado.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

const args = process.argv.slice(2);
const envFlagIndex = args.indexOf("--env");
const envFile = envFlagIndex >= 0 ? args[envFlagIndex + 1] : ".env.local";
// El valor de `--env` no es el archivo: se salta solo cuando la bandera existe
// (sin ella, `envFlagIndex + 1` sería 0 y se comería el primer argumento).
const fileArg = args.find(
  (arg, index) => !arg.startsWith("--") && !(envFlagIndex >= 0 && index === envFlagIndex + 1),
);

if (!fileArg) {
  console.error("Uso: tsx scripts/import-history.ts <archivo.json> [--env .env.local]");
  process.exit(1);
}

loadEnv({ path: resolve(process.cwd(), envFile!), quiet: true });

const { PrismaClient, Prisma } = await import("@prisma/client");
const { parseAthleteImport } = await import("../src/lib/validation/import.ts");

/** `YYYY-MM-DD` → mediodía UTC, igual que `fromISODate` en la app. */
function fromISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function dec(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return value.toFixed(1) as unknown as InstanceType<typeof Prisma.Decimal>;
}

const parsed = parseAthleteImport(readFileSync(resolve(fileArg!), "utf8"));
if (!parsed.ok) {
  console.error("El JSON no cumple el formato esperado:");
  for (const error of parsed.errors) console.error(` · ${error}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const { athleteEmail, checkIns } = parsed.data;

const athlete = await prisma.user.findUnique({ where: { email: athleteEmail.toLowerCase() } });
if (!athlete) {
  console.error(`No hay ninguna cuenta con el correo ${athleteEmail}.`);
  await prisma.$disconnect();
  process.exit(1);
}

for (const entry of checkIns) {
  const date = fromISODate(entry.date);
  const data = {
    weightKg: dec(entry.weightKg),
    waistCm: dec(entry.waistCm),
    legLeftCm: dec(entry.legLeftCm),
    legRightCm: dec(entry.legRightCm),
    armLeftCm: dec(entry.armLeftCm),
    armRightCm: dec(entry.armRightCm),
    inflammation: entry.inflammation,
    energy: entry.energy,
    hunger: entry.hunger,
    satiety: entry.satiety,
    sleep: entry.sleep,
    strengthRpe: entry.strengthRpe ?? null,
    strengthTrend: entry.strengthTrend ?? null,
    dietCompliance: entry.dietCompliance,
    trainingCompliance: entry.trainingCompliance,
    symptoms: entry.symptoms,
    cyclePhase: entry.cyclePhase ?? null,
    comment: entry.comment ?? null,
  };

  await prisma.checkIn.upsert({
    where: { userId_date: { userId: athlete.id, date } },
    create: { userId: athlete.id, date, ...data },
    update: data,
  });

  console.log(`✓ ${entry.date}`);
}

console.log(`${checkIns.length} check-ins importados para ${athleteEmail}.`);
await prisma.$disconnect();
