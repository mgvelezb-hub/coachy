/**
 * Complicación de la carátula del reloj.
 *
 * Es el único lugar de todo el producto donde la información llega sin que
 * nadie la vaya a buscar: la carátula se mira cien veces al día. Por eso lo
 * que va aquí no es "todo lo que cabe" sino lo que cambia una decisión en el
 * momento — qué toca hoy y cuál es la siguiente comida.
 *
 * Va embebida en la app del reloj, no en la del teléfono, y lee lo que esa app
 * dejó escrito en el App Group (ver `Compartido.swift` del target `watch`).
 * Una complicación nunca hace red: se pinta con lo último que se guardó.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "watch-widget",
  name: "watch-complicacion",
  displayName: "Holy Gains",
  bundleIdentifier: `${config.ios.bundleIdentifier}.watchkitapp.complicacion`,
  deploymentTarget: "10.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  colors: {
    $accent: "#C9A961",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
