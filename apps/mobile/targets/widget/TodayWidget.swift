import SwiftUI
import WidgetKit

/**
 * Widget 2 — Hoy toca (`systemMedium`). Izquierda: grupo muscular del día
 * (o "Descanso") + nº de ejercicios + esquema, con marca de "Hecho" en
 * champán si la sesión ya se completó. Derecha: la racha compacta.
 */

struct TodayEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), data: WidgetData.load())
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), data: WidgetData.load())
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct TodayWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        let data = entry.data
        if data.isEmpty {
            EmptyWidgetView(message: "Abre Holy Gains para ver tu día")
        } else {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    EyebrowLabel(text: "Hoy toca")

                    Text(data.hoyGrupo ?? "Descanso")
                        .font(.system(.title3, design: .serif))
                        .foregroundStyle(HGColor.marfil)
                        .lineLimit(1)

                    if let ejercicios = data.hoyEjercicios, let esquema = data.hoyEsquema {
                        Text("\(ejercicios) ejercicios · \(esquema)")
                            .font(.system(size: 12))
                            .foregroundStyle(HGColor.paloRosaLight)
                            .lineLimit(2)
                    }

                    if data.hoyHecho {
                        Text("HECHO")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(1)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(HGColor.champan.opacity(0.2))
                            .foregroundStyle(HGColor.champan)
                            .clipShape(Capsule())
                    }
                }

                Spacer()

                if let racha = data.racha {
                    VStack(spacing: 2) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(HGColor.champan)
                        Text("\(racha)")
                            .font(.system(.title3, design: .serif))
                            .foregroundStyle(HGColor.marfil)
                        Text(racha == 1 ? "día" : "días")
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(HGColor.paloRosa)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(for: .widget) {
                LinearGradient(
                    colors: [HGColor.guinda.opacity(0.35), HGColor.obsidiana],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

struct TodayWidget: Widget {
    let kind: String = "today_widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Hoy toca")
        .description("Tu entrenamiento de hoy y tu racha.")
        .supportedFamilies([.systemMedium])
    }
}
