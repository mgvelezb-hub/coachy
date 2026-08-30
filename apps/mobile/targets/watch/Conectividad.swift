import Foundation
import WatchConnectivity

/**
 El puente con el teléfono.

 Va por `WatchConnectivity` y no por App Group: entre iOS y watchOS los
 sandboxes están separados, así que el truco que comparten la app y el widget
 aquí no sirve.

 Dos canales y cada uno para lo suyo:

 - **`applicationContext`** para la sesión que manda el teléfono. Solo importa
   el estado más reciente, y este canal reemplaza el anterior en vez de hacer
   cola: si llegan tres actualizaciones mientras el reloj está apagado, al
   despertar se recibe la buena y no las tres.
 - **`transferUserInfo`** para las series que cierra el reloj. Aquí sí importan
   todas y ninguna se puede perder, así que hacen cola y se entregan aunque el
   teléfono esté fuera de alcance en ese momento. Cerrar una serie en el sótano
   del gimnasio y que se pierda sería el peor error posible de esta app.
 */
final class Conectividad: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = Conectividad()

    @Published var sesion: SesionEnVivo?
    @Published var alcanzable = false

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - Recibir del teléfono

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.alcanzable = session.isReachable
            self.aplicar(contexto: session.receivedApplicationContext)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.alcanzable = session.isReachable }
    }

    func session(_ session: WCSession, didReceiveApplicationContext contexto: [String: Any]) {
        DispatchQueue.main.async { self.aplicar(contexto: contexto) }
    }

    private func aplicar(contexto: [String: Any]) {
        guard let json = contexto["sesion"] as? String,
              let data = json.data(using: .utf8),
              let sesion = try? JSONDecoder().decode(SesionEnVivo.self, from: data) else {
            return
        }
        self.sesion = sesion
    }

    // MARK: - Mandar al teléfono

    /// Cierra una serie y la manda. Se aplica en el reloj de inmediato: la
    /// pantalla no espera al teléfono para avanzar.
    func cerrar(serie: SerieCerrada) {
        var serie = serie
        guard var actual = sesion else { return }

        if actual.ejercicios.indices.contains(serie.ejercicioIndice),
           actual.ejercicios[serie.ejercicioIndice].series.indices.contains(serie.serieIndice) {
            actual.ejercicios[serie.ejercicioIndice].series[serie.serieIndice].hechas = serie.reps
            sesion = actual
        }

        guard WCSession.isSupported() else { return }

        let codificador = JSONEncoder()
        // Fechas en ISO 8601 y no en el número de segundos desde 2001, que es
        // lo que Swift hace por omisión y JavaScript no sabe leer.
        codificador.dateEncodingStrategy = .iso8601

        guard var data = try? codificador.encode(serie) else { return }

        // WatchConnectivity corta en 64 KB. Si la muestra de movimiento no
        // cabe, se va la serie sin ella: el registro del entrenamiento vale
        // mucho más que el dato de calibración.
        if data.count > 55_000 {
            serie.muestra = []
            guard let recortada = try? codificador.encode(serie) else { return }
            data = recortada
        }

        guard let json = String(data: data, encoding: .utf8) else { return }

        // Cola garantizada: llega aunque el teléfono esté fuera de alcance.
        WCSession.default.transferUserInfo(["serieCerrada": json])
    }
}
