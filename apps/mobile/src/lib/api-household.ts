import { apiFetch } from "@/lib/api";

/**
 * Cliente del vínculo de hogar y de la lista de súper compartida.
 *
 * Vive aparte de `@/lib/api.ts` (que no se toca en esta fase) para no
 * seguir creciendo ese archivo — los tipos aquí son el espejo exacto de las
 * rutas en `apps/web/src/app/api/v1/household/**`; si un shape cambia allá,
 * cambia aquí.
 */

export type EstadoVinculo = "PENDIENTE" | "ACTIVO";

/** `null` = sin vínculo. `pareja` es `null` mientras sigue PENDIENTE (nadie lo ha aceptado). */
export type VinculoHousehold = {
  status: EstadoVinculo;
  pareja: string | null;
  /** ISO 8601. Solo viene con `status: "PENDIENTE"`. */
  expiresAt?: string;
} | null;

export type HouseholdResponse = { vinculo: VinculoHousehold };
export type InvitarResponse = { code: string; expiresAt: string };
export type AceptarResponse = { vinculo: { status: EstadoVinculo; pareja: string } };
export type DisolverResponse = { ok: true };

/**
 * `compartida: false` (con `items: []`) es "no hay vínculo ACTIVO", no
 * "la lista compartida está vacía" — la pantalla de lista de súper lo usa
 * para decidir si sigue con el tachado local o pasa al del servidor.
 */
export type SuperCompartidoResponse = { compartida: boolean; items: string[] };

/** `GET /api/v1/household` — el vínculo vigente (ACTIVO o PENDIENTE), o ninguno. */
export function getHousehold(): Promise<HouseholdResponse> {
  return apiFetch<HouseholdResponse>("/api/v1/household");
}

/** `POST /api/v1/household/invitar` — genera (o reutiliza) el código de invitación, vigente 48 h. */
export function postInvitar(): Promise<InvitarResponse> {
  return apiFetch<InvitarResponse>("/api/v1/household/invitar", { method: "POST" });
}

/** `POST /api/v1/household/aceptar` — acepta un código de 6 caracteres compartido fuera de la app. */
export function postAceptar(code: string): Promise<AceptarResponse> {
  return apiFetch<AceptarResponse>("/api/v1/household/aceptar", {
    method: "POST",
    body: { code },
  });
}

/** `POST /api/v1/household/disolver` — termina el vínculo vigente. Cualquiera de los dos puede hacerlo. */
export function postDisolver(): Promise<DisolverResponse> {
  return apiFetch<DisolverResponse>("/api/v1/household/disolver", { method: "POST" });
}

/** `GET /api/v1/household/super` — el tachado de la lista de súper compartida. */
export function getSuperCompartido(): Promise<SuperCompartidoResponse> {
  return apiFetch<SuperCompartidoResponse>("/api/v1/household/super");
}

/** `PUT /api/v1/household/super` — reemplaza el tachado compartido completo. */
export function putSuperCompartido(items: string[]): Promise<SuperCompartidoResponse> {
  return apiFetch<SuperCompartidoResponse>("/api/v1/household/super", {
    method: "PUT",
    body: { items },
  });
}
