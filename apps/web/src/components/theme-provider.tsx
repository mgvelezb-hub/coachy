"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/** Temas disponibles: claro, oscuro (Holy Gains) y ejecutivo (negro/oro). */
export const THEMES = ["light", "dark", "executive"] as const;
export type Theme = (typeof THEMES)[number];

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <NextThemeProvider
      attribute="class"
      themes={[...THEMES]}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
