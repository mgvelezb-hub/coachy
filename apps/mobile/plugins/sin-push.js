const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Quita `aps-environment` de los entitlements de iOS.
 *
 * `expo-notifications` lo agrega solo al hacer prebuild, porque asume que
 * quien lo instala quiere push desde un servidor. Holy Gains no: el único
 * aviso que manda es el recordatorio del check-in, y ese es una notificación
 * **local** que programa el propio teléfono (ver `src/lib/recordatorio.ts`).
 *
 * Dejarlo puesto no es inofensivo. Una cuenta de desarrollador personal no
 * soporta la capacidad de Push Notifications, así que Xcode se niega a crear
 * el perfil de aprovisionamiento y la app no compila para el teléfono:
 *
 *   error: Personal development teams [...] do not support the Push
 *   Notifications capability.
 *
 * Esto va como plugin y no como una edición a mano del archivo de
 * entitlements porque cada `expo prebuild` lo regenera: arreglarlo a mano
 * significa arreglarlo otra vez cada vez que se toca la configuración nativa,
 * y descubrirlo siempre a media compilación.
 *
 * El día que haya cuenta de pago y push de verdad, se borra este plugin.
 */
module.exports = function sinPush(config) {
  return withEntitlementsPlist(config, (resultado) => {
    delete resultado.modResults["aps-environment"];
    return resultado;
  });
};
