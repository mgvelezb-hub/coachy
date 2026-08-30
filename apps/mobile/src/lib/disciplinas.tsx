import {
  Activity,
  Dumbbell,
  Footprints,
  HandFist,
  Timer,
  Volleyball,
  Waves,
  Weight,
} from "lucide-react-native";
import type { ComponentType } from "react";

import type { Discipline } from "@/lib/api";

/**
 * El ícono de cada disciplina, en un solo lugar.
 *
 * Antes cada pantalla elegía el suyo y la misma disciplina salía con tres
 * caras distintas —olas en Rutinas, una mancuerna en Biblioteca, un genérico
 * en Actividad—. Un ícono que cambia de pantalla en pantalla deja de ser un
 * ícono y se vuelve decoración.
 *
 * Elegidos por lo que la disciplina hace, con lo que el set de íconos tiene:
 * el puño para box, la pelota para squash, las olas para nadar, las pisadas
 * para correr, la pesa rusa para funcional y el cronómetro para CrossFit —el
 * WOD se mide contra el reloj, y eso lo distingue de las pesas—.
 */
type IconProps = { size?: number; color?: string; strokeWidth?: number };

export const DISCIPLINE_ICON: Record<Discipline, ComponentType<IconProps>> = {
  PESAS: Dumbbell,
  NATACION: Waves,
  BOX: HandFist,
  SQUASH: Volleyball,
  CARDIO: Footprints,
  FUNCIONAL: Weight,
  CROSSFIT: Timer,
  // La cubeta de lo que se registra pero no se planea.
  OTRO: Activity,
};

export function iconoDe(discipline: Discipline): ComponentType<IconProps> {
  return DISCIPLINE_ICON[discipline] ?? Activity;
}
