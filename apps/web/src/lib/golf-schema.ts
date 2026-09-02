import { z } from "zod";

import { GOLF_PRACTICE_KINDS } from "@/lib/golf";

/**
 * Lo que mandan `POST /api/v1/golf/ronda` y `POST /api/v1/golf/practica`.
 *
 * Mismo patrón que `lib/activity/schema.ts`: `userId` nunca viaja en el
 * cuerpo (sale del Bearer en la ruta), y los topes existen para que un dedo
 * gordo o un bug del cliente no metan un score de 900 o una ronda de 400
 * hoyos que después envenene los agregados de `lib/golf.ts`.
 */

/** `YYYY-MM-DD`, y que sea una fecha de verdad. Mismo patrón que `activity/schema.ts`. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va en formato YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)), "fecha inexistente");

const HOLES = [9, 18] as const;

/** Un score de 18 sería un hoyo en uno en cada hoyo; por debajo de eso ya no es una ronda real. */
const MIN_SCORE = 18;
/** Un score de 180 en 18 hoyos es diez sobre par por hoyo: ya cubre la ronda más mala imaginable. */
const MAX_SCORE = 180;
/** Un par de campo va de 9 hoyos par 3 (27) a 18 hoyos par 5 casi todos (90). */
const MIN_PAR = 27;
const MAX_PAR = 90;
/** Con 18 hoyos, más de 60 putts es una ronda catastrófica pero posible; el tope solo descarta errores de captura. */
const MAX_PUTTS = 99;
const MAX_PENALTIES = 30;

export const golfRondaSchema = z
  .object({
    date: isoDate,
    holes: z.union([z.literal(HOLES[0]), z.literal(HOLES[1])]),
    score: z.number().int().min(MIN_SCORE).max(MAX_SCORE),
    par: z.number().int().min(MIN_PAR).max(MAX_PAR).nullish(),
    putts: z.number().int().min(0).max(MAX_PUTTS).nullish(),
    fairwaysHit: z.number().int().min(0).max(18).nullish(),
    fairwaysTotal: z.number().int().min(0).max(18).nullish(),
    girHit: z.number().int().min(0).max(18).nullish(),
    penalties: z.number().int().min(0).max(MAX_PENALTIES).nullish(),
    course: z.string().max(200).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .refine(
    (ronda) =>
      ronda.fairwaysHit == null || ronda.fairwaysTotal == null || ronda.fairwaysHit <= ronda.fairwaysTotal,
    { message: "fairwaysHit no puede ser mayor que fairwaysTotal", path: ["fairwaysHit"] },
  )
  .refine((ronda) => ronda.fairwaysTotal == null || ronda.fairwaysTotal <= ronda.holes, {
    message: "fairwaysTotal no puede ser mayor que holes",
    path: ["fairwaysTotal"],
  })
  .refine((ronda) => ronda.girHit == null || ronda.girHit <= ronda.holes, {
    message: "girHit no puede ser mayor que holes",
    path: ["girHit"],
  });

export type GolfRondaInput = z.infer<typeof golfRondaSchema>;

export const golfPracticaSchema = z.object({
  date: isoDate,
  kind: z.enum(GOLF_PRACTICE_KINDS),
  minutes: z.number().int().min(5).max(300),
  balls: z.number().int().min(0).max(2000).nullish(),
  notes: z.string().max(1000).nullish(),
});

export type GolfPracticaInput = z.infer<typeof golfPracticaSchema>;
