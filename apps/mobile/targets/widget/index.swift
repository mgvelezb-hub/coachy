import WidgetKit
import SwiftUI

/**
 * Un solo target de WidgetKit para Holy Gains.
 *
 * En la pantalla de inicio: Racha (small), Hoy toca (medium) y Tu siguiente
 * comida (medium). Cada uno es su propio `Widget` (kind independiente) para
 * mostrar contenido distinto — no son la misma vista redimensionada.
 *
 * En la pantalla de bloqueo y StandBy (agregados el 30/08): círculo con la
 * racha, rectángulo con la sesión y la próxima comida, y una línea sobre el
 * reloj. Es donde se mira el teléfono decenas de veces al día sin
 * desbloquearlo, que era justamente lo que faltaba cubrir.
 *
 * Todos leen el mismo App Group que escribe `src/lib/widget.ts`: una sola
 * fuente de verdad, sin una segunda sincronización que se pueda desfasar.
 */
@main
struct HolyGainsWidgets: WidgetBundle {
    var body: some Widget {
        StreakWidget()
        TodayWidget()
        MealWidget()
        LockStreakWidget()
        LockTodayWidget()
        LockInlineWidget()
    }
}
