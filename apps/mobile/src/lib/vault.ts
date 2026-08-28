import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * La cerradura de las fotos.
 *
 * Qué protege y qué no: es una cerradura **del teléfono**, para que quien
 * agarre tu celular desbloqueado no abra tus fotos de progreso de un toque.
 * No es una segunda autenticación contra el servidor —el servidor sigue
 * confiando en tu sesión— y por eso la clave nunca sale de aquí ni viaja a
 * ningún lado.
 *
 * Cómo se guarda: **nunca la clave**, solo su hash SHA-256 con una sal
 * aleatoria por instalación, y todo eso dentro de SecureStore (Keychain en
 * iOS). Aunque alguien lea el almacenamiento, no hay clave que leer.
 *
 * Por qué es distinta a la del teléfono: si fuera la misma, quien ya te
 * desbloqueó el teléfono —que es justo el escenario del que te quieres
 * cuidar— ya la sabría. Face ID sí se acepta como atajo porque no es un
 * secreto compartido: es tu cara, y el sistema la verifica sin revelarla.
 */

const PIN_HASH_KEY = "holygains:vault:pinHash";
const PIN_SALT_KEY = "holygains:vault:pinSalt";
const BIOMETRICS_KEY = "holygains:vault:biometrics";

/** Cuatro dígitos como piso: menos que eso no es una clave. */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/** ¿Ya hay una clave configurada en esta instalación? */
export async function hasPin(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_HASH_KEY).catch(() => null);
  return stored !== null;
}

/**
 * Crea o reemplaza la clave.
 *
 * Cambiarla no pide la anterior a propósito: quien llega hasta Ajustes ya
 * entró a tu sesión, así que pedirla ahí daría una sensación de seguridad que
 * no existe. La cerradura es contra el vistazo ajeno, no contra ti.
 */
export async function setPin(pin: string): Promise<void> {
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) {
    throw new Error(`La clave va de ${MIN_PIN_LENGTH} a ${MAX_PIN_LENGTH} dígitos.`);
  }

  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);

  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
}

/** Quita la clave y apaga la biometría: la bóveda queda abierta. */
export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(PIN_SALT_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(BIOMETRICS_KEY).catch(() => {});
}

/** `true` si la clave coincide. Nunca dice cuál era, ni cuántos dígitos tenía. */
export async function verifyPin(pin: string): Promise<boolean> {
  const [hash, salt] = await Promise.all([
    SecureStore.getItemAsync(PIN_HASH_KEY).catch(() => null),
    SecureStore.getItemAsync(PIN_SALT_KEY).catch(() => null),
  ]);
  if (!hash || !salt) return false;

  return (await hashPin(pin, salt)) === hash;
}

// ---------------------------------------------------------------------------
// Face ID / Touch ID
// ---------------------------------------------------------------------------

/** Qué puede ofrecer este teléfono: cara, huella, o nada. */
export async function biometricsAvailable(): Promise<"facial" | "huella" | null> {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync().catch(() => false),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
    LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
  ]);
  if (!hardware || !enrolled) return null;

  return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ? "facial"
    : "huella";
}

export async function biometricsEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(BIOMETRICS_KEY).catch(() => null);
  return value === "1";
}

/** Prender la biometría exige que ya exista clave: es el atajo, no el candado. */
export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  if (enabled && !(await hasPin())) {
    throw new Error("Primero crea tu clave: Face ID entra como atajo, no como única llave.");
  }
  await SecureStore.setItemAsync(BIOMETRICS_KEY, enabled ? "1" : "0");
}

/**
 * Pide la cara o la huella. `false` cuando no se pudo o la persona canceló —
 * ahí la pantalla cae a la clave, que siempre existe.
 */
export async function promptBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquea tus fotos",
      cancelLabel: "Usar clave",
      // Sin esto iOS ofrece el código del teléfono como respaldo, que es justo
      // la llave que NO queremos aceptar aquí.
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
