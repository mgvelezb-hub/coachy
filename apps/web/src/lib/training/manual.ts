import { DAY_GROUPS } from "@/lib/training/split";
import type { DayKind, MuscleGroup } from "@/lib/training/types";

/**
 * Por qué Coachy propone justo estos ejercicios para este día.
 *
 * Es una línea, no un párrafo: va debajo del título de la hoja donde la
 * persona puede cambiar la lista, y su trabajo es que la decisión de tocarla
 * (o no) sea informada. Tres piezas, en el orden en que pesan: el objetivo,
 * la condición actual (lesión o fase de recorte) y las zonas que el último
 * análisis vio lejos de la referencia.
 *
 * Sin nada que decir devuelve la razón de siempre —el objetivo—, nunca una
 * cadena vacía: una hoja que no explica por qué propone lo que propone es
 * exactamente lo que hace que la gente deje de confiar en el plan.
 */

const POR_OBJETIVO: Record<string, string> = {
  GANANCIA_MUSCULO: "Para ganar músculo",
  PERDIDA_GRASA: "Para bajar grasa",
  RECOMPOSICION: "Para recomponer",
  SALUD: "Para sostener el hábito",
  RENDIMIENTO: "Para rendir en tu disciplina",
};

/** Cómo se llama cada grupo cuando se lo dices a la persona, no al motor. */
const NOMBRE_DE_GRUPO: Record<MuscleGroup, string> = {
  PIERNA: "pierna",
  PECHO: "pecho",
  ESPALDA: "espalda",
  HOMBRO: "hombro",
  BICEP: "bíceps",
  TRICEP: "tríceps",
  ABDOMEN: "abdomen",
};

export function porqueDeLaSugerencia(
  kind: DayKind,
  entrada: {
    goal: string;
    /** Etiquetas del perfil: `lesion_rodilla`, ... */
    conditions: string[];
    /** `reducido` = fase de recorte agresivo: menos volumen por sesión. */
    volumeBias: "normal" | "reducido";
    /** Zonas lejos de la referencia, del último análisis del objetivo. */
    zonasLejos: MuscleGroup[];
  },
): string {
  const partes: string[] = [POR_OBJETIVO[entrada.goal] ?? "Para tu objetivo"];

  if (entrada.conditions.some((tag) => tag.trim().toLowerCase().startsWith("lesion"))) {
    partes.push("cuidando la zona lesionada");
  }
  if (entrada.volumeBias === "reducido") {
    partes.push("con el volumen recortado de esta fase");
  }

  // Solo las zonas que este día toca: decirle que la espalda está lejos en el
  // día de pierna no le sirve para decidir nada aquí.
  const delDia = entrada.zonasLejos.filter((grupo) => DAY_GROUPS[kind].includes(grupo));
  if (delDia.length > 0) {
    partes.push(
      `y con ${delDia.map((grupo) => NOMBRE_DE_GRUPO[grupo]).join(" y ")} todavía lejos de tu referencia`,
    );
  }

  return `${partes.join(", ").replace(", y ", " y ")}.`;
}
