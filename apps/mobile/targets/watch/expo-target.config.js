/**
 * App de watchOS de Holy Gains.
 *
 * Hace una sola cosa y la hace bien: enseñar en qué serie vas y dejar cerrarla
 * desde la muñeca. Entre serie y serie, mirar el reloj cuesta un segundo y
 * sacar el teléfono con las manos ocupadas cuesta media serie.
 *
 * **Sin App Group**: entre iOS y watchOS los sandboxes están separados, así que
 * el truco que comparten la app y el widget aquí no sirve. La conversación va
 * por `WatchConnectivity` (ver `Conectividad.swift`).
 *
 * **Con HealthKit**: no por los datos, sino porque una `HKWorkoutSession` es
 * lo único que impide que watchOS suspenda la app en cuanto bajas el brazo.
 * Los permisos y el modo de fondo `workout-processing` van en `Info.plist`.
 *
 * watchOS 10 como piso: es lo que corren los relojes Series 6 en adelante y lo
 * que permite escribir la pantalla entera en SwiftUI moderno.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "watch",
  name: "watch",
  displayName: "Holy Gains",
  bundleIdentifier: `${config.ios.bundleIdentifier}.watchkitapp`,
  deploymentTarget: "10.0",
  // El mismo ícono de la app. Sin esto el reloj pinta un círculo gris y la
  // app queda invisible entre las demás: en watchOS la lista es una cuadrícula
  // de íconos sin nombre hasta que enfocas uno.
  //
  // La ruta es relativa a ESTA carpeta, no a la raíz del proyecto. Si se
  // equivoca, el plugin no falla: escribe "Skipping icon generation" en medio
  // del prebuild y sigue, y el reloj se queda con el círculo gris.
  icon: "../../assets/images/icon.png",
  frameworks: ["SwiftUI", "WatchConnectivity", "CoreMotion", "HealthKit", "WidgetKit"],
  colors: {
    $accent: "#C9A961",
  },
  entitlements: {
    "com.apple.developer.healthkit": true,
    // El mismo grupo que usa el teléfono, pero el contenedor es otro: vive en
    // el reloj. Sirve para hablarle a la complicación, que es un proceso
    // aparte y no ve la memoria de esta app.
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
