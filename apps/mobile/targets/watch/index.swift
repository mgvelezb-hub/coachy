import SwiftUI
import WatchKit

/**
 Holy Gains en la muñeca.

 Hace una sola cosa: enseñar en qué serie vas y dejar cerrarla sin sacar el
 teléfono. Es la mitad del valor de la sesión en vivo con una fracción de la
 fricción — entre serie y serie, mirar la muñeca cuesta un segundo y sacar el
 teléfono con las manos llenas de magnesio cuesta media serie.

 Mientras hay serie pendiente corre una `HKWorkoutSession` (ver
 `Entrenamiento.swift`). No es decorado: es lo que impide que watchOS suspenda
 la app en cuanto bajas el brazo, y de paso trae pulso y calorías y escribe el
 entrenamiento en Salud.

 Lo que NO hace todavía: contar repeticiones solo. Graba el movimiento de cada
 serie para poder calibrar ese conteo con sesiones reales, y hasta entonces el
 número lo pones tú.
 */
@main
struct HolyGainsWatchApp: App {
    var body: some Scene {
        WindowGroup {
            SesionView()
        }
    }
}

struct SesionView: View {
    @ObservedObject private var conectividad = Conectividad.shared
    @ObservedObject private var entrenamiento = Entrenamiento.shared
    @ObservedObject private var descanso = Descanso.shared
    @State private var reps: Double = 0
    @State private var grabando = false
    /// En qué ejercicio estaba la serie anterior, para saber si el cambio de
    /// serie merece descanso o es un cambio de máquina.
    @State private var ejercicioPrevio: Int?

    var body: some View {
        Group {
            if let sesion = conectividad.sesion, let pendiente = sesion.pendiente {
                enCurso(sesion: sesion, pendiente: pendiente)
            } else if conectividad.sesion != nil {
                terminada
            } else {
                esperando
            }
        }
        .onAppear { entrenamiento.pedirPermiso() }
    }

    // MARK: - Estados

    /**
     Fuera de la sesión.

     No dice "no hay nada": dice qué toca hoy, cuál es la siguiente comida y
     cómo va la racha. Es la diferencia entre una app que sirve una hora al día
     y una que se mira de reojo el resto.
     */
    private var esperando: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let resumen = conectividad.resumen {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Hoy")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(resumen.hoy)
                            .font(.headline)
                        if let ejercicios = resumen.ejercicios, !resumen.hecho {
                            Text("\(ejercicios) ejercicios")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if resumen.hecho {
                            Label("Hecho", systemImage: "checkmark.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let comida = resumen.comida {
                        Divider()
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Sigue")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(comida)
                                .font(.subheadline)
                            if let hora = resumen.comidaHora {
                                Text(hora)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Divider()
                    Label("\(resumen.racha) días seguidos", systemImage: "flame.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Text("Tu sesión aparece aquí en cuanto la abras en el teléfono.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Sin datos todavía")
                        .font(.headline)
                    Text("Abre Holy Gains en el teléfono una vez y esto se llena solo.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        }
        .onAppear {
            entrenamiento.terminar()
            descanso.saltar()
        }
    }

    private var terminada: some View {
        VStack(spacing: 6) {
            Text("Sesión completa")
                .font(.headline)
            Text("Todas las series cerradas.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
        // Cerrar aquí y no al salir de la app: salir con la sesión de Salud
        // viva la dejaría corriendo hasta que el reloj se canse, gastando
        // batería y ensuciando el entrenamiento con media hora de nada.
        .onAppear {
            entrenamiento.terminar()
            descanso.saltar()
        }
    }

    private func enCurso(sesion: SesionEnVivo, pendiente: (ejercicio: Int, serie: Int)) -> some View {
        let ejercicio = sesion.ejercicios[pendiente.ejercicio]
        let serie = ejercicio.series[pendiente.serie]
        let avance = sesion.progreso

        return ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(ejercicio.nombre)
                    .font(.headline)
                    .lineLimit(2)

                Text("Serie \(pendiente.serie + 1) de \(ejercicio.series.count)\(serie.calentamiento ? " · calentamiento" : "")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let restante = descanso.restante {
                    descansando(restante: restante)
                } else {
                    capturaDeSerie(ejercicio: ejercicio, serie: serie) {
                        cerrar(sesion: sesion, pendiente: pendiente, serie: serie)
                    }
                }

                HStack(spacing: 10) {
                    Text("\(avance.hechas)/\(avance.total) series")
                    if let pulso = entrenamiento.pulso {
                        Label("\(pulso)", systemImage: "heart.fill")
                    }
                    if let kcal = entrenamiento.kcal {
                        Label("\(kcal)", systemImage: "flame.fill")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)

                if !conectividad.alcanzable {
                    Text("Sin el teléfono cerca: se guarda y se manda cuando vuelva.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                // Salida explícita: quien abandona a media sesión necesita
                // poder cerrar el entrenamiento de Salud, o se queda corriendo.
                if entrenamiento.activo {
                    Button(role: .destructive) {
                        entrenamiento.terminar()
                    } label: {
                        Text("Terminar entrenamiento")
                            .font(.caption2)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(.horizontal, 4)
        }
        .onAppear {
            entrenamiento.empezar()
            preparar(serie: serie)
            ejercicioPrevio = pendiente.ejercicio
        }
        .onChange(of: pendiente.serie) { avanzar(a: pendiente, ejercicio: ejercicio, serie: serie) }
        .onChange(of: pendiente.ejercicio) { avanzar(a: pendiente, ejercicio: ejercicio, serie: serie) }
    }

    // MARK: - Subvistas

    /// Reps y el botón que cierra la serie.
    @ViewBuilder
    private func capturaDeSerie(
        ejercicio: EjercicioEnVivo,
        serie: SerieEnVivo,
        alCerrar: @escaping () -> Void
    ) -> some View {
        // El número grande es lo único que hay que poder leer de reojo con el
        // brazo a medio camino. La corona lo mueve sin tapar la pantalla con
        // el dedo, que es para lo que existe la corona.
        HStack {
            Button {
                reps = max(0, reps - 1)
            } label: {
                Image(systemName: "minus")
            }
            .buttonStyle(.bordered)

            Text("\(Int(reps))")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .frame(maxWidth: .infinity)
                .focusable()
                .digitalCrownRotation(
                    $reps,
                    from: 0,
                    through: 100,
                    by: 1,
                    sensitivity: .low,
                    isContinuous: false
                )

            Button {
                reps += 1
            } label: {
                Image(systemName: "plus")
            }
            .buttonStyle(.bordered)
        }

        Text(serie.pesoKg.map { "objetivo \(serie.objetivo) reps · \(Int($0)) kg" } ?? "objetivo \(serie.objetivo) reps")
            .font(.caption2)
            .foregroundStyle(.secondary)

        Button(action: alCerrar) {
            Label("Serie hecha", systemImage: "checkmark")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
    }

    /// El descanso, que ocupa el lugar del contador mientras corre.
    @ViewBuilder
    private func descansando(restante: Int) -> some View {
        Text(Descanso.formato(restante))
            .font(.system(size: 40, weight: .bold, design: .rounded))
            .frame(maxWidth: .infinity)
            .monospacedDigit()

        Text("de descanso")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)

        HStack {
            Button("+30 s") { descanso.sumar(30) }
                .buttonStyle(.bordered)
            Button("Ya estoy") { descanso.saltar() }
                .buttonStyle(.borderedProminent)
        }
        .font(.caption2)
    }

    // MARK: - Acciones

    /**
     Se pasó a la siguiente serie —la haya cerrado el reloj o el teléfono—.

     El descanso arranca aquí y no al tocar el botón, para que dé igual dónde
     se cerró la serie: cerrarla en el teléfono también debe poner el
     cronómetro en la muñeca, que es donde se va a mirar.
     */
    private func avanzar(
        a pendiente: (ejercicio: Int, serie: Int),
        ejercicio: EjercicioEnVivo,
        serie: SerieEnVivo
    ) {
        let mismoEjercicio = ejercicioPrevio == pendiente.ejercicio
        ejercicioPrevio = pendiente.ejercicio

        preparar(serie: serie)

        if mismoEjercicio {
            descanso.arrancar(segundos: ejercicio.descansoSeg)
        } else {
            // Cambio de máquina: el traslado ya es el descanso.
            descanso.saltar()
        }
    }

    /// Cada serie arranca con las reps del plan puestas: escribir desde cero es
    /// la fricción que hace que nadie registre.
    private func preparar(serie: SerieEnVivo) {
        reps = Double(serie.objetivo)
        if !grabando {
            Movimiento.shared.empezar()
            grabando = true
        }
    }

    private func cerrar(sesion: SesionEnVivo, pendiente: (ejercicio: Int, serie: Int), serie: SerieEnVivo) {
        let grabado = Movimiento.shared.detener()
        grabando = false

        WKInterfaceDevice.current().play(.success)

        conectividad.cerrar(
            serie: SerieCerrada(
                workoutId: sesion.workoutId,
                ejercicioIndice: pendiente.ejercicio,
                serieIndice: pendiente.serie,
                reps: Int(reps),
                pesoKg: serie.pesoKg,
                cerradaEn: Date(),
                muestra: grabado.muestra,
                duracionSeg: grabado.duracion
            )
        )

        // La siguiente serie vuelve a grabar en cuanto se pinta.
        Movimiento.shared.empezar()
        grabando = true
    }
}
