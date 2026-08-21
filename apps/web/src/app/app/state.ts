/**
 * Estado del formulario. Vive fuera del archivo "use server": desde ahí
 * solo pueden exportarse funciones, y un objeto exportado llega vacío al cliente.
 */
export type AnswerState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const EMPTY_ANSWER_STATE: AnswerState = { status: "idle", message: null };
