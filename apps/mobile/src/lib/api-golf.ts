import { apiFetch } from "@/lib/api";

/**
 * Cliente de `/api/v1/golf/*` — contrato EXACTO de las rutas en
 * `apps/web/src/app/api/v1/golf/**` (ver `golf-schema.ts` y `golf.ts` ahí).
 *
 * Separado de `api.ts` en vez de agregarlo a ese archivo porque golf trae su
 * propio modelo (`GolfRound`/`GolfPractice`, agregados de `lib/golf.ts`) y no
 * el de `ActivitySession` que usa el resto de `api.ts` — mezclarlos ahí
 * habría hecho pasar por "una sesión más" algo que en realidad registra
 * score, putts, GIR y castigos.
 */

export const GOLF_PRACTICE_KINDS = ["RANGE", "JUEGO_CORTO", "PUTTING"] as const;
export type GolfPracticeKind = (typeof GOLF_PRACTICE_KINDS)[number];

/** Lo que se manda a `POST /api/v1/golf/ronda`. */
export type GolfRondaInput = {
  /** yyyy-MM-dd. */
  date: string;
  holes: 9 | 18;
  score: number;
  par?: number | null;
  putts?: number | null;
  fairwaysHit?: number | null;
  fairwaysTotal?: number | null;
  girHit?: number | null;
  penalties?: number | null;
  course?: string | null;
  notes?: string | null;
};

export type GolfRonda = GolfRondaInput & { id: string };

/** Lo que se manda a `POST /api/v1/golf/practica`. */
export type GolfPracticaInput = {
  /** yyyy-MM-dd. */
  date: string;
  kind: GolfPracticeKind;
  minutes: number;
  balls?: number | null;
  notes?: string | null;
};

export type GolfPractica = GolfPracticaInput & { id: string };

/** Agregados de `GET /api/v1/golf` — mismo shape que `GolfAggregates` en `lib/golf.ts`. */
export type GolfAgregados = {
  rondas: number;
  scoreVsPar: { ultimas5: number | null; todas: number | null };
  girPct: number | null;
  firPct: number | null;
  puttsPromedio: number | null;
  castigosPromedio: number | null;
  tendencia: "MEJORANDO" | "ESTABLE" | "EMPEORANDO" | null;
  diferencial: number | null;
  practica: {
    totalMinutos: number;
    balancePorTipo: Partial<Record<GolfPracticeKind, number>>;
  };
};

export type GolfResponse = {
  rondas: GolfRonda[];
  practicas: GolfPractica[];
  agregados: GolfAgregados;
};

/** `GET /api/v1/golf` — últimas 20 rondas, prácticas de 30 días y agregados. */
export function getGolf(): Promise<GolfResponse> {
  return apiFetch<GolfResponse>("/api/v1/golf");
}

/** `POST /api/v1/golf/ronda` — registra una ronda jugada. */
export function postGolfRonda(input: GolfRondaInput): Promise<{ ok: true; ronda: GolfRonda }> {
  return apiFetch<{ ok: true; ronda: GolfRonda }>("/api/v1/golf/ronda", { method: "POST", body: input });
}

/** `POST /api/v1/golf/practica` — registra una sesión de range, juego corto o putting. */
export function postGolfPractica(
  input: GolfPracticaInput,
): Promise<{ ok: true; practica: GolfPractica }> {
  return apiFetch<{ ok: true; practica: GolfPractica }>("/api/v1/golf/practica", {
    method: "POST",
    body: input,
  });
}
