/**
 * El catálogo de paneles del Resumen — lógica PURA.
 *
 * El Resumen es una lista de paneles que cada quien acomoda. Dos cosas son
 * configurables y ninguna más: **si se ve y en qué orden**, y **de qué tamaño**.
 *
 * Los tamaños son tres, y cada uno es una tarjeta distinta —no la misma
 * estirada—:
 *
 * - `mini`: dos por renglón, cuadrada. Un dato y su estado. Es para el rubro
 *   que se mira de reojo y no se abre.
 * - `compacta`: una por renglón, baja. El dato grande a la derecha y una línea
 *   de contexto. Cabe más texto que en la mini sin comerse la pantalla.
 * - `completa`: una por renglón, alta. Todo lo que el panel sabe: su gráfica,
 *   su lista, su desglose.
 *
 * La primera versión tenía dos ejes —ancho y "cuánto detalle"— y se pisaban:
 * varias combinaciones daban exactamente la misma tarjeta, y elegir entre
 * ellas era elegir entre nada. Un solo eje con tres tamaños bien distintos se
 * entiende sin explicación.
 *
 * Lo que NO es configurable: qué significa cada panel ni de dónde sale su
 * número. Un tablero donde cada quien redefine la métrica deja de comparar.
 *
 * El catálogo vive aquí y no en el servidor porque cambia con cada versión de
 * la app. El servidor guarda el acomodo tal cual y no opina; esta capa ignora
 * los ids que ya no existen —una app vieja que guardó `records` y una nueva
 * que lo quitó tienen que convivir sin romperse.
 */

export const TAMANOS = ["mini", "compacta", "completa"] as const;
export type Tamano = (typeof TAMANOS)[number];

/**
 * Qué se dibuja dentro de la tarjeta.
 *
 * El tamaño dice cuánto espacio ocupa; la vista dice qué se pinta ahí. Son
 * ejes distintos y por eso ya no se pisan: un panel `compacta` puede enseñar
 * su número contra la meta o su tendencia, y las dos cosas caben igual.
 *
 * - `dato`: el número y nada más.
 * - `meta`: el número contra su referencia — la meta del mes, la meta diaria,
 *   lo esperado a estas alturas.
 * - `tendencia`: el número con su serie. Chispa en mini y compacta, gráfica
 *   completa en grande.
 * - `desglose`: el número con sus partes — los días de la semana, los macros,
 *   los valores del estudio.
 *
 * Cada panel declara solo las que sabe pintar: ofrecer una vista que no cambia
 * nada fue exactamente el defecto del modelo anterior.
 */
export const VISTAS = ["dato", "meta", "tendencia", "desglose"] as const;
export type Vista = (typeof VISTAS)[number];

export type PanelConfig = { id: string; tamano: Tamano; vista: Vista };

export type PanelDef = {
  id: string;
  /** Cómo se llama en el editor. En la tarjeta puede decir otra cosa. */
  nombre: string;
  /** Qué pregunta contesta. Es lo que se lee al elegirlo. */
  pregunta: string;
  /** Familia, para agrupar el editor. */
  grupo: "Cuerpo" | "Entrenamiento" | "Nutrición" | "Salud" | "Gráficas";
  /**
   * Tamaños que este panel sabe pintar de verdad.
   *
   * Un panel solo declara un tamaño si en ese tamaño enseña algo distinto. Los
   * de gráfica no tienen `mini`: una telaraña de 150 pt es adorno, no dato.
   */
  tamanos: Tamano[];
  /** Las vistas que este panel sabe pintar, en el orden en que se ofrecen. */
  vistas: Vista[];
  /**
   * Cómo se llama cada vista EN ESTE panel, cuando la etiqueta genérica no
   * dice nada útil. "Desglose" en la semana es "día por día"; en el plan es
   * "con tus macros".
   */
  etiquetasVista?: Partial<Record<Vista, string>>;
  /** El acomodo de fábrica; `null` = no entra en el tablero inicial. */
  porDefecto: { orden: number; tamano: Tamano; vista: Vista } | null;
};

/**
 * Los paneles que la app sabe pintar.
 *
 * El orden de fábrica sale de la regla de siempre: primero el cuerpo, después
 * lo que hiciste, al final el contexto. La racha va abajo porque es constancia
 * y no progreso — la lección que ya había costado una iteración.
 */
export const PANELES: PanelDef[] = [
  {
    id: "anillos",
    nombre: "Anillos del día",
    pregunta: "¿Cómo voy hoy en pasos, ejercicio y sueño?",
    grupo: "Salud",
    tamanos: ["compacta", "completa"],
    vistas: ["dato", "meta", "desglose"],
    etiquetasVista: {
      dato: "Los tres números del día",
      meta: "Anillos contra su meta",
      desglose: "Anillos, metas y recuperación",
    },
    porDefecto: { orden: 0, tamano: "completa", vista: "desglose" },
  },
  {
    id: "perfil",
    nombre: "Tu semana vs. lo esperado",
    pregunta: "¿Qué frente está hundido respecto de los demás?",
    grupo: "Gráficas",
    tamanos: ["compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Solo el frente más atrasado",
      desglose: "La telaraña con todos los ejes",
    },
    porDefecto: { orden: 1, tamano: "completa", vista: "desglose" },
  },
  {
    id: "mes",
    nombre: "Tu mes",
    pregunta: "¿Voy al ritmo del escalón de este mes?",
    grupo: "Gráficas",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "desglose"],
    etiquetasVista: {
      dato: "Cuántas metas llevas",
      meta: "Las dos que más faltan",
      desglose: "Todas tus medidas del mes",
    },
    porDefecto: { orden: 2, tamano: "completa", vista: "desglose" },
  },
  {
    id: "brecha_objetivo",
    nombre: "Vs. tu objetivo",
    pregunta: "¿Qué tan lejos está cada zona de mi referencia?",
    grupo: "Gráficas",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Solo la zona más lejana",
      desglose: "Todas las zonas",
    },
    porDefecto: { orden: 3, tamano: "compacta", vista: "desglose" },
  },
  {
    id: "cintura",
    nombre: "Cintura",
    pregunta: "¿Está bajando la medida que más dice?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "tendencia"],
    etiquetasVista: {
      dato: "Solo la medida de hoy",
      meta: "Contra tu meta del mes",
      tendencia: "Con su historial",
    },
    porDefecto: { orden: 4, tamano: "mini", vista: "meta" },
  },
  {
    id: "checkin",
    nombre: "Check-in",
    pregunta: "¿Cuándo cerré mi última semana?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta"],
    etiquetasVista: {
      dato: "Días desde el último",
      meta: "Con tu día de cierre",
    },
    porDefecto: { orden: 5, tamano: "mini", vista: "dato" },
  },
  {
    id: "semana",
    nombre: "Esta semana",
    pregunta: "¿Cuántas sesiones llevo de las que tocan?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "desglose"],
    etiquetasVista: {
      dato: "Sesiones cerradas",
      meta: "Con la que sigue",
      desglose: "Día por día",
    },
    porDefecto: { orden: 6, tamano: "compacta", vista: "meta" },
  },
  {
    id: "disciplinas",
    nombre: "Tus disciplinas",
    pregunta: "¿Cómo se reparte mi semana entre gimnasio y lo demás?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Total de sesiones",
      desglose: "Cuántas de cada disciplina",
    },
    porDefecto: { orden: 7, tamano: "mini", vista: "dato" },
  },
  {
    id: "avance_disciplinas",
    nombre: "Avance por disciplina",
    pregunta: "¿Cómo voy en cada disciplina que entreno?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Solo tu disciplina principal",
      desglose: "Cada disciplina con su tendencia",
    },
    porDefecto: null,
  },
  {
    id: "cumplimiento",
    nombre: "Cumplimiento",
    pregunta: "¿Estoy haciendo lo que dice mi plan, de rutina y de dieta?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Solo el de rutina",
      desglose: "Rutina y dieta por separado",
    },
    porDefecto: { orden: 8, tamano: "compacta", vista: "desglose" },
  },
  {
    id: "racha",
    nombre: "Racha",
    pregunta: "¿Cuántos días llevo sin fallar?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta"],
    vistas: ["dato", "meta"],
    etiquetasVista: {
      dato: "Días seguidos",
      meta: "Contra tu mejor racha",
    },
    porDefecto: { orden: 9, tamano: "mini", vista: "meta" },
  },
  {
    id: "estudios",
    nombre: "Tus estudios",
    pregunta: "¿Qué dijo mi último laboratorio?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Cuándo fue el último",
      desglose: "Con sus valores",
    },
    porDefecto: { orden: 10, tamano: "mini", vista: "dato" },
  },
  {
    id: "plan",
    nombre: "Tu plan",
    pregunta: "¿Con cuántas calorías y en qué fase estoy?",
    grupo: "Nutrición",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: {
      dato: "Solo las calorías",
      desglose: "Con tus macros",
    },
    porDefecto: { orden: 11, tamano: "compacta", vista: "desglose" },
  },
  {
    id: "objetivo",
    nombre: "Objetivo",
    pregunta: "¿Ya tengo referencia cargada y analizada?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta"],
    vistas: ["dato"],
    porDefecto: { orden: 12, tamano: "mini", vista: "dato" },
  },
  {
    id: "records",
    nombre: "Récords",
    pregunta: "¿Cuál es mi mejor marca y de cuándo?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "desglose"],
    etiquetasVista: { dato: "Cuántos llevas", desglose: "Tus cinco mejores" },
    porDefecto: null,
  },
  {
    id: "peso",
    nombre: "Peso",
    pregunta: "¿Hacia dónde va la báscula?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "tendencia"],
    etiquetasVista: { dato: "Solo el peso de hoy", tendencia: "Con su historial" },
    porDefecto: null,
  },
  {
    id: "pasos",
    nombre: "Pasos",
    pregunta: "¿Me estoy moviendo fuera del gimnasio?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "tendencia"],
    etiquetasVista: {
      dato: "Los pasos de hoy",
      meta: "Contra tu meta diaria",
      tendencia: "Con tus últimos días",
    },
    porDefecto: null,
  },
  {
    id: "sueno",
    nombre: "Sueño",
    pregunta: "¿Estoy durmiendo lo que pide mi entrenamiento?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "tendencia"],
    etiquetasVista: {
      dato: "Lo de anoche",
      meta: "Contra tu meta",
      tendencia: "Con tus últimas noches",
    },
    porDefecto: null,
  },
  {
    id: "recuperacion",
    nombre: "Recuperación",
    pregunta: "¿Mi variabilidad anda en mi propia normal?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "meta", "tendencia"],
    etiquetasVista: {
      dato: "El valor de hoy",
      meta: "Contra tu normal de 4 semanas",
      tendencia: "Con su historial",
    },
    porDefecto: null,
  },
  {
    id: "condicion",
    nombre: "Condición",
    pregunta: "¿Está subiendo mi VO₂ máx?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    vistas: ["dato", "tendencia"],
    etiquetasVista: { dato: "El valor de hoy", tendencia: "Con su historial" },
    porDefecto: null,
  },
];

const PANEL_POR_ID = new Map(PANELES.map((panel) => [panel.id, panel]));

export function definicionDe(id: string): PanelDef | null {
  return PANEL_POR_ID.get(id) ?? null;
}

/** El tablero de fábrica. */
export function layoutPorDefecto(): PanelConfig[] {
  return PANELES.filter((panel) => panel.porDefecto !== null)
    .sort((a, b) => a.porDefecto!.orden - b.porDefecto!.orden)
    .map((panel) => ({
      id: panel.id,
      tamano: panel.porDefecto!.tamano,
      vista: panel.porDefecto!.vista,
    }));
}

/**
 * Las vistas que tienen sentido en ese tamaño.
 *
 * En el cuadro chico no cabe un desglose —una lista de cinco renglones en
 * media pantalla es texto ilegible—, así que ahí no se ofrece. Ofrecer una
 * opción que se degrada sola es peor que no ofrecerla: la persona la elige,
 * no ve el cambio, y deja de confiar en el editor.
 */
export function vistasPara(def: PanelDef, tamano: Tamano): Vista[] {
  if (tamano !== "mini") return def.vistas;
  return def.vistas.filter((vista) => vista !== "desglose");
}

/** Cómo se llama una vista en un panel concreto. */
export function etiquetaDeVista(def: PanelDef, vista: Vista): string {
  return def.etiquetasVista?.[vista] ?? ETIQUETA_VISTA[vista];
}

/**
 * Traduce un acomodo del modelo viejo (ancho + variante) al de tamaño + vista.
 *
 * Existe porque el acomodo se guarda en la cuenta: quien ya había armado su
 * tablero no tiene por qué perderlo cuando el modelo cambia.
 */
function desdeModeloViejo(entrada: Record<string, unknown>): { tamano: Tamano; vista: Vista } | null {
  const ancho = entrada.ancho;
  const variante = entrada.variante;
  if (typeof ancho !== "string") return null;

  const tamano: Tamano = ancho === "medio" ? "mini" : variante === "detallado" ? "completa" : "compacta";
  const vista: Vista =
    variante === "detallado" ? "desglose" : variante === "compacto" ? "dato" : "meta";

  return { tamano, vista };
}

/**
 * Limpia lo que venga guardado: fuera los ids desconocidos, fuera los
 * repetidos, y cada tamaño y vista acotados a lo que ese panel sabe pintar.
 */
export function sanearLayout(raw: unknown): PanelConfig[] {
  if (!Array.isArray(raw)) return layoutPorDefecto();

  const vistos = new Set<string>();
  const limpio: PanelConfig[] = [];

  for (const entrada of raw) {
    if (entrada === null || typeof entrada !== "object") continue;
    const registro = entrada as Record<string, unknown>;
    const id = registro.id;
    if (typeof id !== "string") continue;

    const def = PANEL_POR_ID.get(id);
    if (!def || vistos.has(id)) continue;
    vistos.add(id);

    const viejo = typeof registro.tamano === "string" ? null : desdeModeloViejo(registro);

    const tamanoPedido =
      typeof registro.tamano === "string" ? (registro.tamano as Tamano) : viejo?.tamano;
    const tamano =
      tamanoPedido && def.tamanos.includes(tamanoPedido)
        ? tamanoPedido
        : (def.porDefecto?.tamano ?? def.tamanos[0]!);

    const vistaPedida =
      typeof registro.vista === "string" ? (registro.vista as Vista) : viejo?.vista;
    const disponibles = vistasPara(def, tamano);
    const vista =
      vistaPedida && disponibles.includes(vistaPedida)
        ? vistaPedida
        : (disponibles.includes(def.porDefecto?.vista as Vista)
            ? def.porDefecto!.vista
            : disponibles[0]!);

    limpio.push({ id, tamano, vista });
  }

  // Un acomodo vacío no es una elección: es un tablero que se quedó sin nada
  // que enseñar, y lo útil ahí es volver al de fábrica.
  return limpio.length > 0 ? limpio : layoutPorDefecto();
}

/** Los paneles que hoy no están en el tablero, para el editor. */
export function panelesDisponibles(layout: PanelConfig[]): PanelDef[] {
  const puestos = new Set(layout.map((panel) => panel.id));
  return PANELES.filter((panel) => !puestos.has(panel.id));
}

/**
 * Cambia el tamaño de un panel, ajustando la vista si deja de caber.
 *
 * Bajar a mini con la vista en "desglose" tenía que resolverse en algún lado;
 * resolverlo aquí evita que la pantalla tenga que adivinar qué pintar.
 */
export function conTamano(layout: PanelConfig[], id: string, tamano: Tamano): PanelConfig[] {
  return layout.map((panel) => {
    const def = definicionDe(panel.id);
    if (panel.id !== id || !def) return panel;

    const disponibles = vistasPara(def, tamano);
    const vista = disponibles.includes(panel.vista) ? panel.vista : disponibles[0]!;
    return { ...panel, tamano, vista };
  });
}

/**
 * Lleva un panel a una posición concreta. Es lo que necesita el arrastre: el
 * gesto no sabe de "uno arriba", sabe de "aquí".
 */
export function moverA(layout: PanelConfig[], id: string, destino: number): PanelConfig[] {
  const index = layout.findIndex((panel) => panel.id === id);
  if (index < 0) return layout;

  const limite = Math.max(0, Math.min(layout.length - 1, destino));
  if (limite === index) return layout;

  const copia = [...layout];
  const [panel] = copia.splice(index, 1);
  copia.splice(limite, 0, panel!);
  return copia;
}

/** Mueve un panel una posición. */
export function mover(layout: PanelConfig[], id: string, direccion: -1 | 1): PanelConfig[] {
  const index = layout.findIndex((panel) => panel.id === id);
  return moverA(layout, id, index + direccion);
}

/** Cómo se llama cada tamaño en el editor. */
export const ETIQUETA_TAMANO: Record<Tamano, string> = {
  mini: "Mini · 2 por renglón",
  compacta: "Compacta · 1 por renglón",
  completa: "Completa · todo el detalle",
};

/** Qué enseña cada tamaño, en una línea. */
export const DESCRIPCION_TAMANO: Record<Tamano, string> = {
  mini: "Un dato y su estado, en un cuadro.",
  compacta: "El dato con su contexto, en un renglón bajo.",
  completa: "Todo lo que este panel sabe: su gráfica o su desglose.",
};

/** El nombre genérico de cada vista, cuando el panel no da uno propio. */
export const ETIQUETA_VISTA: Record<Vista, string> = {
  dato: "Solo el número",
  meta: "Número y contexto",
  tendencia: "Con su tendencia",
  desglose: "Con su desglose",
};
