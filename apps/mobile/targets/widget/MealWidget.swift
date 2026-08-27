import SwiftUI
import WidgetKit

/**
 * Widget 3 — Tu siguiente comida (`systemMedium`). Nombre del tiempo
 * (Pre-entreno / Comida / Cena…), su hora, y 2-3 alimentos con sus gramos.
 * La app ya elige el tiempo correcto según la hora actual antes de
 * escribirlo (`pickNextMeal` en `src/lib/widget.ts`) — el widget solo pinta.
 */

struct MealEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct MealProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealEntry {
        MealEntry(date: Date(), data: WidgetData.load())
    }

    func getSnapshot(in context: Context, completion: @escaping (MealEntry) -> Void) {
        completion(MealEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MealEntry>) -> Void) {
        let entry = MealEntry(date: Date(), data: WidgetData.load())
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct MealWidgetView: View {
    let entry: MealEntry

    var body: some View {
        let data = entry.data
        if let label = data.comidaLabel {
            VStack(alignment: .leading, spacing: 8) {
                EyebrowLabel(text: "Tu siguiente comida")

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(label)
                        .font(.system(.title3, design: .serif))
                        .foregroundStyle(HGColor.marfil)
                        .lineLimit(1)

                    if let hora = data.comidaHora {
                        Text(hora)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(HGColor.champan)
                    }
                }

                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(data.comidaItems.prefix(3)), id: \.self) { item in
                        Text("· \(item)")
                            .font(.system(size: 12))
                            .foregroundStyle(HGColor.paloRosaLight)
                            .lineLimit(1)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(HGColor.obsidiana, for: .widget)
        } else {
            EmptyWidgetView(message: "Abre Holy Gains para ver tu siguiente comida")
        }
    }
}

struct MealWidget: Widget {
    let kind: String = "meal_widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MealProvider()) { entry in
            MealWidgetView(entry: entry)
        }
        .configurationDisplayName("Tu siguiente comida")
        .description("El próximo tiempo de comida de tu menú.")
        .supportedFamilies([.systemMedium])
    }
}
