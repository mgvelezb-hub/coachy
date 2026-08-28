/**
 * Corre Coachy sobre UN check-in, desde la terminal.
 *
 *   pnpm -F web tsx --conditions=react-server scripts/run-coachy.ts <checkInId>
 *
 * Existe además de `/api/coachy/run` porque ese endpoint procesa la cola
 * entera (los 10 check-ins más recientes sin decisión, de todos los atletas).
 * Cuando lo que falta es un solo check-in —uno importado a mano, o uno cuyo
 * análisis se cayó— la cola completa dispararía análisis y redacciones de
 * semanas viejas que nadie pidió, y cada una cuesta una llamada a Claude.
 *
 * `--conditions=react-server` no es adorno: los módulos de `lib/coachy`
 * importan `server-only`, que revienta al importarse fuera de esa condición.
 *
 * La base es la de `DATABASE_URL`; por defecto se lee `.env.local`.
 */

import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

const args = process.argv.slice(2);
const envFlagIndex = args.indexOf("--env");
const envFile = envFlagIndex >= 0 ? args[envFlagIndex + 1] : ".env.local";
const checkInId = args.find(
  (arg, index) => !arg.startsWith("--") && !(envFlagIndex >= 0 && index === envFlagIndex + 1),
);

if (!checkInId) {
  console.error("Uso: tsx --conditions=react-server scripts/run-coachy.ts <checkInId> [--env .env.local]");
  process.exit(1);
}

loadEnv({ path: resolve(process.cwd(), envFile!), quiet: true });

const { runCoachy } = await import("../src/lib/coachy/index.ts");

const result = await runCoachy(checkInId);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
