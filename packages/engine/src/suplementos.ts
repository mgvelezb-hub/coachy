import type { MacroTargets, Phase, Profile } from './types.js';

/**
 * Los suplementos del dia — logica PURA.
 *
 * Separados del menu a proposito. El menu resuelve macros: cada alimento entra
 * porque aporta proteina, carbohidrato o grasa, y el solver reparte gramos
 * hasta cuadrar el objetivo. La creatina y el omega-3 no cuadran nada —una no
 * tiene calorias y el otro aporta una grasa que no mueve el reparto—, asi que
 * meterlos al solver los volveria variables de una ecuacion a la que no
 * pertenecen.
 *
 * Lo que si son: una lista corta de "esto tomas, esta cantidad, en este
 * momento", derivada de reglas fijas. Por eso viven aparte.
 *
 * **Solo se sugiere lo que la persona declaro tener.** No hay recomendaciones
 * de compra: si no marco la creatina, la creatina no aparece — ni como
 * sugerencia ni como "te falta". Un plan que empuja productos deja de ser un
 * plan y se vuelve un catalogo.
 */

export const SUPPLEMENTS = ['WHEY', 'CREATINA', 'OMEGA3'] as const;
export type Supplement = (typeof SUPPLEMENTS)[number];

export type PautaSuplemento = {
  supplement: Supplement;
  /** Como se llama en la lista. */
  nombre: string;
  /** Cuanto: "5 g", "1 medida (30 g)". */
  dosis: string;
  /** Cuando: "cualquier hora", "con la comida", "despues de entrenar". */
  momento: string;
  /** Por que, en una linea. Sin esto es una instruccion sin razon. */
  porque: string;
};

/**
 * Fases donde la proteina en polvo tiene mas sentido.
 *
 * En corte agresivo la proteina objetivo es alta y las calorias bajas: llegar
 * con comida entera cuesta mas trabajo, y ahi el polvo resuelve. En fases de
 * mantenimiento no hace falta empujarlo.
 */
const FASES_CON_POLVO: readonly Phase[] = ['CUT', 'CUT_AGRESIVO', 'REFEED'];

/**
 * Cuanta proteina al dia hace pensar en polvo.
 *
 * Por encima de esto, llegar solo con comida entera implica cuatro o cinco
 * porciones grandes de carne al dia, que es donde la gente falla.
 */
const PROTEINA_ALTA_G = 150;

export function pautasDeSuplementos(input: {
  profile: Profile;
  macros: MacroTargets;
  phase: Phase;
}): PautaSuplemento[] {
  const tiene = new Set(input.profile.supplements ?? []);
  const pautas: PautaSuplemento[] = [];

  if (tiene.has('CREATINA')) {
    pautas.push({
      supplement: 'CREATINA',
      nombre: 'Creatina monohidratada',
      dosis: '5 g',
      // La creatina se acumula en el musculo: lo que importa es tomarla todos
      // los dias, no la hora. Prescribir un horario exacto sugiere una
      // precision que el suplemento no tiene.
      momento: 'a cualquier hora, todos los dias',
      porque: 'Sostiene la fuerza en series largas. Funciona por acumulacion, no por el momento.',
    });
  }

  if (tiene.has('OMEGA3')) {
    pautas.push({
      supplement: 'OMEGA3',
      nombre: 'Omega-3 (aceite de pescado)',
      dosis: '1 a 2 capsulas',
      momento: 'con una comida que tenga grasa',
      porque: 'Se absorbe mejor con grasa. En ayunas se aprovecha menos y suele repetir.',
    });
  }

  if (tiene.has('WHEY')) {
    const proteinaAlta = input.macros.proteinG >= PROTEINA_ALTA_G;
    const faseExigente = FASES_CON_POLVO.includes(input.phase);

    pautas.push({
      supplement: 'WHEY',
      nombre: 'Proteina en polvo',
      dosis: '1 medida (30 g)',
      momento: faseExigente || proteinaAlta ? 'despues de entrenar' : 'cuando no alcances con comida',
      porque:
        faseExigente || proteinaAlta
          ? `Tu objetivo de ${Math.round(input.macros.proteinG)} g de proteina cuesta llegar solo con comida entera.`
          : 'Es un recurso, no un requisito: con tu objetivo de hoy la comida entera alcanza.',
    });
  }

  return pautas;
}

/**
 * ¿El menu puede usar polvos de proteina como alimento?
 *
 * Si la persona no tiene proteina en polvo, el solver no debe repartirle
 * gramos: un menu que pide 30 g de whey a quien no tiene whey es un menu que
 * no se puede seguir.
 */
export function permitePolvos(profile: Profile): boolean {
  return (profile.supplements ?? []).includes('WHEY');
}
