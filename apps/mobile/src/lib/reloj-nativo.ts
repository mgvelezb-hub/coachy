import { requireOptionalNativeModule } from "expo";

/**
 * Puente con el Apple Watch — la cara de JavaScript.
 *
 * El código Swift vive en `modules/reloj/`, pero esto no se importa desde ahí:
 * el módulo se pide **por su nombre registrado** (`Reloj`), que es como los
 * módulos nativos de Expo se resuelven. Así no hace falta alias de rutas ni en
 * TypeScript ni en Metro para un solo archivo.
 *
 * `requireOptionalNativeModule` y no `requireNativeModule`: en Android, en web
 * y en cualquier build donde el módulo todavía no entró al proyecto nativo,
 * esto devuelve `null` en vez de reventar al importar. Toda la app puede
 * llamar a estas funciones sin preguntar antes en qué plataforma corre; sin
 * reloj, no pasa nada.
 */

/**
 * Lo que devuelve suscribirse a un evento. Se declara aquí en vez de importar
 * `EventSubscription`: ese tipo vive en `expo-modules-core`, que en este
 * monorepo con pnpm no es dependencia directa de la app, y para un objeto con
 * un solo método no vale la pena agregarla.
 */
type Suscripcion = { remove(): void };

type NativoReloj = {
  estado(): EstadoReloj;
  enviarSesion(json: string): boolean;
  enviarResumen(json: string): boolean;
  drenar(): string[];
  addListener(evento: "onSerieCerrada", oyente: () => void): Suscripcion;
};

export type EstadoReloj = {
  /** El teléfono puede hablar con relojes (falso en iPad, Android y web). */
  soportado: boolean;
  /** Hay un Apple Watch emparejado con este teléfono. */
  emparejado: boolean;
  /** Ese reloj tiene instalada la app de Holy Gains. */
  appInstalada: boolean;
  /** El reloj está al alcance ahora mismo. */
  alcanzable: boolean;
};

const SIN_RELOJ: EstadoReloj = {
  soportado: false,
  emparejado: false,
  appInstalada: false,
  alcanzable: false,
};

const nativo = requireOptionalNativeModule<NativoReloj>("Reloj");

export function estadoDelReloj(): EstadoReloj {
  return nativo?.estado() ?? SIN_RELOJ;
}

/** ¿Vale la pena enseñar algo del reloj en la interfaz? */
export function hayRelojUtil(): boolean {
  const estado = estadoDelReloj();
  return estado.soportado && estado.emparejado && estado.appInstalada;
}

/**
 * Manda el estado de la sesión a la muñeca. Devuelve `false` si no había a
 * quién mandárselo, que no es un error: es la mayoría de los usuarios.
 */
export function enviarSesionAlReloj(sesion: unknown): boolean {
  if (!nativo) return false;
  try {
    return nativo.enviarSesion(JSON.stringify(sesion));
  } catch {
    return false;
  }
}

/**
 * Recoge y borra lo que el reloj mandó mientras nadie miraba.
 *
 * Se llama al abrir la sesión en vivo y cada vez que llega el aviso. Lo que
 * no se pueda leer se tira en silencio: una serie con formato roto no debe
 * impedir que se lean las buenas.
 */
export function drenarSeriesCerradas<T>(): T[] {
  if (!nativo) return [];
  const crudas = nativo.drenar();
  const salida: T[] = [];
  for (const cruda of crudas) {
    try {
      salida.push(JSON.parse(cruda) as T);
    } catch {
      continue;
    }
  }
  return salida;
}

/**
 * Lo que el reloj enseña cuando NO hay sesión abierta.
 *
 * Es el mismo puñado de datos que alimenta el widget del teléfono, y por la
 * misma razón: son las cosas que se miran de reojo y no valen sacar nada del
 * bolsillo. Qué toca hoy, cuál es la siguiente comida y cómo va la racha.
 */
export type ResumenParaReloj = {
  /** "Pierna", "Natación", "Descanso". */
  hoy: string;
  /** Cuántos ejercicios trae la sesión de hoy, si trae. */
  ejercicios: number | null;
  /** La sesión de hoy ya se cerró. */
  hecho: boolean;
  /** "Comida 2". `null` si ya no queda ninguna hoy. */
  comida: string | null;
  /** "14:00". */
  comidaHora: string | null;
  racha: number;
};

/** Manda el resumen del día. Va por el mismo canal que la sesión. */
export function enviarResumenAlReloj(resumen: ResumenParaReloj): boolean {
  if (!nativo) return false;
  try {
    return nativo.enviarResumen(JSON.stringify(resumen));
  } catch {
    return false;
  }
}

/** Avisa que hay algo nuevo que recoger. No trae los datos: llama a drenar. */
export function alCerrarSerieEnElReloj(oyente: () => void): Suscripcion | null {
  return nativo?.addListener("onSerieCerrada", oyente) ?? null;
}
