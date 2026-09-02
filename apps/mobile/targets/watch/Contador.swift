import Foundation
import WatchKit

/**
 Conteo automático de repeticiones, calibrado con las series de la propia
 persona.

 **Por qué calibrado y no de fábrica.** Una sentadilla y un curl no mueven la
 muñeca igual, y la misma sentadilla no se parece entre dos personas. Umbrales
 inventados cuentan pasos como reps o se comen la mitad. Por eso el conteo se
 ENCIENDE hasta que hay una serie de ese ejercicio cerrada a mano: de su
 grabación salen el tamaño del pico y el ritmo de ESA persona en ESE
 ejercicio, y con eso el resto de las series se cuentan solas.

 **Cómo cuenta.** La magnitud de aceleración se suaviza (media exponencial,
 ~0.3 s) y una repetición es un ciclo que sube por encima del umbral alto y
 vuelve a caer bajo el umbral bajo, con un mínimo de tiempo entre ciclos (el
 60% del ritmo calibrado): la histéresis mata el ruido y el mínimo mata los
 rebotes. Es el detector de picos más simple que funciona, a propósito — cada
 pieza se puede explicar y ajustar.

 **Hápticas.** Un golpe corto por repetición (`.click`), uno distinto al
 llegar al objetivo (`.notification`). El fin del descanso avisa con `.start`
 desde `Descanso`. Cuatro momentos, cuatro sensaciones: se distinguen sin
 mirar.
 */
final class Contador: ObservableObject {
    static let shared = Contador()

    /// Lo aprendido de una serie manual de un ejercicio.
    struct Calibracion {
        /// Altura típica del pico de una repetición (magnitud suavizada).
        let pico: Double
        /// Segundos por repetición en la serie calibrada.
        let periodo: Double
    }

    @Published private(set) var reps = 0

    /// Calibración por índice de ejercicio de la sesión en curso.
    private(set) var calibraciones: [Int: Calibracion] = [:]

    private var activo = false
    private var objetivo = 0
    private var avisoObjetivoDado = false

    // Estado del detector.
    private var suavizada = 0.0
    private var enPico = false
    private var ultimaRep: Date?
    private var umbralAlto = 0.12
    private var umbralBajo = 0.05
    private var periodoMinimo = 1.0

    private init() {}

    /// Hay con qué contar este ejercicio.
    func calibrado(_ ejercicio: Int) -> Bool {
        calibraciones[ejercicio] != nil
    }

    /**
     Aprende de una serie cerrada a mano.

     Se queda con los `reps` picos más altos de la señal suavizada: si la
     persona dijo que hizo 10, los 10 momentos más intensos SON sus
     repeticiones, y el umbral se pone a la mitad del más chico de ellos —
     bastante abajo para no perder reps flojas, bastante arriba del ruido.
     */
    func calibrar(ejercicio: Int, muestra: [Double], reps: Int, duracion: Double) {
        guard reps > 0, duracion > 0, muestra.count > 50 else { return }

        var s = 0.0
        var picos: [Double] = []
        var subiendo = false
        var picoActual = 0.0
        for cruda in muestra {
            s += 0.15 * (cruda - s)
            if s > picoActual { picoActual = s; subiendo = true }
            // Cayó a menos del 70% del máximo local: se cierra el pico.
            if subiendo && s < picoActual * 0.7 {
                picos.append(picoActual)
                picoActual = s
                subiendo = false
            }
        }
        if subiendo { picos.append(picoActual) }

        let altos = picos.sorted(by: >).prefix(reps)
        guard let menor = altos.last, menor > 0.02 else { return }

        calibraciones[ejercicio] = Calibracion(pico: menor, periodo: duracion / Double(reps))
    }

    /// Arranca a contar para un ejercicio ya calibrado.
    func empezar(ejercicio: Int, objetivo: Int) {
        guard let calibracion = calibraciones[ejercicio] else { return }

        reps = 0
        self.objetivo = objetivo
        avisoObjetivoDado = false
        suavizada = 0
        enPico = false
        ultimaRep = nil
        umbralAlto = calibracion.pico * 0.5
        umbralBajo = umbralAlto * 0.4
        // El 60% del ritmo calibrado: deja meter una rep más rápida que las de
        // la calibración, pero no dos golpes de la misma.
        periodoMinimo = max(0.7, calibracion.periodo * 0.6)
        activo = true

        Movimiento.shared.alMuestrear = { [weak self] magnitud in
            self?.procesar(magnitud)
        }
    }

    /// Deja de contar y devuelve el total. No borra la calibración.
    func detener() -> Int {
        activo = false
        Movimiento.shared.alMuestrear = nil
        return reps
    }

    /// La sesión terminó: lo aprendido era de ESA sesión.
    func limpiar() {
        _ = detener()
        reps = 0
        calibraciones = [:]
    }

    private func procesar(_ magnitud: Double) {
        guard activo else { return }
        suavizada += 0.15 * (magnitud - suavizada)

        if !enPico && suavizada > umbralAlto {
            enPico = true
            return
        }

        if enPico && suavizada < umbralBajo {
            enPico = false
            let ahora = Date()
            if let ultima = ultimaRep, ahora.timeIntervalSince(ultima) < periodoMinimo { return }
            ultimaRep = ahora
            reps += 1

            if reps == objetivo && !avisoObjetivoDado {
                avisoObjetivoDado = true
                // Llegaste: distinto del golpe por rep, se siente sin mirar.
                WKInterfaceDevice.current().play(.notification)
            } else {
                WKInterfaceDevice.current().play(.click)
            }
        }
    }
}
