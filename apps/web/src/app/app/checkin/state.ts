/**
 * Estado del formulario. Vive fuera del archivo "use server": desde ahí
 * solo pueden exportarse funciones, y un objeto exportado llega vacío al cliente.
 */
export type CheckInState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Record<string, string>;
  /** Avisos que no tumban el guardado, p. ej. una foto que no subió. */
  warnings: string[];
};

export const EMPTY_CHECKIN_STATE: CheckInState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  warnings: [],
};
