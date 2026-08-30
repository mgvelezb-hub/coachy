/**
 * Una sesión que se mide en tiempo, no en series — lógica PURA.
 *
 * El gimnasio se cuenta en series y repeticiones; nadar, boxear o jugar squash
 * se cuentan en tramos y minutos. Esta es la máquina de eso: arranca un
 * cronómetro, marca cuándo empieza y termina cada tramo, y deja el intervalo
 * de cada uno anotado para poder preguntarle al reloj qué pulso hubo ahí.
 *
 * Dos decisiones que la separan de la de pesas:
 *
 * - **El tiempo se mide, no se declara.** En pesas el plan dice cuántas
 *   repeticiones van; aquí lo que interesa es cuánto duró de verdad, porque es
 *   el único dato honesto cuando el plan dice "400 m suaves" y la alberca está
 *   llena.
 * - **Los tramos se cierran, no se cronometran aparte.** Un cronómetro por
 *   bloque obliga a acordarse de iniciarlo; el tramo empieza donde terminó el
 *   anterior, que es como pasa en el agua.
 *
 * Sin `Date.now()` adentro: los instantes entran como parámetro, para que la
 * máquina se pueda probar sin reloj.
 */

export type TramoPlan = {
  /** "Calentamiento", "Principal"... o "Bloque 1" si la disciplina no trae plan. */
  titulo: string;
  /** Cómo se lee: "4 × 50 m". Vacío cuando el tramo es libre. */
  detalle: string;
};

export type TramoHecho = {
  titulo: string;
  detalle: string;
  /** Milisegundos desde el inicio de la sesión en que empezó y terminó. */
  desdeMs: number;
  hastaMs: number;
};

export type EstadoLibre = {
  /** Instante en que arrancó la sesión, en ms epoch. `null` = no ha empezado. */
  inicioMs: number | null;
  /** Suma de lo transcurrido antes de la pausa en curso. */
  acumuladoMs: number;
  /** Instante en que se reanudó por última vez. `null` = en pausa. */
  corriendoDesdeMs: number | null;
  /** Los tramos que faltan, en orden. */
  pendientes: TramoPlan[];
  /** Los que ya se cerraron, con su intervalo. */
  hechos: TramoHecho[];
  terminada: boolean;
};

export function estadoInicialLibre(tramos: TramoPlan[]): EstadoLibre {
  return {
    inicioMs: null,
    acumuladoMs: 0,
    corriendoDesdeMs: null,
    pendientes: tramos,
    hechos: [],
    terminada: false,
  };
}

/** Arranca la sesión. El instante entra como dato para poder probarlo. */
export function iniciar(estado: EstadoLibre, ahoraMs: number): EstadoLibre {
  if (estado.inicioMs !== null) return estado;
  return { ...estado, inicioMs: ahoraMs, corriendoDesdeMs: ahoraMs };
}

/**
 * Cuánto lleva corriendo la sesión.
 *
 * El acumulado se guarda aparte del instante de reanudación para que las
 * pausas no se cuenten: sin eso, dejar el teléfono en la banca durante una
 * llamada infla la duración de la sesión.
 */
export function transcurridoMs(estado: EstadoLibre, ahoraMs: number): number {
  if (estado.corriendoDesdeMs === null) return estado.acumuladoMs;
  return estado.acumuladoMs + (ahoraMs - estado.corriendoDesdeMs);
}

export function pausar(estado: EstadoLibre, ahoraMs: number): EstadoLibre {
  if (estado.corriendoDesdeMs === null) return estado;
  return {
    ...estado,
    acumuladoMs: transcurridoMs(estado, ahoraMs),
    corriendoDesdeMs: null,
  };
}

export function reanudar(estado: EstadoLibre, ahoraMs: number): EstadoLibre {
  if (estado.corriendoDesdeMs !== null || estado.inicioMs === null) return estado;
  return { ...estado, corriendoDesdeMs: ahoraMs };
}

/**
 * Cierra el tramo en curso.
 *
 * El tramo va desde donde terminó el anterior hasta ahora: no hay un
 * cronómetro por bloque que haya que acordarse de arrancar.
 */
export function cerrarTramo(
  estado: EstadoLibre,
  ahoraMs: number,
): { estado: EstadoLibre; termino: boolean } {
  const tramo = estado.pendientes[0];
  if (estado.inicioMs === null || !tramo) return { estado, termino: false };

  const hasta = transcurridoMs(estado, ahoraMs);
  const desde = estado.hechos[estado.hechos.length - 1]?.hastaMs ?? 0;

  const pendientes = estado.pendientes.slice(1);
  const hechos = [
    ...estado.hechos,
    { titulo: tramo.titulo, detalle: tramo.detalle, desdeMs: desde, hastaMs: hasta },
  ];

  return {
    estado: { ...estado, pendientes, hechos, terminada: pendientes.length === 0 },
    termino: pendientes.length === 0,
  };
}

/**
 * El intervalo real de un tramo, para preguntarle al reloj.
 *
 * Los tramos se guardan como milisegundos desde el arranque —eso es lo que la
 * máquina sabe sin reloj— y aquí se traducen a fechas, que es lo que HealthKit
 * entiende. Las pausas quedan dentro del intervalo a propósito: el pulso de
 * una pausa también dice algo, y recortarla exigiría llevar el registro de
 * cada pausa por separado para ganar muy poco.
 */
export function intervaloDe(
  estado: EstadoLibre,
  tramo: TramoHecho,
): { desde: Date; hasta: Date } | null {
  if (estado.inicioMs === null) return null;
  return {
    desde: new Date(estado.inicioMs + tramo.desdeMs),
    hasta: new Date(estado.inicioMs + tramo.hastaMs),
  };
}

/** "12:04" — el cronómetro de una sesión se lee en minutos y segundos. */
export function cronometro(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

/** Minutos redondeados, que es como se registra una actividad. */
export function minutosDe(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}
