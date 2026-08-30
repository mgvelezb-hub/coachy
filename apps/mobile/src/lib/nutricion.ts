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

/**
 * Los estilos de dieta, con lo que cambia cada uno.
 *
 * Se elige explícitamente. Una IA que decide sola tu filosofía nutricional
 * sin que sepas cuál es la caja negra que este diseño evita a propósito: el
 * motor es determinista y la IA solo redacta.
 */
export const ESTILOS_DIETA = [
  {
    valor: "ESTANDAR" as const,
    nombre: "Estándar por equivalencias",
    detalle:
      "El método del coach: proteína alta, carbohidratos alrededor del entrenamiento y equivalencias por alimento. Es el único con 19 semanas de decisiones reales detrás.",
  },
  {
    valor: "AYUNO" as const,
    nombre: "Ayuno intermitente",
    detalle:
      "Las mismas comidas y los mismos gramos, comprimidos en tu ventana. Mueve horarios, no números.",
  },
  {
    valor: "VEGETARIANA" as const,
    nombre: "Vegetariana",
    detalle:
      "Sin carne, pollo ni pescado; huevo y lácteos se quedan. Cambia el catálogo, no la fórmula.",
  },
  {
    valor: "KETO" as const,
    nombre: "Keto",
    detalle:
      "El carbohidrato baja a un tope y las calorías que sobran se van a grasa. La proteína no se mueve.",
  },
];

/** Ventanas de alimentación de uso común para el ayuno. */
export const VENTANAS_AYUNO = [
  { inicio: 12, fin: 20, nombre: "16/8 · 12–20 h" },
  { inicio: 13, fin: 21, nombre: "16/8 · 13–21 h" },
  { inicio: 10, fin: 18, nombre: "16/8 · 10–18 h" },
  { inicio: 14, fin: 20, nombre: "18/6 · 14–20 h" },
];

/**
 * El aviso que va con el estilo elegido, cuando hay algo que advertir.
 *
 * Son advertencias de coherencia, no clínicas: la app dice cuándo tu propia
 * configuración se pelea consigo misma, y ahí se detiene.
 */
export function avisoDeDieta(
  estilo: string,
  opciones: { entrenaTemprano: boolean; inicioVentana: number | null },
): string | null {
  if (estilo === "AYUNO" && opciones.entrenaTemprano && (opciones.inicioVentana ?? 12) > 9) {
    return "Entrenas en la mañana y tu ventana abre después: vas a entrenar en ayuno y a comer el post-entreno horas más tarde. Si te cuesta, mueve la ventana o el entrenamiento.";
  }
  if (estilo === "KETO") {
    return "En keto los días altos en carbohidrato de la fase de recarga no aplican: esas calorías se quedan en grasa. Si tu fase cambia, el plan lo dirá.";
  }
  return null;
}

/**
 * Los suplementos que la app sabe incluir en el plan.
 *
 * La lista es corta a propósito: son los tres que cambian algo con evidencia
 * razonable y que además se consiguen. Un catálogo largo de suplementos deja
 * de ser un plan y se vuelve una tienda.
 *
 * Se pregunta qué TIENES, no qué deberías comprar: si no lo marcas, no
 * aparece — ni como sugerencia ni como carencia.
 */
export const SUPLEMENTOS: Array<{
  valor: "WHEY" | "CREATINA" | "OMEGA3";
  nombre: string;
  detalle: string;
}> = [
  {
    valor: "WHEY",
    nombre: "Proteína en polvo",
    detalle: "Entra al menú como un alimento más cuando llegar a tu proteína con comida cuesta.",
  },
  {
    valor: "CREATINA",
    nombre: "Creatina monohidratada",
    detalle: "5 g al día, a cualquier hora. Funciona por acumulación, no por el momento.",
  },
  {
    valor: "OMEGA3",
    nombre: "Omega-3 (aceite de pescado)",
    detalle: "Con una comida que tenga grasa: en ayunas se aprovecha menos y suele repetir.",
  },
];
