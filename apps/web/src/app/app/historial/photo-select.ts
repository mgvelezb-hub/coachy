/**
 * Qué fotos se comparan y de dónde salen.
 *
 * El historial real no tiene tres fotos cada domingo: hay semanas con una sola
 * vista y semanas con ninguna. Antes eso pintaba un hueco que decía "Sin foto",
 * que es la peor respuesta posible — la foto de esa vista casi siempre existe,
 * solo que en el check-in de al lado.
 *
 * Aquí se resuelven dos cosas, sin tocar la base ni el reloj para poder probarlo:
 *
 * 1. **Qué check-ins son las columnas.** Entre dos check-ins cercanos gana el
 *    que tiene las tres vistas: una columna completa compara mejor que una a
 *    medias.
 * 2. **Con qué se llena cada hueco.** Si a la columna le falta una vista, se
 *    toma prestada la de esa misma vista del check-in con foto más cercano
 *    (±3 semanas) y se etiqueta con su fecha real.
 */

export const PHOTO_VIEWS = ["FRENTE", "PERFIL", "ESPALDA"] as const;

export type PhotoView = (typeof PHOTO_VIEWS)[number];

/** Un check-in con foto, aplanado: una ruta de storage por vista. */
export interface PhotoCandidate {
  checkInId: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  paths: Partial<Record<PhotoView, string>>;
}

/** Una foto ya colocada en una columna. */
export interface PhotoSlot {
  storagePath: string;
  /** ISO `YYYY-MM-DD` del check-in del que salió de verdad la foto. */
  date: string;
  /** La foto no es de esta columna: se trajo de un check-in cercano. */
  borrowed: boolean;
}

export interface PhotoColumn {
  label: string;
  checkInId: string;
  /** ISO `YYYY-MM-DD` de la columna. */
  date: string;
  slots: Partial<Record<PhotoView, PhotoSlot>>;
}

/** Ventana para tomar prestada una foto: tres semanas a cada lado. */
export const NEAR_DAYS = 21;

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(`${a}T12:00:00.000Z`).getTime() - new Date(`${b}T12:00:00.000Z`).getTime()) / DAY_MS;
}

function coverage(candidate: PhotoCandidate): number {
  return PHOTO_VIEWS.filter((view) => candidate.paths[view] !== undefined).length;
}

/**
 * El mejor representante de un momento del historial: entre los check-ins que
 * caen a menos de tres semanas del ancla, el que trae más vistas; a igualdad de
 * vistas, el más cercano al ancla.
 */
export function preferComplete(
  pool: readonly PhotoCandidate[],
  anchor: PhotoCandidate,
): PhotoCandidate {
  let best = anchor;

  for (const candidate of pool) {
    if (daysBetween(candidate.date, anchor.date) > NEAR_DAYS) continue;

    const better =
      coverage(candidate) > coverage(best) ||
      (coverage(candidate) === coverage(best) &&
        daysBetween(candidate.date, anchor.date) < daysBetween(best.date, anchor.date));

    if (better) best = candidate;
  }

  return best;
}

/**
 * La foto de `view` para esta columna. Si el check-in la tiene, esa; si no, la
 * del check-in con foto más cercano dentro de la ventana.
 */
export function resolveSlot(
  column: PhotoCandidate,
  view: PhotoView,
  pool: readonly PhotoCandidate[],
): PhotoSlot | null {
  const own = column.paths[view];
  if (own !== undefined) return { storagePath: own, date: column.date, borrowed: false };

  const near = pool
    .filter(
      (candidate) =>
        candidate.checkInId !== column.checkInId &&
        candidate.paths[view] !== undefined &&
        daysBetween(candidate.date, column.date) <= NEAR_DAYS,
    )
    .sort(
      (a, b) =>
        daysBetween(a.date, column.date) - daysBetween(b.date, column.date) ||
        (a.date < b.date ? 1 : -1),
    );

  const chosen = near[0];
  if (chosen === undefined) return null;

  return {
    storagePath: chosen.paths[view] as string,
    date: chosen.date,
    borrowed: true,
  };
}

/**
 * Las columnas del comparador: la más reciente, la anterior y el día 1.
 *
 * `candidates` llega del más viejo al más nuevo y solo trae check-ins con al
 * menos una foto. Devuelve entre 0 y 3 columnas, sin repetir check-in.
 */
export function buildPhotoColumns(candidates: readonly PhotoCandidate[]): PhotoColumn[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => (a.date < b.date ? -1 : 1));

  const latest = preferComplete(sorted, sorted[sorted.length - 1] as PhotoCandidate);

  const beforeLatest = sorted.filter((candidate) => candidate.date < latest.date);
  const previous =
    beforeLatest.length > 0
      ? preferComplete(beforeLatest, beforeLatest[beforeLatest.length - 1] as PhotoCandidate)
      : null;

  const first = preferComplete(sorted, sorted[0] as PhotoCandidate);

  const picks: Array<{ label: string; candidate: PhotoCandidate | null }> = [
    { label: "Más reciente", candidate: latest },
    { label: "Anterior", candidate: previous },
    { label: "Día 1", candidate: first },
  ];

  const used = new Set<string>();
  const columns: PhotoColumn[] = [];

  for (const pick of picks) {
    if (pick.candidate === null || used.has(pick.candidate.checkInId)) continue;
    used.add(pick.candidate.checkInId);

    const slots: PhotoColumn["slots"] = {};
    for (const view of PHOTO_VIEWS) {
      const slot = resolveSlot(pick.candidate, view, sorted);
      if (slot !== null) slots[view] = slot;
    }

    columns.push({
      label: pick.label,
      checkInId: pick.candidate.checkInId,
      date: pick.candidate.date,
      slots,
    });
  }

  return columns;
}
