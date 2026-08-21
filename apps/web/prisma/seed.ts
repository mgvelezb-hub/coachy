/**
 * Seed de catálogos genéricos: ejercicios y alimentos.
 *
 * Este repo es público. El seed NO crea usuarios, perfiles, medidas ni fotos:
 * el historial real de cualquier atleta entra por /admin/import, nunca por
 * aquí. Si algo en este archivo identifica a una persona, es un bug.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const HERE = dirname(fileURLToPath(import.meta.url));

interface ExerciseSeed {
  name: string;
  muscleGroup: string;
  poolRole: string;
  isTracker: boolean;
  substitutes: string[];
}

interface FoodSeed {
  name: string;
  role: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  gi: number | null;
  costRel: number;
  prepMin: number;
  tags: string[];
}

/** Forma de `packages/engine/data/foods.json`, si el motor ya lo publicó. */
interface EngineFood {
  name: string;
  role: string;
  kcalPer100: number;
  proteinPer100: number;
  carbPer100: number;
  fatPer100: number;
  fiberPer100: number;
  gi: number | null;
  costRel: number;
  prepMin: number;
  tags?: string[];
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Las etiquetas que nombran a una persona no entran a la base pública.
 * El motor las usa internamente; aquí se quedan fuera.
 */
function publicTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => !/^favorito_/i.test(tag));
}

function loadFoods(): FoodSeed[] {
  const fromEngine = readJson<EngineFood[]>(
    join(HERE, "..", "..", "..", "packages", "engine", "data", "foods.json"),
  );

  if (fromEngine && Array.isArray(fromEngine) && fromEngine.length > 0) {
    console.log(`Alimentos desde packages/engine/data/foods.json (${fromEngine.length}).`);
    return fromEngine.map((food) => ({
      name: food.name,
      role: food.role,
      kcal: food.kcalPer100,
      proteinG: food.proteinPer100,
      carbsG: food.carbPer100,
      fatG: food.fatPer100,
      fiberG: food.fiberPer100 ?? 0,
      gi: food.gi ?? null,
      costRel: food.costRel ?? 2,
      prepMin: food.prepMin ?? 10,
      tags: publicTags(food.tags),
    }));
  }

  const fallback = readJson<FoodSeed[]>(join(HERE, "foods.fallback.json")) ?? [];
  console.log(`Alimentos desde el catálogo genérico de apps/web (${fallback.length}).`);
  return fallback.map((food) => ({ ...food, tags: publicTags(food.tags) }));
}

async function main(): Promise<void> {
  const exercises = readJson<ExerciseSeed[]>(join(HERE, "exercises.json")) ?? [];

  for (const exercise of exercises) {
    await prisma.exercise.upsert({
      where: { name: exercise.name },
      create: exercise,
      update: exercise,
    });
  }
  console.log(`Ejercicios: ${exercises.length}`);

  const foods = loadFoods();
  for (const food of foods) {
    const data = {
      role: food.role,
      kcal: food.kcal.toFixed(2),
      proteinG: food.proteinG.toFixed(2),
      carbsG: food.carbsG.toFixed(2),
      fatG: food.fatG.toFixed(2),
      fiberG: (food.fiberG ?? 0).toFixed(2),
      gi: food.gi,
      costRel: food.costRel,
      prepMin: food.prepMin,
      tags: food.tags,
    };
    await prisma.food.upsert({
      where: { name: food.name },
      create: { name: food.name, ...data },
      update: data,
    });
  }
  console.log(`Alimentos: ${foods.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
