import type { GrupoAlimento, UnidadPorcion } from "@/lib/api";

/**
 * Dar de alta un alimento que el catálogo no trae.
 *
 * Todo lo que se captura viaja como texto —así se escribe en un teléfono— y
 * aquí se convierte a lo que el motor entiende. Las kcal NO se preguntan: se
 * derivan de los macros con 4/4/9, porque capturadas a mano acaban peleadas
 * con la etiqueta y el menú deja de cuadrar.
 */

export interface FormaDelAlimento {
  nombre: string;
  grupo: GrupoAlimento;
  proteina: string;
  carbo: string;
  grasa: string;
  fibra: string;
  unidad: UnidadPorcion;
  gramosPorUnidad: string;
  minimo: string;
  maximo: string;
}

/** Un número escrito con coma o con punto, o 0 si no se escribió nada. */
export function num(texto: string): number {
  const limpio = texto.replace(",", ".").trim();
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : 0;
}

/** Calorías por 100 g con Atwater 4/4/9, para verlas mientras se captura. */
export function kcalPor100(proteina: string, carbo: string, grasa: string): number {
  return Math.round(num(proteina) * 4 + num(carbo) * 4 + num(grasa) * 9);
}

/**
 * Gramos de grasa por 100 g a partir de los cuales una proteína deja de ser
 * magra. Es el corte del catálogo, y se decide solo: nadie tiene por qué
 * saber de qué lado de la raya está su queso.
 */
const GRASA_QUE_DEJA_DE_SER_MAGRA = 8;

/** El rol del motor que le toca a ese grupo. */
export function rolDe(grupo: GrupoAlimento, grasaPor100: number): string {
  if (grupo === "proteina") {
    return grasaPor100 >= GRASA_QUE_DEJA_DE_SER_MAGRA ? "proteina_grasa" : "proteina_magra";
  }
  if (grupo === "carbo") return "carbo_complejo";
  if (grupo === "grasa") return "grasa";
  if (grupo === "fruta") return "fruta";
  return "vegetal_libre";
}

export interface PorcionSugerida {
  unidad: UnidadPorcion;
  gramosPorUnidad: number;
  minimo: number;
  maximo: number;
}

/**
 * La porción de casa con la que arranca cada grupo. Nadie sabe de memoria
 * cuántos gramos pesa su taza: se propone la del catálogo y se corrige si hace
 * falta.
 */
export const PORCION_POR_GRUPO: Record<GrupoAlimento, PorcionSugerida> = {
  proteina: { unidad: "g", gramosPorUnidad: 1, minimo: 100, maximo: 250 },
  carbo: { unidad: "taza", gramosPorUnidad: 150, minimo: 0.5, maximo: 2 },
  grasa: { unidad: "cda", gramosPorUnidad: 15, minimo: 0.5, maximo: 2 },
  fruta: { unidad: "pieza", gramosPorUnidad: 120, minimo: 1, maximo: 2 },
  verdura: { unidad: "taza", gramosPorUnidad: 100, minimo: 1, maximo: 3 },
};

/**
 * Qué le falta para poder guardarse, en una frase. `null` = está listo.
 *
 * Es la misma regla que el servidor, escrita aquí para decirlo antes de
 * mandar: nadie tiene que llenar un formulario dos veces para enterarse.
 */
export function problemaDelAlimento(forma: FormaDelAlimento): string | null {
  const nombre = forma.nombre.trim();
  if (nombre.length < 2 || nombre.length > 60) return "Escribe un nombre de 2 a 60 letras.";

  const proteina = num(forma.proteina);
  const carbo = num(forma.carbo);
  const grasa = num(forma.grasa);
  const fibra = num(forma.fibra);

  for (const macro of [proteina, carbo, grasa, fibra]) {
    if (macro < 0 || macro > 100) return "Los macros van de 0 a 100 g por cada 100 g.";
  }
  if (proteina + carbo + grasa > 100) {
    return "Proteína, carbohidrato y grasa no pueden sumar más de 100 g por cada 100 g.";
  }
  if (proteina + carbo + grasa === 0) return "Copia al menos un macro de la etiqueta.";
  if (fibra > carbo) return "La fibra es parte del carbohidrato: no puede ser mayor.";

  const gramos = num(forma.gramosPorUnidad);
  if (gramos <= 0 || gramos > 2000) return "Di cuánto pesa una unidad, en gramos.";

  const minimo = num(forma.minimo);
  const maximo = num(forma.maximo);
  if (minimo <= 0 || maximo <= 0) return "Pon un mínimo y un máximo por comida.";
  if (minimo > maximo) return "El máximo por comida no puede ser menor que el mínimo.";

  return null;
}
