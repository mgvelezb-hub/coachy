import WidgetKit
import SwiftUI

/**
 * Un solo target de WidgetKit para Holy Gains con 3 widgets:
 * Racha (small), Hoy toca (medium) y Tu siguiente comida (medium).
 * Cada uno es su propio `Widget` (kind independiente) para poder mostrar
 * contenido distinto — no son la misma vista redimensionada.
 */
@main
struct HolyGainsWidgets: WidgetBundle {
    var body: some Widget {
        StreakWidget()
        TodayWidget()
        MealWidget()
    }
}
