"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const OPTIONS = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "executive", label: "Ejecutivo" },
] as const;

/** Selector de tema: Sistema / Claro / Oscuro / Ejecutivo (negro + oro). */
export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  // Evita el mismatch de hidratación: hasta montar no sabemos el tema real.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Tabs value={mounted ? theme : undefined} onValueChange={setTheme}>
      <TabsList className="grid w-full grid-cols-4">
        {OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
