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

export type PanelConfig = { id: string; tamano: Tamano };

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
  /** El acomodo de fábrica; `null` = no entra en el tablero inicial. */
  porDefecto: { orden: number; tamano: Tamano } | null;
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
    porDefecto: { orden: 0, tamano: "completa" },
  },
  {
    id: "perfil",
    nombre: "Tu semana vs. lo esperado",
    pregunta: "¿Qué frente está hundido respecto de los demás?",
    grupo: "Gráficas",
    tamanos: ["compacta", "completa"],
    porDefecto: { orden: 1, tamano: "completa" },
  },
  {
    id: "mes",
    nombre: "Tu mes",
    pregunta: "¿Voy al ritmo del escalón de este mes?",
    grupo: "Gráficas",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 2, tamano: "completa" },
  },
  {
    id: "brecha_objetivo",
    nombre: "Vs. tu objetivo",
    pregunta: "¿Qué tan lejos está cada zona de mi referencia?",
    grupo: "Gráficas",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 3, tamano: "compacta" },
  },
  {
    id: "cintura",
    nombre: "Cintura",
    pregunta: "¿Está bajando la medida que más dice?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 4, tamano: "mini" },
  },
  {
    id: "checkin",
    nombre: "Check-in",
    pregunta: "¿Cuándo cerré mi última semana?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 5, tamano: "mini" },
  },
  {
    id: "semana",
    nombre: "Esta semana",
    pregunta: "¿Cuántas sesiones llevo de las que tocan?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 6, tamano: "compacta" },
  },
  {
    id: "disciplinas",
    nombre: "Tus disciplinas",
    pregunta: "¿Cómo se reparte mi semana entre gimnasio y lo demás?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 7, tamano: "mini" },
  },
  {
    id: "cumplimiento",
    nombre: "Cumplimiento",
    pregunta: "¿Estoy haciendo lo que dice mi plan, de rutina y de dieta?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 8, tamano: "compacta" },
  },
  {
    id: "racha",
    nombre: "Racha",
    pregunta: "¿Cuántos días llevo sin fallar?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta"],
    porDefecto: { orden: 9, tamano: "mini" },
  },
  {
    id: "estudios",
    nombre: "Tus estudios",
    pregunta: "¿Qué dijo mi último laboratorio?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 10, tamano: "mini" },
  },
  {
    id: "plan",
    nombre: "Tu plan",
    pregunta: "¿Con cuántas calorías y en qué fase estoy?",
    grupo: "Nutrición",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: { orden: 11, tamano: "compacta" },
  },
  {
    id: "objetivo",
    nombre: "Objetivo",
    pregunta: "¿Ya tengo referencia cargada y analizada?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta"],
    porDefecto: { orden: 12, tamano: "mini" },
  },
  {
    id: "records",
    nombre: "Récords",
    pregunta: "¿Cuál es mi mejor marca y de cuándo?",
    grupo: "Entrenamiento",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: null,
  },
  {
    id: "peso",
    nombre: "Peso",
    pregunta: "¿Hacia dónde va la báscula?",
    grupo: "Cuerpo",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: null,
  },
  {
    id: "pasos",
    nombre: "Pasos",
    pregunta: "¿Me estoy moviendo fuera del gimnasio?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: null,
  },
  {
    id: "sueno",
    nombre: "Sueño",
    pregunta: "¿Estoy durmiendo lo que pide mi entrenamiento?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: null,
  },
  {
    id: "recuperacion",
    nombre: "Recuperación",
    pregunta: "¿Mi variabilidad anda en mi propia normal?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
    porDefecto: null,
  },
  {
    id: "condicion",
    nombre: "Condición",
    pregunta: "¿Está subiendo mi VO₂ máx?",
    grupo: "Salud",
    tamanos: ["mini", "compacta", "completa"],
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
    .map((panel) => ({ id: panel.id, tamano: panel.porDefecto!.tamano }));
}

/**
 * Traduce un acomodo del modelo viejo (ancho + variante) al de tamaños.
 *
 * Existe porque el acomodo se guarda en la cuenta: quien ya había armado su
 * tablero no tiene por qué perderlo cuando el modelo cambia. El mapeo es el
 * que conserva la intención —lo que estaba a media pantalla era "chico", lo
 * ancho con detalle era "todo"— y lo demás cae en `compacta`.
 */
function tamanoDesdeModeloViejo(entrada: Record<string, unknown>): Tamano | null {
  const ancho = entrada.ancho;
  const variante = entrada.variante;
  if (typeof ancho !== "string") return null;

  if (ancho === "medio") return "mini";
  return variante === "detallado" ? "completa" : "compacta";
}

/**
 * Limpia lo que venga guardado: fuera los ids desconocidos, fuera los
 * repetidos, y cada tamaño acotado a los que ese panel sabe pintar.
 *
 * Sin esto, un acomodo guardado por una versión anterior puede pedir un panel
 * que ya no existe o un tamaño que ese panel nunca soportó, y la pantalla se
 * rompe justo donde el usuario había puesto su trabajo.
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

    const declarado =
      typeof registro.tamano === "string" ? (registro.tamano as Tamano) : tamanoDesdeModeloViejo(registro);

    const tamano =
      declarado !== null && def.tamanos.includes(declarado)
        ? declarado
        : (def.porDefecto?.tamano ?? def.tamanos[0]!);

    limpio.push({ id, tamano });
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
