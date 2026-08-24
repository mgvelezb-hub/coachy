"use server";

import { revalidatePath } from "next/cache";

import type { GoalPhotoState } from "@/app/app/objetivo/state";
import { requireOnboardedUser } from "@/lib/auth";
import { GOAL_VIEWS, GOAL_VIEW_LABEL, goalPhotoPath, type GoalView } from "@/lib/coachy/goal";
import { deleteProgressPhotos, uploadProgressPhoto } from "@/lib/storage";
import { validatePhotoFile } from "@/lib/validation/checkin";

/**
 * Fotos de referencia del objetivo.
 *
 * Van al mismo bucket privado que las de progreso, bajo
 * `{user_id}/goal/{vista}.jpg`, y se suben con la sesión de la propia atleta:
 * las políticas de Storage atan la primera carpeta a `auth.uid()`, así que
 * nadie puede escribir en la carpeta de nadie más. La ruta la arma el servidor
 * con el id de la sesión — el formulario nunca manda una ruta.
 *
 * `upsert` es a propósito: la referencia es reemplazable, no acumulable. Tres
 * objetos por atleta, ni uno más.
 */

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function saveGoalPhotos(
  _prev: GoalPhotoState,
  formData: FormData,
): Promise<GoalPhotoState> {
  const user = await requireOnboardedUser();

  const saved: string[] = [];
  const problems: string[] = [];

  for (const view of GOAL_VIEWS) {
    const file = formData.get(`goal_${view}`);
    if (!isFile(file)) continue;

    const check = validatePhotoFile(file);
    if (!check.ok) {
      problems.push(`${GOAL_VIEW_LABEL[view]}: ${check.error}`);
      continue;
    }

    const upload = await uploadProgressPhoto(
      goalPhotoPath(user.id, view),
      file,
      file.type || "image/jpeg",
    );

    if (!upload.ok) {
      problems.push(`${GOAL_VIEW_LABEL[view]}: no se pudo subir (${upload.error})`);
      continue;
    }

    saved.push(view);
  }

  if (saved.length === 0 && problems.length === 0) {
    return { status: "error", message: "No elegiste ninguna foto.", savedViews: [] };
  }

  revalidatePath("/app/objetivo");
  revalidatePath("/app/historial");

  if (problems.length > 0) {
    return {
      status: saved.length > 0 ? "success" : "error",
      message: problems.join(" · "),
      savedViews: saved,
    };
  }

  return {
    status: "success",
    message: saved.length === 1 ? "Referencia guardada." : "Referencias guardadas.",
    savedViews: saved,
  };
}

/**
 * Quita una referencia. La ruta se arma con el id de la sesión, nunca con lo
 * que venga del formulario: del `FormData` solo se acepta la vista, y solo si
 * es una de las tres.
 */
export async function removeGoalReference(formData: FormData): Promise<void> {
  const user = await requireOnboardedUser();

  const raw = String(formData.get("view") ?? "");
  const view = GOAL_VIEWS.find((candidate): candidate is GoalView => candidate === raw);
  if (!view) return;

  await deleteProgressPhotos([goalPhotoPath(user.id, view)]);

  revalidatePath("/app/objetivo");
  revalidatePath("/app/historial");
}
