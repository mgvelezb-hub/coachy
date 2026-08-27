/**
 * Tokens del brand kit "Holy Gains". Única fuente de verdad de colores,
 * spacing, radios y tipografías — nada de valores mágicos sueltos en pantallas.
 */

export const colors = {
  guinda: "#6B1F2E",
  guindaDark: "#4A1320",
  guindaLight: "#8B2D3F",
  paloRosa: "#D4A5A5",
  paloRosaLight: "#E8CFCF",
  marfil: "#F5EDE4",
  pergamino: "#EDE2D3",
  obsidiana: "#1A0F12",
  champan: "#C9A961",
  champanSoft: "#D4B777",
  error: "#C24A2E",
  // Auxiliares derivados, no forman parte del kit pero se usan para overlays.
  cardBg: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.08)",
} as const;

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
