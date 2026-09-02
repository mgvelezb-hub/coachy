import Foundation
import WatchKit

/**
 El descanso entre series, en la muñeca.

 Vivía solo en el teléfono, que es el peor lugar para ponerlo: el descanso es
 exactamente el rato en que el teléfono está en la banca y tú no. Un
 cronómetro que hay que ir a buscar es un cronómetro que nadie mira, y el
 aviso que importa —"ya, súbete otra vez"— llega mejor por un golpe en la
 muñeca que por una pantalla apagada a dos metros.

 Dos reglas que se copian del teléfono a propósito, para que las dos pantallas
 digan lo mismo:

 - Arranca **al cerrar una serie**, nunca a mano. El cronómetro que hay que
   acordarse de iniciar es el que nadie inicia.
 - **Entre ejercicios no cuenta.** Caminar a la otra máquina ya es el descanso;
   un cronómetro corriendo mientras caminas solo sirve para llegar tarde a tu
   propia serie.
 */
final class Descanso: ObservableObject {
    static let shared = Descanso()

    /// Segundos que faltan, o `nil` si no se está descansando.
    @Published private(set) var restante: Int?

    private var reloj: Timer?

    private init() {}

    func arrancar(segundos: Int) {
        guard segundos > 0 else { return }
        restante = segundos
        reprogramar()
    }

    func sumar(_ segundos: Int) {
        guard let actual = restante else { return }
        let nuevo = actual + segundos
        restante = nuevo > 0 ? nuevo : nil
        if restante == nil { detener() }
    }

    func saltar() {
        detener()
        restante = nil
    }

    private func reprogramar() {
        detener()
        let nuevo = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self, let actual = self.restante else { return }

            let siguiente = actual - 1
            if siguiente > 0 {
                self.restante = siguiente
                return
            }

            self.restante = nil
            self.detener()
            // `.start` y no `.notification`: el fin del descanso significa
            // "súbete otra vez", y merece su propia sensación — por rep va
            // `.click`, al llegar al objetivo `.notification`, al cerrar la
            // serie `.success`. Cuatro momentos, cuatro golpes distintos.
            WKInterfaceDevice.current().play(.start)
        }
        // `.common` y no el modo por omisión: sin eso el cronómetro se congela
        // mientras la pantalla se desplaza, y volver a mirarlo diría un número
        // que ya no es cierto.
        RunLoop.main.add(nuevo, forMode: .common)
        reloj = nuevo
    }

    private func detener() {
        reloj?.invalidate()
        reloj = nil
    }

    /// "1:30" — el descanso se lee en minutos y segundos, no en 90.
    static func formato(_ segundos: Int) -> String {
        let minutos = segundos / 60
        let resto = segundos % 60
        return "\(minutos):" + String(format: "%02d", resto)
    }
}
