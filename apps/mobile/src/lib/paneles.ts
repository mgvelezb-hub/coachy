/**
 * El catálogo de paneles del Resumen — lógica PURA.
 *
 * El Resumen dejó de ser una pantalla fija: es una lista de paneles que cada
 * quien acomoda. Tres cosas son configurables por panel y ninguna más:
 *
 * - **si se ve** (agregar / quitar),
 * - **en qué orden**,
 * - **con cuánto detalle** (`compacto`, `normal`, `detallado`) y **de qué
 *   ancho** (`medio` = media pantalla, `ancho` = todo el renglón).
 *
 * Lo que NO es configurable: qué significa cada panel ni de dónde sale su
 * número. Un tablero donde cada quien redefine la métrica deja de comparar.
 *
 * El catálogo vive aquí y no en el servidor porque cambia con cada versión de
 * la app. El servidor guarda el acomodo tal cual y no opina; esta capa ignora
 * los ids que ya no existen —una app vieja que guardó `records` y una nueva
 * que lo quitó tienen que convivir sin romperse.
 */

export const VARIANTES = ["compacto", "normal", "detallado"] as const;
export type Variante = (typeof VARIANTES)[number];

export const ANCHOS = ["medio", "ancho"] as const;
export type Ancho = (typeof ANCHOS)[number];

export type PanelConfig = { id: string; variante: Variante; ancho: Ancho };

export type PanelDef = {
  id: string;
  /** Cómo se llama en el editor. En la tarjeta puede decir otra cosa. */
  nombre: string;
  /** Qué pregunta contesta. Es lo que se lee al elegirlo. */
  pregunta: string;
  /** Familia, para agrupar el editor. */
  grupo: "Cuerpo" | "Entrenamiento" | "Nutrición" | "Salud" | "Gráficas";
  /** Variantes que este panel sabe pintar. */
  variantes: Variante[];
  anchos: Ancho[];
  /** El acomodo de fábrica; `null` = no entra en el tablero inicial. */
  porDefecto: { orden: number; variante: Variante; ancho: Ancho } | null;
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
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["ancho"],
    porDefecto: { orden: 0, variante: "normal", ancho: "ancho" },
  },
  {
    id: "perfil",
    nombre: "Tu perfil",
    pregunta: "¿Qué eje está hundido respecto de los demás?",
    grupo: "Gráficas",
    variantes: ["normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 1, variante: "detallado", ancho: "medio" },
  },
  {
    id: "mes",
    nombre: "Tu mes",
    pregunta: "¿Voy al ritmo del escalón de este mes?",
    grupo: "Gráficas",
    variantes: ["normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 2, variante: "detallado", ancho: "medio" },
  },
  {
    id: "brecha_objetivo",
    nombre: "Vs. tu objetivo",
    pregunta: "¿Qué tan lejos está cada zona de mi referencia?",
    grupo: "Gráficas",
    variantes: ["normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 3, variante: "normal", ancho: "medio" },
  },
  {
    id: "cintura",
    nombre: "Cintura",
    pregunta: "¿Está bajando la medida que más dice?",
    grupo: "Cuerpo",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 4, variante: "normal", ancho: "medio" },
  },
  {
    id: "checkin",
    nombre: "Check-in",
    pregunta: "¿Cuándo cerré mi última semana?",
    grupo: "Cuerpo",
    variantes: ["compacto", "normal"],
    anchos: ["medio"],
    porDefecto: { orden: 5, variante: "normal", ancho: "medio" },
  },
  {
    id: "semana",
    nombre: "Esta semana",
    pregunta: "¿Cuántas sesiones llevo de las que tocan?",
    grupo: "Entrenamiento",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 6, variante: "normal", ancho: "medio" },
  },
  {
    id: "disciplinas",
    nombre: "Tus disciplinas",
    pregunta: "¿Cómo se reparte mi semana entre gimnasio y lo demás?",
    grupo: "Entrenamiento",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 7, variante: "normal", ancho: "medio" },
  },
  {
    id: "cumplimiento",
    nombre: "Cumplimiento",
    pregunta: "¿Estoy haciendo lo que dice mi plan, de rutina y de dieta?",
    grupo: "Entrenamiento",
    variantes: ["compacto", "normal"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 8, variante: "normal", ancho: "medio" },
  },
  {
    id: "racha",
    nombre: "Racha",
    pregunta: "¿Cuántos días llevo sin fallar?",
    grupo: "Entrenamiento",
    variantes: ["compacto", "normal"],
    anchos: ["medio"],
    porDefecto: { orden: 9, variante: "normal", ancho: "medio" },
  },
  {
    id: "estudios",
    nombre: "Tus estudios",
    pregunta: "¿Qué dijo mi último laboratorio?",
    grupo: "Salud",
    variantes: ["compacto", "normal"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 10, variante: "normal", ancho: "medio" },
  },
  {
    id: "plan",
    nombre: "Tu plan",
    pregunta: "¿Con cuántas calorías y en qué fase estoy?",
    grupo: "Nutrición",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: { orden: 11, variante: "normal", ancho: "medio" },
  },
  {
    id: "objetivo",
    nombre: "Objetivo",
    pregunta: "¿Ya tengo referencia cargada y analizada?",
    grupo: "Cuerpo",
    variantes: ["compacto", "normal"],
    anchos: ["medio"],
    porDefecto: { orden: 12, variante: "normal", ancho: "medio" },
  },
  {
    id: "records",
    nombre: "Récords",
    pregunta: "¿Cuál es mi mejor marca y de cuándo?",
    grupo: "Entrenamiento",
    variantes: ["compacto", "normal"],
    anchos: ["medio"],
    porDefecto: null,
  },
  {
    id: "peso",
    nombre: "Peso",
    pregunta: "¿Hacia dónde va la báscula?",
    grupo: "Cuerpo",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: null,
  },
  {
    id: "pasos",
    nombre: "Pasos",
    pregunta: "¿Me estoy moviendo fuera del gimnasio?",
    grupo: "Salud",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: null,
  },
  {
    id: "sueno",
    nombre: "Sueño",
    pregunta: "¿Estoy durmiendo lo que pide mi entrenamiento?",
    grupo: "Salud",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: null,
  },
  {
    id: "recuperacion",
    nombre: "Recuperación",
    pregunta: "¿Mi variabilidad anda en mi propia normal?",
    grupo: "Salud",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: null,
  },
  {
    id: "condicion",
    nombre: "Condición",
    pregunta: "¿Está subiendo mi VO₂ máx?",
    grupo: "Salud",
    variantes: ["compacto", "normal", "detallado"],
    anchos: ["medio", "ancho"],
    porDefecto: null,
  },
];

const PANEL_POR_ID = new Map(PANELES.map((panel) => [panel.id, panel]));

export function definicionDe(id: string): PanelDef | null {
  return PANEL_POR_ID.get(id) ?? null;
}

/** El tablero de fábrica: el mismo Resumen que existía antes de poder editarlo. */
export function layoutPorDefecto(): PanelConfig[] {
  return PANELES.filter((panel) => panel.porDefecto !== null)
    .sort((a, b) => a.porDefecto!.orden - b.porDefecto!.orden)
    .map((panel) => ({
      id: panel.id,
      variante: panel.porDefecto!.variante,
      ancho: panel.porDefecto!.ancho,
    }));
}

/**
 * Limpia lo que venga guardado: fuera los ids desconocidos, fuera los
 * repetidos, y cada variante y ancho acotados a lo que ese panel sabe pintar.
 *
 * Sin esto, un acomodo guardado por una versión anterior puede pedir un panel
 * que ya no existe o un ancho que ese panel nunca soportó, y la pantalla se
 * rompe justo donde el usuario había puesto su trabajo.
 */
export function sanearLayout(raw: unknown): PanelConfig[] {
  if (!Array.isArray(raw)) return layoutPorDefecto();

  const vistos = new Set<string>();
  const limpio: PanelConfig[] = [];

  for (const entrada of raw) {
    if (entrada === null || typeof entrada !== "object") continue;
    const { id, variante, ancho } = entrada as Record<string, unknown>;
    if (typeof id !== "string") continue;

    const def = PANEL_POR_ID.get(id);
    if (!def || vistos.has(id)) continue;
    vistos.add(id);

    const varianteOk =
      typeof variante === "string" && def.variantes.includes(variante as Variante)
        ? (variante as Variante)
        : def.variantes[0]!;
    const anchoOk =
      typeof ancho === "string" && def.anchos.includes(ancho as Ancho)
        ? (ancho as Ancho)
        : def.anchos[0]!;

    limpio.push({ id, variante: varianteOk, ancho: anchoOk });
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

/** Mueve un panel una posición. Devuelve una lista nueva. */
export function mover(layout: PanelConfig[], id: string, direccion: -1 | 1): PanelConfig[] {
  const index = layout.findIndex((panel) => panel.id === id);
  return moverA(layout, id, index + direccion);
}

/**
 * Lleva un panel a una posición concreta. Es lo que necesita el arrastre:
 * el gesto no sabe de "uno arriba", sabe de "aquí".
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

/** La siguiente variante del ciclo, dentro de las que ese panel soporta. */
export function siguienteVariante(def: PanelDef, actual: Variante): Variante {
  const index = def.variantes.indexOf(actual);
  return def.variantes[(index + 1) % def.variantes.length]!;
}

/** El otro ancho, si el panel soporta los dos. */
export function alternarAncho(def: PanelDef, actual: Ancho): Ancho {
  if (def.anchos.length < 2) return actual;
  return actual === "medio" ? "ancho" : "medio";
}

export const ETIQUETA_VARIANTE: Record<Variante, string> = {
  compacto: "Solo el número",
  normal: "Número y contexto",
  detallado: "Con su tendencia",
};

/**
 * Qué se va a ver con cada variante, en una línea.
 *
 * Existe para no tener que salir del editor, mirar el tablero y volver a
 * entrar por cada opción: la muestra dice de antemano qué cambia.
 */
export const MUESTRA_VARIANTE: Record<Variante, string> = {
  compacto: "94.6 cm",
  normal: "94.6 cm · 5 check-ins · 22 de agosto",
  detallado: "94.6 cm · 5 check-ins · 22 de agosto · ▁▂▃▅▄▆",
};

export const ETIQUETA_ANCHO: Record<Ancho, string> = {
  medio: "Media pantalla",
  ancho: "Todo el ancho",
};
