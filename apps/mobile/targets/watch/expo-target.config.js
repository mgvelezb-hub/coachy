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
 * **Sin HealthKit todavía**: el reloj graba movimiento con CoreMotion para
 * poder calibrar el conteo de repeticiones, y eso no necesita permisos de
 * salud. Pedir la capacidad antes de usarla solo complica el aprovisionamiento.
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
  frameworks: ["SwiftUI", "WatchConnectivity", "CoreMotion"],
  colors: {
    $accent: "#C9A961",
  },
});
