/**
 * Estado de la subida de referencias, aparte de la server action para que el
 * cliente pueda importarlo sin arrastrar el módulo `"use server"`.
 */
export interface GoalPhotoState {
  status: "idle" | "success" | "error";
  message: string;
  /** Vistas que sí quedaron guardadas en esta subida. */
  savedViews: string[];
}

export const INITIAL_GOAL_PHOTO_STATE: GoalPhotoState = {
  status: "idle",
  message: "",
  savedViews: [],
};
