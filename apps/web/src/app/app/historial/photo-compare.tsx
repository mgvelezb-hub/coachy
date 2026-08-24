"use client";

import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Una foto lista para pintar, con la fecha de la que de verdad salió. */
export interface PhotoSlotView {
  url: string;
  /** Fecha corta legible de la foto: puede no ser la de la columna. */
  date: string;
  /** La foto vino de un check-in cercano, no de esta columna. */
  borrowed: boolean;
}

export interface PhotoSet {
  /** Etiqueta legible: "Más reciente", "Anterior", "Día 1". */
  label: string;
  date: string;
  photos: Partial<Record<"FRENTE" | "PERFIL" | "ESPALDA", PhotoSlotView>>;
}

const VIEWS = [
  { key: "FRENTE", label: "Frente" },
  { key: "PERFIL", label: "Perfil" },
  { key: "ESPALDA", label: "Espalda" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * Comparador lado a lado: semana N vs N−1 vs día 1, por vista.
 *
 * Cuando el check-in de una columna no trae esa vista, el servidor ya buscó la
 * más cercana (±3 semanas) y la mandó marcada como prestada: aquí se pinta con
 * su fecha real ("frente · 02/05") en lugar de un hueco que diga "Sin foto".
 */
export function PhotoCompare({ sets }: { sets: PhotoSet[] }): React.JSX.Element {
  const [view, setView] = useState<ViewKey | null>(null);
  const available = sets.filter((set) => Object.keys(set.photos).length > 0);

  // Solo se ofrecen las vistas que alguien tiene: una pestaña con tres huecos
  // vacíos no le dice nada a nadie.
  const views = VIEWS.filter((item) => available.some((set) => set.photos[item.key]));
  const activeView = views.some((item) => item.key === view) ? view : views[0]?.key;

  if (available.length === 0 || !activeView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparador de fotos</CardTitle>
          <CardDescription>
            Cuando subas fotos en tu check-in aparecen aquí, lado a lado con las de la semana
            pasada y las del día 1.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparador de fotos</CardTitle>
        <CardDescription>
          Misma vista, distintas semanas. La foto miente menos que la báscula.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={activeView} onValueChange={(value) => setView(value as ViewKey)}>
          <TabsList
            className={cn(
              "grid w-full",
              views.length === 1 && "grid-cols-1",
              views.length === 2 && "grid-cols-2",
              views.length >= 3 && "grid-cols-3",
            )}
          >
            {views.map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {views.map((item) => (
            <TabsContent key={item.key} value={item.key}>
              <div
                className={cn(
                  "grid gap-2",
                  available.length === 1 && "grid-cols-1",
                  available.length === 2 && "grid-cols-2",
                  available.length >= 3 && "grid-cols-3",
                )}
              >
                {available.map((set) => {
                  const photo = set.photos[item.key];
                  return (
                    <figure key={`${set.label}-${item.key}`} className="space-y-1">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo.url}
                            alt={`${item.label} — ${set.label}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground/70">
                            Esa vista no se tomó en estas semanas
                          </span>
                        )}
                      </div>
                      <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                        <span className="block font-medium text-foreground">{set.label}</span>
                        {photo?.borrowed
                          ? `${item.label.toLowerCase()} · ${photo.date}`
                          : set.date}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
