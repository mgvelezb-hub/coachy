import type { Punto } from "@/components/LineChart";
import type { LabResult } from "@/lib/api";

/**
 * Los campos que la pantalla de estudios captura — lógica PURA.
 *
 * `refLow`/`refHigh` van en `null` a propósito: **la app no trae rangos
 * propios**. Cuando el laboratorio imprime los suyos se capturan con el valor,
 * y solo contra esos se dice qué cayó fuera. Poner aquí un rango "de uso
 * común" sería empezar a interpretar por la puerta de atrás.
 */

export type CampoLab = {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  refLow: number | null;
  refHigh: number | null;
};

/** Bioimpedancia. Las tres primeras son las que el perfil sabe usar. */
export const CAMPOS_INBODY: CampoLab[] = [
  { key: "peso_kg", label: "Peso", unit: "kg", placeholder: "120.4", refLow: null, refHigh: null },
  { key: "grasa_pct", label: "Grasa corporal", unit: "%", placeholder: "33.5", refLow: null, refHigh: null },
  {
    key: "masa_libre_grasa_kg",
    label: "Masa libre de grasa",
    unit: "kg",
    placeholder: "73.0",
    refLow: null,
    refHigh: null,
  },
  {
    key: "masa_musculo_kg",
    label: "Masa muscular esquelética",
    unit: "kg",
    placeholder: "41.2",
    refLow: null,
    refHigh: null,
  },
  {
    key: "grasa_visceral",
    label: "Grasa visceral",
    unit: "nivel",
    placeholder: "14",
    refLow: null,
    refHigh: null,
  },
  { key: "agua_total_l", label: "Agua corporal", unit: "L", placeholder: "48.0", refLow: null, refHigh: null },
];

/** Química sanguínea: los parámetros que casi todo perfil básico trae. */
export const CAMPOS_QUIMICA: CampoLab[] = [
  { key: "glucosa", label: "Glucosa", unit: "mg/dL", placeholder: "100", refLow: null, refHigh: null },
  {
    key: "hemoglobina_glucosilada",
    label: "Hemoglobina glucosilada",
    unit: "%",
    placeholder: "5.4",
    refLow: null,
    refHigh: null,
  },
  {
    key: "colesterol_total",
    label: "Colesterol total",
    unit: "mg/dL",
    placeholder: "180",
    refLow: null,
    refHigh: null,
  },
  { key: "hdl", label: "Colesterol HDL", unit: "mg/dL", placeholder: "45", refLow: null, refHigh: null },
  { key: "ldl", label: "Colesterol LDL", unit: "mg/dL", placeholder: "110", refLow: null, refHigh: null },
  {
    key: "trigliceridos",
    label: "Triglicéridos",
    unit: "mg/dL",
    placeholder: "150",
    refLow: null,
    refHigh: null,
  },
  { key: "creatinina", label: "Creatinina", unit: "mg/dL", placeholder: "0.9", refLow: null, refHigh: null },
  { key: "acido_urico", label: "Ácido úrico", unit: "mg/dL", placeholder: "5.5", refLow: null, refHigh: null },
  { key: "tgo", label: "TGO (AST)", unit: "U/L", placeholder: "25", refLow: null, refHigh: null },
  { key: "tgp", label: "TGP (ALT)", unit: "U/L", placeholder: "28", refLow: null, refHigh: null },
];

/**
 * La serie de un parámetro, del estudio más viejo al más reciente.
 *
 * Los estudios llegan del servidor del más nuevo al más viejo (que es el orden
 * en que se leen), pero una línea de tendencia se lee al revés.
 */
export function seriesDe(labs: LabResult[], key: string): Punto[] {
  return labs
    .map((lab) => ({
      date: lab.takenOn,
      value: lab.values.find((value) => value.key === key)?.value ?? null,
    }))
    .filter((punto) => punto.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
