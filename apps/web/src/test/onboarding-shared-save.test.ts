import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Prueba de ESTRUCTURA, no de comportamiento: no toca Postgres y siempre
 * corre (a diferencia de los `*-db.test.ts`, que se saltan solos sin
 * `DATABASE_URL`). Lo que verifica es la garantía central del helper
 * compartido: que la Server Action de la web y `POST /api/v1/onboarding`
 * llaman la MISMA función de guardado (`saveOnboarding` en
 * `@/lib/onboarding`) en vez de reimplementar el `prisma.profile.upsert`
 * cada una por su lado. Si alguna de las dos vuelve a traer su propio
 * upsert, esta prueba truena aunque nadie tenga Postgres corriendo.
 */

function read(relative: string): string {
  return readFileSync(path.resolve(process.cwd(), relative), "utf8");
}

describe("guardado de onboarding: una sola función para web y API", () => {
  it("lib/onboarding.ts define saveOnboarding y ahí vive el upsert", () => {
    const source = read("src/lib/onboarding.ts");
    expect(source).toMatch(/export\s+async\s+function\s+saveOnboarding/);
    expect(source).toMatch(/prisma\.profile\.upsert/);
  });

  it("la Server Action de la web importa saveOnboarding y no reimplementa el upsert", () => {
    const source = read("src/app/onboarding/actions.ts");
    expect(source).toMatch(/import\s*\{[^}]*saveOnboarding[^}]*\}\s*from\s*["']@\/lib\/onboarding["']/);
    expect(source).not.toMatch(/prisma\.profile\.upsert/);
  });

  it("POST /api/v1/onboarding importa la misma función y no reimplementa el upsert", () => {
    const source = read("src/app/api/v1/onboarding/route.ts");
    expect(source).toMatch(/import\s*\{[^}]*saveOnboarding[^}]*\}\s*from\s*["']@\/lib\/onboarding["']/);
    expect(source).not.toMatch(/prisma\.profile\.upsert/);
  });
});
