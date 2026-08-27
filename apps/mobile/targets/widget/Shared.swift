import SwiftUI

/**
 * Paleta Holy Gains y lectura de datos compartidos (App Group).
 *
 * El App Group y las llaves de UserDefaults deben coincidir EXACTAMENTE con
 * `src/lib/widget.ts` (constante `APP_GROUP` y las llaves en `WIDGET_KEYS`).
 * Si se agrega/renombra un campo hay que tocar los dos lados.
 */

// MARK: - Paleta

enum HGColor {
    static let obsidiana = Color(hex: 0x1A0F12)
    static let marfil = Color(hex: 0xF5EDE4)
    static let guinda = Color(hex: 0x6B1F2E)
    static let champan = Color(hex: 0xC9A961)
    static let paloRosa = Color(hex: 0xD4A5A5)
    static let paloRosaLight = Color(hex: 0xE8CFCF)
}

extension Color {
    init(hex: UInt32) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(red: red, green: green, blue: blue)
    }
}

// MARK: - Datos compartidos

/** Espejo de `WidgetPayload` (src/lib/widget.ts), ya leído de UserDefaults. */
struct WidgetData {
    static let appGroup = "group.com.holygains.app"

    let racha: Int?
    let mejorRacha: Int?
    let hoyGrupo: String?
    let hoyEjercicios: Int?
    let hoyEsquema: String?
    let hoyHecho: Bool
    let comidaLabel: String?
    let comidaHora: String?
    let comidaItems: [String]

    /** true si la app nunca ha sincronizado nada — activa el estado "sin datos". */
    var isEmpty: Bool {
        racha == nil && hoyGrupo == nil && comidaLabel == nil
    }

    static func load() -> WidgetData {
        let defaults = UserDefaults(suiteName: appGroup)

        let items = (defaults?.string(forKey: "comidaItems") ?? "")
            .split(separator: "|")
            .map { String($0) }
            .filter { !$0.isEmpty }

        return WidgetData(
            racha: defaults?.object(forKey: "racha") as? Int,
            mejorRacha: defaults?.object(forKey: "mejorRacha") as? Int,
            hoyGrupo: defaults?.string(forKey: "hoyGrupo"),
            hoyEjercicios: defaults?.object(forKey: "hoyEjercicios") as? Int,
            hoyEsquema: defaults?.string(forKey: "hoyEsquema"),
            hoyHecho: (defaults?.object(forKey: "hoyHecho") as? Int) == 1,
            comidaLabel: defaults?.string(forKey: "comidaLabel"),
            comidaHora: defaults?.string(forKey: "comidaHora"),
            comidaItems: items
        )
    }
}

// MARK: - Vista de "sin datos", compartida por los 3 widgets

/** Mensaje cálido cuando la app nunca se ha abierto — nunca un cero pelón ni un error. */
struct EmptyWidgetView: View {
    let message: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "flame")
                .font(.system(size: 20))
                .foregroundStyle(HGColor.paloRosa)
            Text(message)
                .font(.system(size: 12))
                .multilineTextAlignment(.center)
                .foregroundStyle(HGColor.paloRosa)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(HGColor.obsidiana, for: .widget)
    }
}

// MARK: - Etiqueta pequeña en mayúsculas con tracking

struct EyebrowLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(HGColor.paloRosa)
    }
}
