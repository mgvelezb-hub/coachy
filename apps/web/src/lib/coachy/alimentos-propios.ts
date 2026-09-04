import type { Food, FoodRole, ServingUnit } from "engine";
import { z } from "zod";

/**
 * Alimentos que la persona dio de alta porque el catálogo no los tiene: el
 * yogur de su marca, la proteína que compra, el pan de su panadería.
 *
 * No son una lista aparte que el motor consulte al final: se mezclan con el
 * catálogo y compiten con las mismas reglas —rol, plantilla del slot, cotas de
 * porción, afinidad, presupuesto—. Si la planeación no los pide, no entran; si
 * sí, entran igual que los demás.
 *
 * Aquí vive lo puro: qué se acepta al capturarlos y cómo se ven desde el
 * motor. Lo que toca la base de datos vive en la ruta.
 */

/** Roles del motor que alguien puede elegir. `suplemento` no: eso es Alacena. */
export const ROLES_PROPIOS = [
  "proteina_magra",
  "proteina_grasa",
  "carbo_pre",
  "carbo_post",
  "carbo_complejo",
  "grasa",
  "fruta",
  "vegetal_libre",
] as const;

/** Unidades caseras del motor (SMAE traducido a la cocina). */
export const UNIDADES_PROPIAS = [
  "cdita",
  "cda",
  "taza",
  "media_taza",
  "pieza",
  "rebanada",
  "scoop",
  "g",
] as const;

/** Los cinco grupos con los que la pantalla habla: nadie dice "carbo_post". */
export const GRUPOS_PROPIOS = ["proteina", "carbo", "grasa", "fruta", "verdura"] as const;
export type GrupoPropio = (typeof GRUPOS_PROPIOS)[number];

/**
 * Gramos de grasa por 100 g a partir de los cuales una proteína deja de ser
 * magra. Es el corte del catálogo: el atún en agua (1 g) y la pechuga (3.6 g)
 * son magras; el huevo (9.9 g) y el queso no. Se decide por la etiqueta y no
 * preguntándole a la persona, que no tiene por qué saber dónde está la raya.
 */
const GRASA_QUE_DEJA_DE_SER_MAGRA = 8;

/** El rol del motor que le toca a ese grupo. La proteína se parte por grasa. */
export function rolPorGrupo(grupo: GrupoPropio, fatPer100: number): FoodRole {
  if (grupo === "proteina") {
    return fatPer100 >= GRASA_QUE_DEJA_DE_SER_MAGRA ? "proteina_grasa" : "proteina_magra";
  }
  if (grupo === "carbo") return "carbo_complejo";
  if (grupo === "grasa") return "grasa";
  if (grupo === "fruta") return "fruta";
  return "vegetal_libre";
}

/** El camino de vuelta: el grupo con el que la pantalla agrupa ese rol. */
export function grupoDeRol(role: string): GrupoPropio {
  if (role === "proteina_magra" || role === "proteina_grasa") return "proteina";
  if (role === "grasa") return "grasa";
  if (role === "fruta") return "fruta";
  if (role === "vegetal_libre") return "verdura";
  return "carbo";
}

const numeroPor100 = z.number().min(0).max(100);

export const alimentoPropioSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    role: z.enum(ROLES_PROPIOS),
    proteinPer100: numeroPor100,
    carbPer100: numeroPor100,
    fatPer100: numeroPor100,
    fiberPer100: numeroPor100.default(0),
    servingUnit: z.enum(UNIDADES_PROPIAS),
    gramsPerUnit: z.number().positive().max(2000),
    minUnits: z.number().positive().max(100),
    maxUnits: z.number().positive().max(100),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((valor, ctx) => {
    // 100 g de comida no pueden traer más de 100 g de macros. Es el error de
    // dedo típico al copiar la etiqueta: la columna "por porción" en el
    // renglón de "por 100 g".
    if (valor.proteinPer100 + valor.carbPer100 + valor.fatPer100 > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["proteinPer100"],
        message: "Proteína, carbohidrato y grasa no pueden sumar más de 100 g por cada 100 g.",
      });
    }
    if (valor.fiberPer100 > valor.carbPer100) {
      ctx.addIssue({
        code: "custom",
        path: ["fiberPer100"],
        message: "La fibra es parte del carbohidrato: no puede ser mayor.",
      });
    }
    if (valor.minUnits > valor.maxUnits) {
      ctx.addIssue({
        code: "custom",
        path: ["maxUnits"],
        message: "El máximo por comida no puede ser menor que el mínimo.",
      });
    }
  });

export type AlimentoPropio = z.infer<typeof alimentoPropioSchema>;

/** Fila de `custom_foods` con los decimales ya en número. */
export interface FilaAlimentoPropio {
  id: string;
  name: string;
  role: string;
  proteinPer100: number;
  carbPer100: number;
  fatPer100: number;
  fiberPer100: number;
  servingUnit: string;
  gramsPerUnit: number;
  minUnits: number;
  maxUnits: number;
  tags: string[];
}

/** El id con el que ese alimento vive dentro del motor. */
export function idDelMotor(id: string): string {
  return `custom:${id}`;
}

/** El uuid de vuelta, o null si ese id no es de un alimento propio. */
export function idDeLaFila(idMotor: string): string | null {
  return idMotor.startsWith("custom:") ? idMotor.slice("custom:".length) : null;
}

/**
 * La fila guardada, vista por el motor.
 *
 * Tres decisiones que no vienen de la persona:
 * - **kcal** se derivan con Atwater 4/4/9 en vez de pedirlas: si se capturan a
 *   mano acaban peleadas con los macros y el menú deja de cuadrar.
 * - **costRel 2** es el escalón intermedio, el mismo default del catálogo: no
 *   se cae con presupuesto `medio` ni `alto`, y solo lo filtra `bajo`.
 * - **`rapido` y `sin_cocinar`** porque un alimento capturado de una etiqueta
 *   es un producto que se sirve, no una receta. Sin ellas quedaría fuera de
 *   los slots peri-entreno, que es justo donde vive el yogur y la proteína en
 *   polvo de quien lo dio de alta.
 */
export function aFoodDelMotor(fila: FilaAlimentoPropio): Food {
  const unidad = fila.servingUnit as ServingUnit;
  const tags = [...new Set([...fila.tags, "rapido", "sin_cocinar"])];

  return {
    id: idDelMotor(fila.id),
    name: fila.name,
    role: fila.role as FoodRole,
    proteinPer100: fila.proteinPer100,
    carbPer100: fila.carbPer100,
    fatPer100: fila.fatPer100,
    fiberPer100: fila.fiberPer100,
    kcalPer100: Math.round(
      (fila.proteinPer100 * 4 + fila.carbPer100 * 4 + fila.fatPer100 * 9) * 10,
    ) / 10,
    gi: null,
    costRel: 2,
    prepMin: 0,
    tags,
    servingG: fila.gramsPerUnit,
    unit: unidad === "g" ? "g" : unidad,
    serving: {
      unit: unidad,
      gramsPerUnit: fila.gramsPerUnit,
      minUnits: fila.minUnits,
      maxUnits: fila.maxUnits,
      // Piezas y scoops no se parten a la mitad: es 1 pieza o son 2.
      step: unidad === "pieza" || unidad === "scoop" ? 1 : 0.5,
    },
  };
}
