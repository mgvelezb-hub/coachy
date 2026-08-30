import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Pruebas de la lógica PURA de la app.
 *
 * Solo entra lo que no toca React Native: la máquina de la sesión en vivo, el
 * catálogo de paneles, las cuentas de nutrición y entrenamiento. Montar un
 * runtime de RN para probar componentes cuesta más de lo que devuelve —lo que
 * de verdad se rompe son las reglas, y las reglas viven en `src/lib`.
 */
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: { include: ["src/test/**/*.test.ts"] },
});
