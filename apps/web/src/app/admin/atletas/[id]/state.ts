/**
 * Estado del formulario. Vive fuera del archivo "use server": desde ahí
 * solo pueden exportarse funciones, y un objeto exportado llega vacío al cliente.
 */
export type ConfigState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors: string[];
};

export const EMPTY_CONFIG_STATE: ConfigState = { status: "idle", message: null, errors: [] };
