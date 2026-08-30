import SwiftUI
import WidgetKit

/**
 Complicaciones de Holy Gains.

 **Contrato con la app del reloj**: las llaves de abajo tienen que coincidir
 letra por letra con las que escribe `Compartido.guardar` en el target `watch`.
 Son dos procesos distintos que solo se hablan por `UserDefaults` del App
 Group, así que un nombre mal escrito no falla al compilar: se ve como una
 complicación vacía, que es el peor modo de fallar.

 Nada de red. Una complicación se pinta con lo último que la app dejó escrito,
 y la app escribe cada vez que el teléfono le manda el resumen del día.
 */

private let GRUPO = "group.com.holygains.app"

struct Resumen {
    let hoy: String
    let ejercicios: Int?
    let hecho: Bool
    let comida: String?
    let comidaHora: String?
    let racha: Int

    /// Lo que se pinta cuando todavía no hay nada guardado. No dice "vacío":
    /// dice algo que se entiende sin explicación.
    static let vacio = Resumen(
        hoy: "—",
        ejercicios: nil,
        hecho: false,
        comida: nil,
        comidaHora: nil,
        racha: 0
    )

    static func leer() -> Resumen {
        guard let disco = UserDefaults(suiteName: GRUPO),
              let hoy = disco.string(forKey: "reloj.hoy") else {
            return .vacio
        }

        // Los opcionales viajan como cadena vacía y como -1: `UserDefaults` no
        // distingue "no hay valor" de "el valor es cero".
        let ejercicios = disco.integer(forKey: "reloj.ejercicios")
        let comida = disco.string(forKey: "reloj.comida") ?? ""
        let hora = disco.string(forKey: "reloj.comidaHora") ?? ""

        return Resumen(
            hoy: hoy,
            ejercicios: ejercicios >= 0 ? ejercicios : nil,
            hecho: disco.bool(forKey: "reloj.hecho"),
            comida: comida.isEmpty ? nil : comida,
            comidaHora: hora.isEmpty ? nil : hora,
            racha: disco.integer(forKey: "reloj.racha")
        )
    }
}

struct Entrada: TimelineEntry {
    let date: Date
    let resumen: Resumen
}

struct Proveedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada {
        Entrada(date: Date(), resumen: .vacio)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: Date(), resumen: Resumen.leer()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        // Una sola entrada y `.never`: el dato no cambia con el tiempo, cambia
        // cuando el teléfono manda uno nuevo. Pedir refrescos por reloj
        // gastaría el presupuesto de actualizaciones del sistema para repintar
        // exactamente lo mismo.
        completion(Timeline(entries: [Entrada(date: Date(), resumen: Resumen.leer())], policy: .never))
    }
}

/// Qué toca hoy. La pregunta que la carátula puede contestar sin abrir nada.
struct HoyComplicacion: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "holygains.hoy", provider: Proveedor()) { entrada in
            VistaHoy(resumen: entrada.resumen)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Hoy toca")
        .description("El entrenamiento del día.")
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular])
    }
}

struct VistaHoy: View {
    @Environment(\.widgetFamily) private var familia
    let resumen: Resumen

    var body: some View {
        switch familia {
        case .accessoryInline:
            Text(resumen.hecho ? "\(resumen.hoy) ✓" : resumen.hoy)

        case .accessoryCircular:
            // En un círculo de 30 pt no cabe una palabra: cabe un símbolo y un
            // número. El check es la única información que importa cuando ya
            // entrenaste.
            VStack(spacing: 0) {
                Image(systemName: resumen.hecho ? "checkmark" : "dumbbell.fill")
                    .font(.system(size: 14, weight: .semibold))
                if let ejercicios = resumen.ejercicios, !resumen.hecho {
                    Text("\(ejercicios)")
                        .font(.system(size: 12, weight: .medium))
                }
            }

        default:
            VStack(alignment: .leading, spacing: 1) {
                Text(resumen.hoy)
                    .font(.headline)
                    .lineLimit(1)
                if resumen.hecho {
                    Text("Hecho")
                        .font(.caption2)
                } else if let ejercicios = resumen.ejercicios {
                    Text("\(ejercicios) ejercicios")
                        .font(.caption2)
                } else {
                    Text("Descanso")
                        .font(.caption2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// La siguiente comida. Lo que hace que el plan se cumpla es acordarse a tiempo.
struct ComidaComplicacion: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "holygains.comida", provider: Proveedor()) { entrada in
            VistaComida(resumen: entrada.resumen)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Sigue")
        .description("Tu siguiente comida del plan.")
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular])
    }
}

struct VistaComida: View {
    @Environment(\.widgetFamily) private var familia
    let resumen: Resumen

    var body: some View {
        switch familia {
        case .accessoryInline:
            Text(texto)

        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: "fork.knife")
                    .font(.system(size: 13, weight: .semibold))
                if let hora = resumen.comidaHora {
                    Text(hora)
                        .font(.system(size: 10, weight: .medium))
                        .minimumScaleFactor(0.6)
                }
            }

        default:
            VStack(alignment: .leading, spacing: 1) {
                Text(resumen.comida ?? "Sin comidas pendientes")
                    .font(.headline)
                    .lineLimit(1)
                if let hora = resumen.comidaHora {
                    Text(hora)
                        .font(.caption2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var texto: String {
        guard let comida = resumen.comida else { return "Sin comidas pendientes" }
        guard let hora = resumen.comidaHora else { return comida }
        return "\(comida) · \(hora)"
    }
}

@main
struct ComplicacionesHolyGains: WidgetBundle {
    var body: some Widget {
        HoyComplicacion()
        ComidaComplicacion()
    }
}
