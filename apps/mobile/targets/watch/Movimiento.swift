import CoreMotion
import Foundation

/**
 Grabador de movimiento de la muñeca.

 **Esto todavía no cuenta repeticiones.** Graba la magnitud de la aceleración
 del usuario mientras dura la serie y la manda con ella al teléfono. El conteo
 automático necesita umbrales por ejercicio —una sentadilla y un curl no se
 parecen en nada— y esos umbrales no se pueden inventar: salen de mirar
 sesiones reales grabadas. Esto es lo que produce esas sesiones.

 Se graba a 50 Hz, que es de sobra para un movimiento humano —una repetición
 rápida dura medio segundo— y mucho más barato en batería que los 100 Hz que
 permite el sensor.

 `deviceMotion` y no `accelerometer` a secas porque la primera ya separa la
 gravedad de la aceleración que produce la persona: sin esa separación, girar
 la muñeca se parecería a levantar el peso.
 */
final class Movimiento: ObservableObject {
    static let shared = Movimiento()

    private let manager = CMMotionManager()
    private var muestra: [Double] = []
    private var arranque: Date?

    /// Oyente en vivo de cada magnitud, a 50 Hz. Lo usa el contador de
    /// repeticiones: la grabación completa sigue viajando al teléfono para
    /// calibrar, pero el conteo necesita ver la señal MIENTRAS pasa.
    var alMuestrear: ((Double) -> Void)?

    /// `true` si el reloj puede grabar movimiento en este momento.
    var disponible: Bool { manager.isDeviceMotionAvailable }

    func empezar() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }

        muestra = []
        arranque = Date()
        manager.deviceMotionUpdateInterval = 1.0 / 50.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let a = motion.userAcceleration
            let magnitud = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()
            // Tres decimales: el sensor no es más preciso que eso y el JSON
            // pesa la mitad.
            let redondeada = (magnitud * 1000).rounded() / 1000
            self.muestra.append(redondeada)
            self.alMuestrear?(redondeada)

            // Tope de un minuto (3 000 muestras a 50 Hz). No es prudencia: es
            // el límite de 64 KB por mensaje de WatchConnectivity. Una serie de
            // gimnasio dura entre veinte y cuarenta segundos; la que pase de un
            // minuto se graba hasta ahí y la cola se pierde, que para calibrar
            // el conteo da igual —lo que importa es la forma de la repetición,
            // y en un minuto hay de sobra.
            if self.muestra.count >= 3_000 {
                self.manager.stopDeviceMotionUpdates()
            }
        }
    }

    /// Detiene la grabación y devuelve lo grabado con su duración.
    func detener() -> (muestra: [Double], duracion: Double) {
        manager.stopDeviceMotionUpdates()
        let duracion = arranque.map { Date().timeIntervalSince($0) } ?? 0
        let capturado = muestra
        muestra = []
        arranque = nil
        return (capturado, duracion)
    }
}
