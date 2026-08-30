import Foundation

/**
 Lo que el reloj sabe de la sesión.

 Es el espejo mínimo de lo que la app tiene en el teléfono: solo lo que se
 necesita para contestar "¿qué toca ahora?" en una pantalla de 40 mm. Nada de
 historial ni de catálogo — si el reloj tuviera que sincronizar todo eso,
 tardaría más en abrir de lo que tarda uno en sacar el teléfono del bolsillo.
 */
struct SerieEnVivo: Codable, Identifiable {
    var id: String { "\(indice)" }
    let indice: Int
    let objetivo: Int
    let pesoKg: Double?
    let calentamiento: Bool
    var hechas: Int?
}

struct EjercicioEnVivo: Codable, Identifiable {
    var id: String { nombre }
    let nombre: String
    let descansoSeg: Int
    var series: [SerieEnVivo]
}

struct SesionEnVivo: Codable {
    let workoutId: String
    let titulo: String
    var ejercicios: [EjercicioEnVivo]

    /// La primera serie sin cerrar, en el orden en que se entrena.
    var pendiente: (ejercicio: Int, serie: Int)? {
        for (e, ejercicio) in ejercicios.enumerated() {
            for (s, serie) in ejercicio.series.enumerated() where serie.hechas == nil {
                return (e, s)
            }
        }
        return nil
    }

    var progreso: (hechas: Int, total: Int) {
        var hechas = 0
        var total = 0
        for ejercicio in ejercicios {
            for serie in ejercicio.series {
                total += 1
                if serie.hechas != nil { hechas += 1 }
            }
        }
        return (hechas, total)
    }
}

/**
 Una serie cerrada desde el reloj, camino al teléfono.

 Lleva la muestra de movimiento cruda cuando la hay. Hoy nadie la interpreta:
 se guarda para poder calibrar el conteo automático con sesiones reales, que es
 exactamente el dato que falta para que ese conteo se pueda escribir sin
 inventar umbrales.
 */
struct SerieCerrada: Codable {
    let workoutId: String
    let ejercicioIndice: Int
    let serieIndice: Int
    let reps: Int
    let pesoKg: Double?
    let cerradaEn: Date
    /// Magnitud de aceleración del usuario, a 50 Hz. Vacío si no se grabó.
    var muestra: [Double]
    let duracionSeg: Double
}
