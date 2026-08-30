import Foundation
import WidgetKit

/**
 Lo que la app del reloj le deja a la complicación.

 Son dos procesos distintos —la app y la extensión de WidgetKit— que no
 comparten memoria. El único puente entre ellos es el App Group, y ahí no
 viaja un objeto: viajan llaves sueltas de `UserDefaults`.

 **Contrato**: los nombres de abajo tienen que coincidir letra por letra con
 los que lee `Resumen.leer()` en el target `watch-complicacion`. Un nombre mal
 escrito no rompe la compilación; se ve como una complicación vacía, que es el
 peor modo de fallar porque parece que la carátula simplemente no cargó.

 Los opcionales viajan como cadena vacía y como -1 porque `UserDefaults` no
 distingue "no hay valor" de "el valor es cero": sin ese truco, una comida
 ausente y una comida llamada "" se leerían igual.
 */
enum Compartido {
    static let grupo = "group.com.holygains.app"

    static func guardar(_ resumen: ResumenDelDia) {
        guard let disco = UserDefaults(suiteName: grupo) else { return }

        disco.set(resumen.hoy, forKey: "reloj.hoy")
        disco.set(resumen.ejercicios ?? -1, forKey: "reloj.ejercicios")
        disco.set(resumen.hecho, forKey: "reloj.hecho")
        disco.set(resumen.comida ?? "", forKey: "reloj.comida")
        disco.set(resumen.comidaHora ?? "", forKey: "reloj.comidaHora")
        disco.set(resumen.racha, forKey: "reloj.racha")

        // Sin esto la carátula se queda con lo de ayer hasta que al sistema se
        // le ocurra refrescar, que puede ser horas.
        WidgetCenter.shared.reloadAllTimelines()
    }
}
