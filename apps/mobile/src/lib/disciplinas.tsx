import { Activity, Dumbbell, Waves } from "lucide-react-native";
import type { ComponentType } from "react";

import {
  GuantesBox,
  JumpingJack,
  LevantamientoClean,
  PersonaCorriendo,
  RaquetaSquash,
} from "@/components/iconos/Disciplinas";
import type { Discipline } from "@/lib/api";

/**
 * El ícono de cada disciplina, en un solo lugar.
 *
 * Antes cada pantalla elegía el suyo y la misma disciplina salía con tres
 * caras distintas —olas en Rutinas, una mancuerna en Biblioteca, un genérico
 * en Actividad—. Un ícono que cambia de pantalla en pantalla deja de ser un
 * ícono y se vuelve decoración.
 *
 * Cuatro son dibujados a mano (`components/iconos/Disciplinas.tsx`) porque el
 * set genérico no los tiene: una raqueta de squash, un par de guantes, la
 * silueta corriendo, la del jumping jack y la del clean. Los sustitutos
 * genéricos —una pelota cualquiera, un puño suelto, unas pisadas— no se
 * reconocen de un vistazo, que es lo único que un ícono tiene que hacer.
 *
 * Mancuerna y olas sí vienen del set: para gimnasio y natación ya dicen
 * exactamente lo que son.
 */
type IconProps = { size?: number; color?: string; strokeWidth?: number };

export const DISCIPLINE_ICON: Record<Discipline, ComponentType<IconProps>> = {
  PESAS: Dumbbell,
  NATACION: Waves,
  BOX: GuantesBox,
  SQUASH: RaquetaSquash,
  CARDIO: PersonaCorriendo,
  FUNCIONAL: JumpingJack,
  CROSSFIT: LevantamientoClean,
  // La cubeta de lo que se registra pero no se planea.
  OTRO: Activity,
};

export function iconoDe(discipline: Discipline): ComponentType<IconProps> {
  return DISCIPLINE_ICON[discipline] ?? Activity;
}
