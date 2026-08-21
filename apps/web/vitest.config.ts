import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Las pruebas de integración leen DATABASE_URL del mismo .env que usa Prisma.
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Comparten la base local: en paralelo se pisarían.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // `server-only` existe para romper el build del cliente; en Node estorba.
      "server-only": path.resolve(process.cwd(), "src/test/stubs/server-only.ts"),
    },
  },
});
