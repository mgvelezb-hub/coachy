/**
 * Los textos y las cuentas de la pantalla de Nutrición — lógica PURA.
 *
 * Todo lo que aquí se explica describe lo que el motor YA hace: no hay un
 * segundo criterio nutricional escrito en la app. Si el motor cambia, estos
 * textos cambian con él.
 *
 * Nada de esto es una indicación médica. Es la explicación de un plan
 * generado por reglas, no una consulta.
 */

/** Mililitros de agua por kilo de peso al día. */
const AGUA_ML_POR_KG = 35;

/**
 * Agua sugerida al día, en litros.
 *
 * 35 ml por kilo es la referencia práctica de uso común para personas adultas
 * sanas con actividad moderada; sube con el calor y con el entrenamiento
 * largo. Sin peso registrado no se inventa un número.
 */
export function aguaDelDia(pesoKg: number | null): number | null {
  if (pesoKg === null || pesoKg <= 0) return null;
  return Math.round(((pesoKg * AGUA_ML_POR_KG) / 1000) * 10) / 10;
}

export const PRESUPUESTOS = [
  {
    valor: "BAJO" as const,
    nombre: "Bajo",
    detalle: "Solo lo más barato del catálogo. Menos variedad, misma proteína.",
  },
  {
    valor: "MEDIO" as const,
    nombre: "Medio",
    detalle: "Abre el escalón intermedio: más cortes y más pescado.",
  },
  {
    valor: "ALTO" as const,
    nombre: "Alto",
    detalle: "Sin tope de precio. Toda la variedad del catálogo.",
  },
];

/** El tipo de dieta que la app arma hoy, con lo que sí y lo que no hace. */
export const DIETA_ACTUAL = {
  nombre: "Omnívora por equivalencias",
  resumen:
    "Comida normal repartida en tus comidas del día, con intercambios por alimento. No hay grupos prohibidos ni ventanas de ayuno: lo que manda son las cantidades.",
  puntos: [
    "Proteína en cada comida: es lo que sostiene el músculo mientras bajas grasa, y lo que más sacia por caloría.",
    "Los carbohidratos densos se acomodan alrededor de tu entrenamiento, donde se usan mejor.",
    "Los vegetales van libres: suman volumen y fibra sin mover los números.",
    "Cada alimento trae equivalencias dentro del 10 % de su macro, para que puedas cambiarlo sin recalcular nada.",
  ],
} as const;

/**
 * Por qué el menú se ve como se ve. Son las reglas del motor dichas en
 * español, no consejos sueltos.
 */
export const PORQUE_DEL_PLAN = [
  {
    titulo: "Las cantidades no son decoración",
    texto:
      "Los gramos salen de tus calorías y tus macros, y esos salen de tu peso, tu actividad y tu fase. Comer el mismo alimento en otra cantidad cambia el resultado aunque el platillo se llame igual.",
  },
  {
    titulo: "Los horarios acomodan, no obligan",
    texto:
      "La hora de cada comida se propone alrededor de tu entrenamiento. Si tu día se mueve, muévelas: importa más completar el día que respetar el reloj.",
  },
  {
    titulo: "Las equivalencias son para usarse",
    texto:
      "Cada intercambio ya está calculado para caer dentro del 10 % del macro que reemplaza. Cambiar por lo que sí tienes en casa es mejor que saltarte la comida.",
  },
] as const;
