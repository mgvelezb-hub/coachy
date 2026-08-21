import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Raíz del monorepo. Sin esto Next adivina mal cuando hay otro lockfile arriba
// en el árbol, y el trazado de archivos del deploy se va por otro lado.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
  // Prisma engines must not be bundled by the server compiler.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
