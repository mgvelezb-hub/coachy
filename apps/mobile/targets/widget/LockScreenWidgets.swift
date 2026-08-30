import SwiftUI
import WidgetKit

/**
 * Widgets de pantalla de bloqueo (familias `accessory*`).
 *
 * Cuando se diseñaron los tres widgets originales, la pantalla de inicio era
 * el único lugar donde vivían. Estos van donde de verdad se mira el teléfono
 * cien veces al día sin desbloquearlo: la pantalla de bloqueo, y de paso
 * StandBy con el teléfono cargando de lado en la mesa.
 *
 * Leen exactamente los mismos datos del App Group que los demás — no hay una
 * segunda fuente de verdad ni una segunda sincronización que se pueda
 * desfasar.
 *
 * Sin color: en la pantalla de bloqueo iOS renderiza estos widgets en blanco y
 * negro con desenfoque detrás. Pintarlos de guinda no los haría guinda, los
 * haría grises con menos contraste — por eso aquí se trabaja con jerarquía
 * tipográfica y no con la paleta.
 */

// MARK: - Círculo: la racha

struct LockStreakEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct LockStreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> LockStreakEntry {
        LockStreakEntry(date: Date(), data: WidgetData.load())
    }

    func getSnapshot(in context: Context, completion: @escaping (LockStreakEntry) -> Void) {
        completion(LockStreakEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LockStreakEntry>) -> Void) {
        let entry = LockStreakEntry(date: Date(), data: WidgetData.load())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct LockStreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HolyGainsLockStreak", provider: LockStreakProvider()) { entry in
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "flame.fill").font(.caption2)
                    Text("\(entry.data.racha ?? 0)").font(.system(.title3, design: .rounded)).bold()
                }
            }
            .containerBackground(.clear, for: .widget)
            .widgetURL(URL(string: "holygains://resumen"))
        }
        .configurationDisplayName("Racha")
        .description("Los días seguidos, en tu pantalla de bloqueo.")
        .supportedFamilies([.accessoryCircular])
    }
}

// MARK: - Rectángulo: lo que toca hoy

struct LockTodayEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct LockTodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> LockTodayEntry {
        LockTodayEntry(date: Date(), data: WidgetData.load())
    }

    func getSnapshot(in context: Context, completion: @escaping (LockTodayEntry) -> Void) {
        completion(LockTodayEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LockTodayEntry>) -> Void) {
        let entry = LockTodayEntry(date: Date(), data: WidgetData.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct LockTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HolyGainsLockToday", provider: LockTodayProvider()) { entry in
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.data.hoyHecho ? "HOY · HECHO" : "HOY TOCA")
                    .font(.caption2)
                    .widgetAccentable()

                Text(entry.data.hoyGrupo ?? "Descanso")
                    .font(.headline)
                    .lineLimit(1)

                // La comida siguiente comparte renglón porque en la pantalla
                // de bloqueo el espacio se paga caro: dos datos que se miran
                // de reojo valen más que uno con aire.
                if let comida = entry.data.comidaLabel, let hora = entry.data.comidaHora {
                    Text("\(comida) · \(hora)").font(.caption2).lineLimit(1)
                } else if let ejercicios = entry.data.hoyEjercicios {
                    Text("\(ejercicios) ejercicios").font(.caption2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .containerBackground(.clear, for: .widget)
            .widgetURL(URL(string: "holygains://rutinas"))
        }
        .configurationDisplayName("Hoy toca")
        .description("Tu sesión y tu siguiente comida, sin desbloquear.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Línea: para la esfera del reloj de la pantalla de bloqueo

struct LockInlineWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HolyGainsLockInline", provider: LockTodayProvider()) { entry in
            Text(entry.data.hoyGrupo.map { "Hoy: \($0)" } ?? "Hoy: descanso")
                .containerBackground(.clear, for: .widget)
                .widgetURL(URL(string: "holygains://rutinas"))
        }
        .configurationDisplayName("Hoy, en una línea")
        .description("Una línea arriba del reloj.")
        .supportedFamilies([.accessoryInline])
    }
}
