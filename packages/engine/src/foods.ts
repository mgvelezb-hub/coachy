import foodsData from '../data/foods.json';
import type { Food, FoodRole } from './types.js';

export const FOODS: Food[] = foodsData as Food[];

export function foodsByRole(role: FoodRole, pool: Food[] = FOODS): Food[] {
  return pool.filter((f) => f.role === role);
}

export function findFood(id: string, pool: Food[] = FOODS): Food | undefined {
  return pool.find((f) => f.id === id);
}

/** Normaliza para comparar nombres escritos por el usuario (sin acentos, minusculas). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** true si el alimento coincide con alguno de los terminos (id, nombre o tag). */
export function matchesAny(food: Food, terms: string[] | undefined): boolean {
  if (!terms || terms.length === 0) return false;
  const haystack = [food.id, food.name, ...food.tags].map(normalize);
  return terms.some((term) => {
    const t = normalize(term);
    if (!t) return false;
    return haystack.some((h) => h === t || h.includes(t) || t.includes(h));
  });
}
