import SwiftUI
import WidgetKit

/**
 * Widget 1 — Racha (`systemSmall`). El gancho del hábito: llama + número
 * grande de días + "días seguidos".
 */

struct StreakEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), data: WidgetData.load())
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        completion(StreakEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let entry = StreakEntry(date: Date(), data: WidgetData.load())
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct StreakWidgetView: View {
    let entry: StreakEntry

    var body: some View {
        if let racha = entry.data.racha {
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(HGColor.champan)

                Spacer()

                Text("\(racha)")
                    .font(.system(.title, design: .serif))
                    .fontWeight(.semibold)
                    .foregroundStyle(HGColor.marfil)

                EyebrowLabel(text: racha == 1 ? "día seguido" : "días seguidos")
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .containerBackground(HGColor.obsidiana, for: .widget)
        } else {
            EmptyWidgetView(message: "Abre Holy Gains para ver tu racha")
        }
    }
}

struct StreakWidget: Widget {
    let kind: String = "streak_widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StreakWidgetView(entry: entry)
        }
        .configurationDisplayName("Racha")
        .description("Tu racha de días activos en Holy Gains.")
        .supportedFamilies([.systemSmall])
    }
}
