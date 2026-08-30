import SwiftUI

/**
 Holy Gains en la muñeca.

 Hace una sola cosa: enseñar en qué serie vas y dejar cerrarla sin sacar el
 teléfono. Es la mitad del valor de la sesión en vivo con una fracción de la
 fricción — entre serie y serie, mirar la muñeca cuesta un segundo y sacar el
 teléfono con las manos llenas de magnesio cuesta media serie.

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
    @State private var reps: Int = 0
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
                // con el brazo a medio camino.
                HStack {
                    Button {
                        reps = max(0, reps - 1)
                    } label: {
                        Image(systemName: "minus")
                    }
                    .buttonStyle(.bordered)

                    Text("\(reps)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .frame(maxWidth: .infinity)

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

                Text("\(avance.hechas) de \(avance.total) series")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if !conectividad.alcanzable {
                    Text("Sin el teléfono cerca: se guarda y se manda cuando vuelva.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        }
        .onAppear { preparar(serie: serie) }
        .onChange(of: pendiente.serie) { _ in preparar(serie: serie) }
    }

    // MARK: - Acciones

    /// Cada serie arranca con las reps del plan puestas: escribir desde cero es
    /// la fricción que hace que nadie registre.
    private func preparar(serie: SerieEnVivo) {
        reps = serie.objetivo
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
                reps: reps,
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

import WatchKit
