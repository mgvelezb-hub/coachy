/**
 * Target de widgets de iOS (WidgetKit) para Holy Gains.
 *
 * Un solo target ("widget"), tres widgets dentro de un mismo WidgetBundle
 * (ver index.swift): Racha (systemSmall), Hoy toca (systemMedium) y
 * Tu siguiente comida (systemMedium). No hace red — solo lee lo que la app
 * ya escribió en el App Group vía `src/lib/widget.ts`.
 *
 * El App Group se espeja desde `app.json` (`ios.entitlements`) para no
 * repetir el identificador en dos lugares.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "widget",
  name: "widget",
  displayName: "Holy Gains",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit"],
  colors: {
    $accent: "#C9A961",
    $widgetBackground: "#1A0F12",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
