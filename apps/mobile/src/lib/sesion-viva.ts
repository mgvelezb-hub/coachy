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
  /**
   * A qué se puede cambiar si la máquina está ocupada. Viaja con la sesión
   * —y por lo tanto al teléfono— para que el cambio funcione sin señal.
   *
   * El tipo se declara estructural y no importado: este módulo es puro y no
   * conoce el cliente de la API.
   */
  alternativas?: Array<{
    exerciseId: string;
    name: string;
    declared: boolean;
    videoPath: string | null;
  }>;
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
  /**
   * Cuándo termina el descanso, en milisegundos epoch. `null` = no descansa.
   *
   * Es una HORA y no un contador de segundos a propósito. Antes se restaba un
   * segundo por tick, y iOS congela los timers cuando la app se va al fondo:
   * quien contestaba un mensaje a media serie volvía con el descanso parado
   * en el segundo en que salió, marcando un minuto que ya había pasado. Una
   * hora de término se lee igual de bien después de cinco minutos en el
   * fondo, con la pantalla apagada o tras un reinicio de la pantalla.
   */
  descansoHasta: number | null;
  /** La sesión ya no tiene series pendientes. */
  terminada: boolean;
};

export function estadoInicial(ejercicios: EjercicioVivo[]): EstadoSesion {
  const primera = primeraPendiente(ejercicios);
  return {
    ejercicios,
    ejercicioActual: primera?.ejercicio ?? 0,
    serieActual: primera?.serie ?? 0,
    descansoHasta: null,
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
  ahora: number = Date.now(),
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
      estado: { ...estado, ejercicios, descansoHasta: null, terminada: true },
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
      // La última serie de un ejercicio TAMBIÉN descansa.
      //
      // Antes no: se asumía que el traslado a la otra máquina ya era el
      // descanso. En el gimnasio no se cumple —la otra máquina suele estar a
      // diez pasos— y quien acababa una serie pesada arrancaba la siguiente
      // sin nada de por medio, o se quedaba mirando el teléfono sin saber
      // cuánto llevaba parado. Si el traslado ya fue suficiente está el botón
      // "Ya estoy", que cuesta un toque; adivinar por la persona costaba una
      // serie mal descansada.
      descansoHasta: descanso > 0 ? ahora + descanso * 1000 : null,
      terminada: false,
    },
    siguiente: cambiaEjercicio ? "otro_ejercicio" : "descanso",
  };
}

/**
 * Corrige una serie YA cerrada: los kilos que no se anotaron, o las reps que
 * salieron mal.
 *
 * Existe porque cerrar una serie sin peso no tenía vuelta atrás: la serie
 * quedaba capturada en cero y la única salida era rehacer la sesión. Aquí no
 * se mueve el cursor —quien corrige la serie 2 sigue en la 4— ni se toca el
 * descanso en curso.
 */
export function editarSerie(
  estado: EstadoSesion,
  ejercicioIndice: number,
  serieIndice: number,
  valores: { reps: number; pesoKg: number | null },
): EstadoSesion {
  return {
    ...estado,
    ejercicios: estado.ejercicios.map((ejercicio, e) =>
      e !== ejercicioIndice
        ? ejercicio
        : {
            ...ejercicio,
            series: ejercicio.series.map((serie, s) =>
              s !== serieIndice ? serie : { ...serie, hechas: valores.reps, pesoKg: valores.pesoKg },
            ),
          },
    ),
  };
}

/**
 * Segundos que faltan de descanso ahora mismo. `null` si no está descansando.
 *
 * Se calcula contra el reloj, no contra un contador: es lo que hace que el
 * descanso siga corriendo con la app en el fondo o la pantalla apagada.
 */
export function restanteSeg(estado: EstadoSesion, ahora: number = Date.now()): number | null {
  if (estado.descansoHasta === null) return null;
  const restante = Math.ceil((estado.descansoHasta - ahora) / 1000);
  return restante > 0 ? restante : 0;
}

/** El descanso ya se agotó (llegó a cero) pero sigue marcado como en curso. */
export function descansoTermino(estado: EstadoSesion, ahora: number = Date.now()): boolean {
  return estado.descansoHasta !== null && ahora >= estado.descansoHasta;
}

/** Apaga el descanso agotado. Se llama al detectar que llegó a cero. */
export function cerrarDescanso(estado: EstadoSesion): EstadoSesion {
  return { ...estado, descansoHasta: null };
}

/** Suma (o resta) segundos al descanso en curso, moviendo su hora de término. */
export function ajustarDescanso(
  estado: EstadoSesion,
  segundos: number,
  ahora: number = Date.now(),
): EstadoSesion {
  if (estado.descansoHasta === null) return estado;
  const hasta = estado.descansoHasta + segundos * 1000;
  return { ...estado, descansoHasta: hasta > ahora ? hasta : null };
}

export function saltarDescanso(estado: EstadoSesion): EstadoSesion {
  return { ...estado, descansoHasta: null };
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
