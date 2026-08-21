import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un archivo "use server" solo puede exportar funciones async. Cualquier otro
 * export (constantes, objetos) llega vacío al cliente en producción y revienta
 * los formularios que lo usan como estado inicial. Esto ya pasó una vez.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('archivos "use server"', () => {
  const files = walk(join(process.cwd(), "src")).filter((f) =>
    /^\s*["']use server["'];/m.test(readFileSync(f, "utf8").slice(0, 200)),
  );

  it("existen archivos de server actions", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s solo exporta funciones", (file) => {
    const src = readFileSync(file, "utf8");
    const bad = src.match(/^export\s+(const|let|var|class|default\s+(?!async\s+function))/gm) ?? [];
    expect(bad, `exports no permitidos en ${file}`).toEqual([]);
  });
});
