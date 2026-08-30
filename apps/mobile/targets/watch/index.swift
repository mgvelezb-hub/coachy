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
    @State private var reps: Double = 0
    @State private var grabando = false

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

    private var esperando: some View {
        VStack(spacing: 6) {
            Text("Sin sesión")
                .font(.headline)
            Text("Abre tu sesión en el teléfono y aparece aquí.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .onAppear { entrenamiento.terminar() }
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
        .onAppear { entrenamiento.terminar() }
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

                // El número grande es lo único que hay que poder leer de reojo
                // con el brazo a medio camino. La corona lo mueve sin tapar la
                // pantalla con el dedo, que es para lo que existe la corona.
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

                Button {
                    cerrar(sesion: sesion, pendiente: pendiente, serie: serie)
                } label: {
                    Label("Serie hecha", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

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
        }
        .onChange(of: pendiente.serie) { _ in preparar(serie: serie) }
        .onChange(of: pendiente.ejercicio) { _ in preparar(serie: serie) }
    }

    // MARK: - Acciones

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
