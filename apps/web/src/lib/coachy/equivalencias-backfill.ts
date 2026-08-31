import type { Prisma } from "@prisma/client";
import { equivalenciasDeAlimento } from "engine";
import type { Profile as EngineProfile } from "engine";

/**
 * Relleno de equivalencias sobre menús YA guardados.
 *
 * El motor mejoró dos veces después de que la gente ya tenía menús: primero
 * aprendió a dar equivalencias de los vegetales libres, y luego a llenar la
 * lista hasta cinco opciones en vez de quedarse con la primera exacta. Un
 * menú guardado no se entera de ninguna de las dos: sus equivalencias son las
 * que había el día que se generó, y la única forma de refrescarlas era
 * regenerar el menú completo — que le borra a la persona los cambios que ya
 * eligió. Por eso esto rellena SOLO los huecos:
 *
 *  - Un alimento sin ninguna equivalencia recibe su lista completa.
 *  - Un alimento con pocas opciones recibe las que le faltan, AGREGADAS al
 *    final; las que ya estaban no se tocan ni se reordenan, porque entre
 *    ellas está la opción de "volver" que dejó un intercambio anterior.
 *
 * Es una transformación pura sobre el JSON: no sabe de Prisma, así que se
 * prueba sin base de datos. Quien la llama decide si vale la pena guardar
 * (`cambiado`).
 */

type JsonRecord = Record<string, unknown>;

export interface BackfillResult {
  mealsJson: Prisma.JsonValue;
  equivalencesJson: Prisma.JsonValue;
  /** false si no faltaba nada: el caller se ahorra el UPDATE. */
  cambiado: boolean;
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

export function rellenaEquivalencias(
  mealsJson: Prisma.JsonValue,
  equivalencesJson: Prisma.JsonValue,
  profile: EngineProfile,
): BackfillResult {
  const meals = asRecordArray(mealsJson);
  if (meals.length === 0) {
    return { mealsJson, equivalencesJson, cambiado: false };
  }

  let cambiado = false;

  const nuevasMeals: JsonRecord[] = meals.map((meal) => {
    const items = asRecordArray(meal.items);
    const equivalences = asRecordArray(meal.equivalences);
    const porNombre = new Map(equivalences.map((e) => [String(e.forName ?? ""), e]));

    for (const item of items) {
      const nombre = String(item.name ?? "");
      const gramos = Number(item.grams ?? 0);
      if (nombre === "" || gramos <= 0) continue;

      const existente = porNombre.get(nombre);
      const opcionesActuales = existente ? asRecordArray(existente.options) : [];

      // Ya tiene de dónde elegir: no se toca. Rellenar de más movería una
      // lista que la persona ya conoce sin que ella haya pedido nada.
      if (opcionesActuales.length >= 3) continue;

      const frescas = equivalenciasDeAlimento(nombre, gramos, profile);
      if (frescas === null) continue;

      // Las que ya estaban se conservan tal cual —incluida la opción de
      // "volver" que deja un intercambio— y solo se agregan las que no
      // estaban, hasta completar la lista.
      const yaEstan = new Set(opcionesActuales.map((o) => String(o.name ?? "")));
      const agregadas = frescas.options
        .filter((opcion) => opcion.name !== nombre && !yaEstan.has(opcion.name))
        .map((opcion) => ({
          name: opcion.name,
          grams: opcion.grams,
          ...(opcion.aproximada === true ? { aproximada: true } : {}),
        }));

      if (agregadas.length === 0) continue;

      const opciones = [...opcionesActuales, ...agregadas];
      const aproximada =
        opciones.some((o) => o.aproximada === true) || frescas.aproximada === true;

      porNombre.set(nombre, {
        ...(existente ?? {}),
        forName: nombre,
        options: opciones,
        ...(aproximada ? { aproximada: true } : {}),
      });
      cambiado = true;
    }

    return { ...meal, equivalences: [...porNombre.values()] } satisfies JsonRecord;
  });

  if (!cambiado) return { mealsJson, equivalencesJson, cambiado: false };

  // La copia aplanada se reconstruye desde las comidas ya rellenadas: es un
  // espejo, nunca la fuente de verdad.
  const plano = nuevasMeals.flatMap((meal) =>
    asRecordArray(meal.equivalences).map((equivalencia) => ({
      slot: meal.slot,
      ...equivalencia,
    })),
  );

  return {
    mealsJson: nuevasMeals as unknown as Prisma.JsonValue,
    equivalencesJson: plano as unknown as Prisma.JsonValue,
    cambiado: true,
  };
}
