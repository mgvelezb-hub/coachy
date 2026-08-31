/**
 * Horarios de comida propios, con candados.
 *
 * EL PROBLEMA: el motor reparte los macros por tiempo de comida y le pone a
 * cada uno una hora sugerida ("07:00 pre-entreno", "14:00 comida"), sacada de
 * una jornada estándar. Quien entra a las 6, come a las 4 o entrena de noche
 * veía horas que no iba a cumplir — y un horario que no se cumple no es un
 * plan, es un adorno que además dispara recordatorios a deshoras.
 *
 * LOS CANDADOS existen porque mover horas SÍ tiene consecuencias fisiológicas
 * y la app no puede fingir que da lo mismo:
 *
 *  - **Orden.** Los tiempos van en el orden que el motor decidió. La cena no
 *    puede quedar antes de la comida: el reparto de carbohidratos del día
 *    asume esa secuencia.
 *  - **Separación mínima.** Dos comidas pegadas no se digieren como dos: se
 *    vuelven una sola con el doble de volumen. 90 minutos es el piso.
 *  - **Ventana del día.** Nada antes de las 04:00 ni después de las 23:59.
 *  - **Post-entreno.** Se puede mover, pero la app avisa: su razón de ser es
 *    caer cerca del entrenamiento, y arrastrarlo cuatro horas lo convierte en
 *    una comida más.
 *
 * El resultado de validar NUNCA es un "no" seco: cuando algo no cabe se
 * devuelve el motivo en palabras, para que la pantalla lo diga.
 *
 * Módulo puro: no sabe de Prisma ni de HTTP, así que se prueba sin base.
 */

/** `"07:30"` → minutos desde medianoche. `null` si no es una hora válida. */
export function minutosDeHora(hora: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutos desde medianoche → `"07:30"`. */
export function horaDeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Los minutos mínimos entre dos tiempos de comida seguidos. */
export const SEPARACION_MINIMA_MIN = 90;
/** Nada antes de esta hora: madrugada no es desayuno temprano. */
export const HORA_MINIMA_MIN = 4 * 60;
/** Nada después: comer a medianoche pelea con el sueño, que es donde se repara. */
export const HORA_MAXIMA_MIN = 23 * 60 + 59;

export interface TiempoDeComida {
  /** `DESAYUNO`, `PRE`, `POST`, `COMIDA`, `SNACK`, `CENA`. */
  slot: string;
  label: string;
  /** La hora que rige hoy: la propia si la movió, la del motor si no. */
  hora: string;
  /** true si esta hora la eligió la persona, no el motor. */
  propia: boolean;
}

export interface ValidacionHorarios {
  ok: boolean;
  /** Por qué no se puede guardar, en palabras. Vacío si `ok`. */
  errores: string[];
  /** Se puede guardar, pero conviene saberlo. */
  avisos: string[];
}

/**
 * Revisa un horario completo (todos los tiempos del día, en el orden del
 * motor) contra los candados. `slots` viene ordenado como el menú.
 */
export function validaHorarios(tiempos: TiempoDeComida[]): ValidacionHorarios {
  const errores: string[] = [];
  const avisos: string[] = [];

  const minutos: number[] = [];
  for (const tiempo of tiempos) {
    const valor = minutosDeHora(tiempo.hora);
    if (valor === null) {
      errores.push(`La hora de ${tiempo.label} no se entiende: usa formato 24 horas, como 14:30.`);
      continue;
    }
    if (valor < HORA_MINIMA_MIN || valor > HORA_MAXIMA_MIN) {
      errores.push(
        `${tiempo.label} queda fuera del día: pon una hora entre las ${horaDeMinutos(HORA_MINIMA_MIN)} y las ${horaDeMinutos(HORA_MAXIMA_MIN)}.`,
      );
    }
    minutos.push(valor);
  }

  if (errores.length > 0) return { ok: false, errores, avisos };

  for (let i = 1; i < minutos.length; i += 1) {
    const previo = minutos[i - 1]!;
    const actual = minutos[i]!;
    const anterior = tiempos[i - 1]!;
    const tiempo = tiempos[i]!;

    if (actual <= previo) {
      errores.push(
        `${tiempo.label} no puede ser antes que ${anterior.label}: el reparto del día sigue ese orden.`,
      );
      continue;
    }

    if (actual - previo < SEPARACION_MINIMA_MIN) {
      errores.push(
        `Entre ${anterior.label} y ${tiempo.label} hay menos de ${SEPARACION_MINIMA_MIN} minutos: tan pegadas se vuelven una sola comida del doble de volumen.`,
      );
      continue;
    }

    // El post-entreno existe para caer cerca del entrenamiento. Alejarlo se
    // permite —hay quien no puede comer al salir— pero se dice.
    if (tiempo.slot === "POST" && anterior.slot === "PRE" && actual - previo > 5 * 60) {
      avisos.push(
        "Tu post-entreno quedó a más de 5 horas del pre: a esa distancia deja de ser recuperación y cuenta como una comida más.",
      );
    }
  }

  const primero = minutos[0];
  const ultimo = minutos[minutos.length - 1];
  if (primero !== undefined && ultimo !== undefined && ultimo - primero > 16 * 60) {
    avisos.push(
      "Tus comidas abarcan más de 16 horas del día. Se puede, pero deja poco margen entre la última y dormir.",
    );
  }

  return { ok: errores.length === 0, errores, avisos };
}

/** El mapa `{slot: "HH:MM"}` que se guarda, ya limpio de horas inválidas. */
export function normalizaHorarios(entrada: Record<string, string>): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [slot, hora] of Object.entries(entrada)) {
    const minutos = minutosDeHora(hora);
    if (minutos === null) continue;
    salida[slot] = horaDeMinutos(minutos);
  }
  return salida;
}

/** Lee el `Json` del perfil sin confiar en su forma. */
export function parseMealTimes(json: unknown): Record<string, string> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};
  const salida: Record<string, string> = {};
  for (const [slot, valor] of Object.entries(json as Record<string, unknown>)) {
    if (typeof valor !== "string") continue;
    const minutos = minutosDeHora(valor);
    if (minutos === null) continue;
    salida[slot] = horaDeMinutos(minutos);
  }
  return salida;
}
