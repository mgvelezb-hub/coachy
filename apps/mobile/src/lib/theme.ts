/**
 * Tokens del brand kit "Holy Gains". Única fuente de verdad de colores,
 * spacing, radios y tipografías — nada de valores mágicos sueltos en pantallas.
 *
 * ---------------------------------------------------------------------------
 * Temas
 * ---------------------------------------------------------------------------
 * Hay 3 paletas (`paletteDark`, `paletteLight`, `paletteChampan`) más la
 * preferencia "sistema" (sigue claro/oscuro de iOS), resueltas por
 * `src/context/theme.tsx`. Las 3 comparten EXACTAMENTE las mismas llaves:
 * son ROLES, no colores literales. Por ejemplo `obsidiana` es el rol "fondo
 * de pantalla" — en el tema oscuro (el original) sí es obsidiana de verdad,
 * pero en el claro es pergamino y en Champán es negro casi puro. Lo mismo
 * pasa con `marfil` (rol "texto principal") o `guinda` (rol "acento
 * primario / CTA"): el nombre se queda, el valor cambia por tema.
 *
 * El único rol sin equivalente directo en el kit original es `pergamino`:
 * hoy no se usaba en ninguna pantalla (solo vivía declarado aquí), así que
 * se reutiliza como el rol "texto/ícono que va ENCIMA de un fondo de acento"
 * (botones CTA, checks marcados, chips seleccionados). Es necesario porque
 * `marfil` cambia de claro→oscuro entre temas (texto principal), pero el
 * texto que va sobre `guinda`/`champan` siempre necesita ser el opuesto del
 * fondo de la pantalla, no el del texto normal — en el tema oscuro ambos
 * coinciden por accidente (texto principal ya es claro), pero en Claro y
 * Champán no. `pergamino` es ese texto-sobre-acento en los 3 temas.
 *
 * Los valores de Claro y Champán se derivaron 1:1 de los oklch() de
 * `apps/web/src/app/globals.css` (`:root` y `.executive` respectivamente),
 * convertidos a hex sRGB con la fórmula estándar de OKLab (Björn Ottosson).
 * Champán es el mismo tema que la web llama ".executive" — en la app SIEMPRE
 * se le dice "Champán", nunca "Ejecutivo".
 */

export type Palette = {
  guinda: string;
  guindaDark: string;
  guindaLight: string;
  paloRosa: string;
  paloRosaLight: string;
  marfil: string;
  /** Rol: texto/ícono sobre un fondo de acento (guinda/champán). Ver nota arriba. */
  pergamino: string;
  /**
   * Rol: texto SECUNDARIO sobre un fondo de acento (la meta en itálica de la
   * tarjeta de decisión). No puede ser `champan`: en el tema Champán el acento
   * ya ES champán y el texto desaparecería sobre sí mismo.
   */
  pergaminoSoft: string;
  /** Rol: fondo de pantalla. */
  obsidiana: string;
  champan: string;
  champanSoft: string;
  error: string;
  cardBg: string;
  cardBorder: string;
};

/** Oscuro — el tema original de la app (obsidiana + guinda + marfil + champán). Default. */
export const paletteDark: Palette = {
  guinda: "#6B1F2E",
  guindaDark: "#4A1320",
  guindaLight: "#8B2D3F",
  paloRosa: "#D4A5A5",
  paloRosaLight: "#E8CFCF",
  marfil: "#F5EDE4",
  pergamino: "#EDE2D3",
  pergaminoSoft: "#C9A961",
  obsidiana: "#1A0F12",
  champan: "#C9A961",
  champanSoft: "#D4B777",
  error: "#C24A2E",
  cardBg: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.08)",
} as const;

/** Claro — derivado de `:root` en globals.css: fondo pergamino claro, texto guinda oscuro, acento champán. */
export const paletteLight: Palette = {
  guinda: "#73202E",
  guindaDark: "#5A041A",
  guindaLight: "#8C3843",
  paloRosa: "#7B595B",
  paloRosaLight: "#9D7D7E",
  marfil: "#3C161C",
  pergamino: "#F3EDE6",
  pergaminoSoft: "#D9B978",
  obsidiana: "#F3EDE6",
  champan: "#AE8D44",
  champanSoft: "#C5A767",
  error: "#D41101",
  cardBg: "#FAF6F1",
  cardBorder: "#DECEC1",
} as const;

/** Champán — derivado de `.executive` en globals.css: negro casi puro + acentos oro. */
export const paletteChampan: Palette = {
  guinda: "#DDB049",
  guindaDark: "#B3880F",
  guindaLight: "#ECC980",
  paloRosa: "#ECC980",
  paloRosaLight: "#8B9095",
  marfil: "#ECEFF2",
  pergamino: "#110D04",
  pergaminoSoft: "#4A3A0C",
  obsidiana: "#020203",
  champan: "#DDB049",
  champanSoft: "#E9CA89",
  error: "#DE3E2D",
  cardBg: "#060709",
  cardBorder: "rgba(255,255,255,0.12)",
} as const;

/** Retrocompatible: el tema oscuro tal cual estaba antes del sistema de temas. */
export const colors = paletteDark;

/**
 * `#RRGGBB` → `rgba(r,g,b,alpha)`. Para tintes translúcidos (badges, cards
 * "hechas") que antes estaban escritos a mano contra el hex del tema oscuro
 * — con esto se recalculan solos contra el color real del tema activo.
 * Si ya viene un color `rgba(...)` (como `cardBg`/`cardBorder` en oscuro y
 * Champán) se regresa tal cual: ya trae su propio alpha.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

/**
 * Nombres de familia tal cual los registra `useFonts` de cada paquete
 * `@expo-google-fonts/*`. Deben coincidir exactamente con las keys que se
 * cargan en `src/app/_layout.tsx`.
 */
export const fonts = {
  display: "Cinzel_500Medium",
  displaySemiBold: "Cinzel_600SemiBold",
  serifItalic: "CormorantGaramond_500Medium_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
} as const;

export const theme = { colors, spacing, radius, fonts } as const;
