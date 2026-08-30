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
  resolve: {
    alias: [
      // Los stubs van primero: cortan la cadena que arrastra React Native
      // hasta Node, donde su Flow no se puede parsear.
      { find: /^react-native$/, replacement: resolve(__dirname, "src/test/stubs/react-native.ts") },
      { find: "@/lib/supabase", replacement: resolve(__dirname, "src/test/stubs/supabase.ts") },
      { find: "@", replacement: resolve(__dirname, "src") },
    ],
  },
  test: {
    include: ["src/test/**/*.test.ts"],
    // `api.ts` exige la URL al importarse — es la guardia que evita publicar
    // una app apuntando a la nada. Aquí solo se necesita que exista.
    env: { EXPO_PUBLIC_API_URL: "http://localhost:3000" },
  },
});
