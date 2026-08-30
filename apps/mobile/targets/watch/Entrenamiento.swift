import Foundation
import HealthKit

/**
 La sesión de entrenamiento de watchOS.

 **Esto es lo que mantiene viva la app en la muñeca.** Sin una
 `HKWorkoutSession` declarada, watchOS suspende la app poco después de que
 bajas el brazo: la pantalla de la serie serviría para la primera y estaría
 muerta para la segunda, que es justo cuando se necesita. Con la sesión
 declarada, la app sigue corriendo toda la sesión, vuelve al frente al
 levantar la muñeca y aprovecha la pantalla siempre encendida.

 De pilón entran dos datos que el teléfono no puede medir —pulso y calorías
 activas— y el entrenamiento se escribe en Salud al terminar, así que cierra
 los anillos como cualquier otra actividad. Eso último importa más de lo que
 parece: un entrenamiento que la app registra pero Salud no ve, se siente como
 trabajo que no contó.

 `traditionalStrengthTraining` e `indoor`: es lo que Apple usa para pesas en
 gimnasio, y el tipo de actividad cambia cómo se estiman las calorías.
 */
final class Entrenamiento: NSObject, ObservableObject {
    static let shared = Entrenamiento()

    private let almacen = HKHealthStore()
    private var sesion: HKWorkoutSession?
    private var constructor: HKLiveWorkoutBuilder?

    @Published var activo = false
    @Published var pulso: Int?
    @Published var kcal: Int?

    private override init() { super.init() }

    /// Pide lo mínimo: escribir el entrenamiento, leer pulso y calorías.
    func pedirPermiso() {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        let escribir: Set<HKSampleType> = [HKObjectType.workoutType()]
        let leer: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]
        almacen.requestAuthorization(toShare: escribir, read: leer) { _, _ in }
    }

    /// Arranca. Llamarla dos veces no hace nada: la sesión ya está viva.
    func empezar() {
        guard HKHealthStore.isHealthDataAvailable(), sesion == nil else { return }

        let configuracion = HKWorkoutConfiguration()
        configuracion.activityType = .traditionalStrengthTraining
        configuracion.locationType = .indoor

        guard let nueva = try? HKWorkoutSession(healthStore: almacen, configuration: configuracion) else {
            return
        }

        let obra = nueva.associatedWorkoutBuilder()
        obra.dataSource = HKLiveWorkoutDataSource(healthStore: almacen, workoutConfiguration: configuracion)
        nueva.delegate = self
        obra.delegate = self

        let inicio = Date()
        nueva.startActivity(with: inicio)
        obra.beginCollection(withStart: inicio) { _, _ in }

        sesion = nueva
        constructor = obra
        DispatchQueue.main.async { self.activo = true }
    }

    /// Cierra y guarda en Salud. Si no había sesión, no hace nada.
    func terminar() {
        guard let viva = sesion, let obra = constructor else { return }

        sesion = nil
        constructor = nil

        let fin = Date()
        viva.end()
        obra.endCollection(withEnd: fin) { _, _ in
            obra.finishWorkout { _, _ in }
        }

        DispatchQueue.main.async {
            self.activo = false
            self.pulso = nil
            self.kcal = nil
        }
    }
}

extension Entrenamiento: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        DispatchQueue.main.async { self.activo = (toState == .running) }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        // Que Salud falle no puede tumbar el registro de la sesión: la app
        // sigue enseñando la serie y mandándola al teléfono sin el reloj de
        // Apple de por medio.
        DispatchQueue.main.async { self.activo = false }
    }
}

extension Entrenamiento: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for tipo in collectedTypes {
            guard let cantidad = tipo as? HKQuantityType,
                  let resumen = workoutBuilder.statistics(for: cantidad) else { continue }

            switch cantidad.identifier {
            case HKQuantityTypeIdentifier.heartRate.rawValue:
                // El último latido, no el promedio: entre series lo que
                // interesa es si ya bajaste, no cómo estuviste en general.
                let porMinuto = HKUnit.count().unitDivided(by: .minute())
                let valor = resumen.mostRecentQuantity()?.doubleValue(for: porMinuto)
                DispatchQueue.main.async { self.pulso = valor.map { Int($0.rounded()) } }

            case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                let valor = resumen.sumQuantity()?.doubleValue(for: .kilocalorie())
                DispatchQueue.main.async { self.kcal = valor.map { Int($0.rounded()) } }

            default:
                continue
            }
        }
    }
}
