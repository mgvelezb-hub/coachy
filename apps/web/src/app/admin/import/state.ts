/**
 * Estado del formulario. Vive fuera del archivo "use server": desde ahí
 * solo pueden exportarse funciones, y un objeto exportado llega vacío al cliente.
 */
export type ImportState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors: string[];
  summary: { checkIns: number; decisions: number; trainingExamples: number } | null;
};

export const EMPTY_IMPORT_STATE: ImportState = {
  status: "idle",
  message: null,
  errors: [],
  summary: null,
};
