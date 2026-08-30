/**
 * La máquina de estados de una sesión de gimnasio en vivo — lógica PURA.
 *
 * Vive aparte de la pantalla porque es donde están las reglas que importan y
 * porque así se puede probar sin montar nada: qué serie sigue, cuándo empieza
 * el descanso, cuándo se acabó el ejercicio, cuándo se acabó la sesión.
 *
 * Dos decisiones que no conviene re-litigar:
 *
 * - **El descanso arranca solo al cerrar una serie, no al abrir la app.** El
 *   cronómetro que hay que acordarse de iniciar es el que nadie inicia; y el
 *   momento exacto en que termina una serie es el único que la app sí conoce
 *   sin sensores.
 * - **La última serie de un ejercicio no descansa.** Descansar 90 segundos
 *   para irse a otra máquina es tiempo muerto disfrazado de método.
 */

export type SerieViva = {
  /** Reps que pide el plan. */
  objetivo: number;
  /** Reps que de verdad salieron. `null` = todavía no se cierra. */
  hechas: number | null;
  /** Kilos con los que se hizo. */
  pesoKg: number | null;
  /** De calentamiento: no cuenta para progresión ni para el volumen. */
  calentamiento: boolean;
};

export type EjercicioVivo = {
  indice: number;
  nombre: string;
  /** Segundos de descanso que pide el esquema entre series. */
  descansoSeg: number;
  series: SerieViva[];
};

export type EstadoSesion = {
  ejercicios: EjercicioVivo[];
  /** En qué ejercicio va. */
  ejercicioActual: number;
  /** En qué serie de ese ejercicio va. */
  serieActual: number;
  /** Segundos que faltan de descanso, o `null` si no está descansando. */
  descansoRestante: number | null;
  /** La sesión ya no tiene series pendientes. */
  terminada: boolean;
};

export function estadoInicial(ejercicios: EjercicioVivo[]): EstadoSesion {
  const primera = primeraPendiente(ejercicios);
  return {
    ejercicios,
    ejercicioActual: primera?.ejercicio ?? 0,
    serieActual: primera?.serie ?? 0,
    descansoRestante: null,
    terminada: primera === null,
  };
}

/** La primera serie sin cerrar, recorriendo en el orden en que se entrena. */
export function primeraPendiente(
  ejercicios: EjercicioVivo[],
): { ejercicio: number; serie: number } | null {
  for (let e = 0; e < ejercicios.length; e += 1) {
    const series = ejercicios[e]!.series;
    for (let s = 0; s < series.length; s += 1) {
      if (series[s]!.hechas === null) return { ejercicio: e, serie: s };
    }
  }
  return null;
}

/**
 * Cierra la serie en curso.
 *
 * Devuelve el estado nuevo y **qué sigue**, que es lo que la pantalla necesita
 * para decidir si vibra distinto, si arranca la cuenta o si ya se acabó.
 */
export function cerrarSerie(
  estado: EstadoSesion,
  valores: { reps: number; pesoKg: number | null },
): { estado: EstadoSesion; siguiente: "descanso" | "otro_ejercicio" | "fin" } {
  const ejercicios = estado.ejercicios.map((ejercicio, e) => {
    if (e !== estado.ejercicioActual) return ejercicio;
    return {
      ...ejercicio,
      series: ejercicio.series.map((serie, s) =>
        s === estado.serieActual
          ? { ...serie, hechas: valores.reps, pesoKg: valores.pesoKg }
          : serie,
      ),
    };
  });

  const pendiente = primeraPendiente(ejercicios);
  if (pendiente === null) {
    return {
      estado: { ...estado, ejercicios, descansoRestante: null, terminada: true },
      siguiente: "fin",
    };
  }

  const cambiaEjercicio = pendiente.ejercicio !== estado.ejercicioActual;
  const descanso = ejercicios[estado.ejercicioActual]?.descansoSeg ?? 0;

  return {
    estado: {
      ...estado,
      ejercicios,
      ejercicioActual: pendiente.ejercicio,
      serieActual: pendiente.serie,
      // Entre ejercicios no se cuenta descanso: el traslado a la otra máquina
      // ya es el descanso, y un cronómetro corriendo mientras caminas solo
      // sirve para llegar tarde a tu propia serie.
      descansoRestante: cambiaEjercicio ? null : descanso > 0 ? descanso : null,
      terminada: false,
    },
    siguiente: cambiaEjercicio ? "otro_ejercicio" : "descanso",
  };
}

/** Un segundo menos de descanso. Al llegar a cero, el descanso se apaga. */
export function tick(estado: EstadoSesion): { estado: EstadoSesion; termino: boolean } {
  if (estado.descansoRestante === null) return { estado, termino: false };

  const restante = estado.descansoRestante - 1;
  if (restante > 0) return { estado: { ...estado, descansoRestante: restante }, termino: false };

  return { estado: { ...estado, descansoRestante: null }, termino: true };
}

/** Suma (o resta) segundos al descanso en curso. */
export function ajustarDescanso(estado: EstadoSesion, segundos: number): EstadoSesion {
  if (estado.descansoRestante === null) return estado;
  const restante = estado.descansoRestante + segundos;
  return { ...estado, descansoRestante: restante > 0 ? restante : null };
}

export function saltarDescanso(estado: EstadoSesion): EstadoSesion {
  return { ...estado, descansoRestante: null };
}

/** Cuántas series de la sesión ya se cerraron, y cuántas hay. */
export function progreso(estado: EstadoSesion): { hechas: number; total: number } {
  let hechas = 0;
  let total = 0;
  for (const ejercicio of estado.ejercicios) {
    for (const serie of ejercicio.series) {
      total += 1;
      if (serie.hechas !== null) hechas += 1;
    }
  }
  return { hechas, total };
}

/** "1:30" — el descanso se lee en minutos y segundos, no en 90. */
export function formatoReloj(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

/**
 * El volumen levantado hasta ahora, en kilos.
 *
 * Las series de calentamiento no cuentan: son parte de la sesión pero no del
 * trabajo, y sumarlas infla el número que después se compara semana a semana.
 */
export function volumenKg(estado: EstadoSesion): number {
  let total = 0;
  for (const ejercicio of estado.ejercicios) {
    for (const serie of ejercicio.series) {
      if (serie.calentamiento || serie.hechas === null || serie.pesoKg === null) continue;
      total += serie.hechas * serie.pesoKg;
    }
  }
  return Math.round(total);
}
