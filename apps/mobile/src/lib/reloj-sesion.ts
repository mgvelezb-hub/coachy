import { primeraPendiente, type EstadoSesion } from "@/lib/sesion-viva";

/**
 * Traducción entre la sesión del teléfono y la del reloj — lógica PURA.
 *
 * Aparte de la pantalla y del módulo nativo porque es donde están las reglas
 * que pueden salir mal, y esas se prueban sin reloj, sin teléfono y sin
 * gimnasio.
 *
 * La regla que ordena todo lo demás: **el reloj nunca pisa lo que el teléfono
 * ya cerró.** El reloj no tiene dónde escribir el peso ni la sustitución, y una
 * serie cerrada en la muñeca que llega tarde y borra los kilos que alguien
 * tecleó es exactamente el bug que haría desconfiar de la app entera. Cuando
 * las dos versiones existen, gana la del teléfono.
 */

export type SerieParaReloj = {
  indice: number;
  objetivo: number;
  pesoKg: number | null;
  calentamiento: boolean;
  hechas: number | null;
};

export type EjercicioParaReloj = {
  nombre: string;
  descansoSeg: number;
  series: SerieParaReloj[];
};

export type SesionParaReloj = {
  workoutId: string;
  titulo: string;
  ejercicios: EjercicioParaReloj[];
};

/** Lo que el reloj manda de vuelta al cerrar una serie desde la muñeca. */
export type SerieCerradaEnReloj = {
  workoutId: string;
  ejercicioIndice: number;
  serieIndice: number;
  reps: number;
  pesoKg: number | null;
  /** ISO 8601. */
  cerradaEn: string;
  /** Magnitud de aceleración a 50 Hz. Se guarda para calibrar, no se lee hoy. */
  muestra: number[];
  duracionSeg: number;
};

/**
 * El espejo de la sesión que viaja a la muñeca.
 *
 * Solo lo que cabe en una pantalla de 40 mm: qué ejercicio, qué serie, cuántas
 * reps pide y con cuántos kilos. Ni catálogo, ni videos, ni historial.
 */
export function paraElReloj(
  workoutId: string,
  titulo: string,
  estado: EstadoSesion,
): SesionParaReloj {
  return {
    workoutId,
    titulo,
    ejercicios: estado.ejercicios.map((ejercicio) => ({
      nombre: ejercicio.nombre,
      descansoSeg: ejercicio.descansoSeg,
      series: ejercicio.series.map((serie, indice) => ({
        indice,
        objetivo: serie.objetivo,
        pesoKg: serie.pesoKg,
        calentamiento: serie.calentamiento,
        hechas: serie.hechas,
      })),
    })),
  };
}

/**
 * Mete en el estado las series que se cerraron desde el reloj.
 *
 * Devuelve **solo las que de verdad se aplicaron**, porque cada una hay que
 * escribirla también en el borrador que se sincroniza, y escribir una que se
 * descartó dejaría la base local diciendo algo que la pantalla no dice.
 *
 * Se descarta lo que no se puede confiar: otra sesión, índices que no existen,
 * reps negativas, y las series que el teléfono ya había cerrado.
 */
export function aplicarDelReloj(
  estado: EstadoSesion,
  cerradas: SerieCerradaEnReloj[],
  workoutId: string,
): { estado: EstadoSesion; aplicadas: SerieCerradaEnReloj[] } {
  const aplicadas: SerieCerradaEnReloj[] = [];
  let ejercicios = estado.ejercicios;

  for (const cerrada of cerradas) {
    if (cerrada.workoutId !== workoutId) continue;

    const ejercicio = ejercicios[cerrada.ejercicioIndice];
    const serie = ejercicio?.series[cerrada.serieIndice];
    if (!ejercicio || !serie) continue;

    // Ya cerrada en el teléfono: el reloj llega tarde y no manda.
    if (serie.hechas !== null) continue;
    if (!Number.isInteger(cerrada.reps) || cerrada.reps < 0) continue;

    ejercicios = ejercicios.map((actual, e) =>
      e !== cerrada.ejercicioIndice
        ? actual
        : {
            ...actual,
            series: actual.series.map((suya, s) =>
              s !== cerrada.serieIndice
                ? suya
                : {
                    ...suya,
                    hechas: cerrada.reps,
                    // El reloj no tiene dónde teclear kilos: si no los manda,
                    // se queda el peso que el plan traía.
                    pesoKg: cerrada.pesoKg ?? suya.pesoKg,
                  },
            ),
          },
    );

    aplicadas.push(cerrada);
  }

  if (aplicadas.length === 0) return { estado, aplicadas };

  // Al aplicar series de golpe, dónde está parada la sesión se recalcula: si
  // el reloj cerró tres, la pantalla debe abrir en la cuarta y no en la que
  // estaba antes de sincronizar.
  const pendiente = primeraPendiente(ejercicios);

  return {
    estado: {
      ...estado,
      ejercicios,
      ejercicioActual: pendiente?.ejercicio ?? estado.ejercicioActual,
      serieActual: pendiente?.serie ?? estado.serieActual,
      // El descanso se corta: lo que se estaba contando era el de una serie
      // que ya no es la que sigue.
      descansoHasta: pendiente === null ? null : estado.descansoHasta,
      terminada: pendiente === null,
    },
    aplicadas,
  };
}
