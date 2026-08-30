import ExpoModulesCore

/**
 El módulo que JavaScript ve.

 Fino a propósito: todo lo que puede pasar con la app dormida vive en `Puente`.
 Aquí solo se traduce entre Swift y JavaScript, y se pasan cadenas JSON en vez
 de objetos porque la forma de la sesión la define TypeScript y no vale la pena
 repetirla en un `Record` de Swift que habría que actualizar cada vez.
 */
public class RelojModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Reloj")

    Events("onSerieCerrada")

    OnCreate {
      Puente.compartido.activar()
      Puente.compartido.alLlegarSerie = { [weak self] in
        self?.sendEvent("onSerieCerrada", [:])
      }
    }

    Function("estado") { () -> [String: Any] in
      Puente.compartido.estado()
    }

    Function("enviarSesion") { (json: String) -> Bool in
      Puente.compartido.enviarSesion(json)
    }

    Function("drenar") { () -> [String] in
      Puente.compartido.drenar()
    }
  }
}
