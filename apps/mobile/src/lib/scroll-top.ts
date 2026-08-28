import { useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import type { ScrollView } from "react-native";

/**
 * Tocar la pestaña que ya está abierta regresa el scroll hasta arriba.
 *
 * Es el gesto que cualquiera espera de una tab bar. Cambiar de pestaña y
 * volver, en cambio, **conserva** la posición: eso ya es el comportamiento por
 * default y no se toca.
 *
 * Por eso el guardián de `isFocused()`: el evento `tabPress` también se
 * dispara cuando se entra a una pestaña desde otra, y sin ese filtro la
 * pantalla se rebobinaría justo en el caso donde la posición debía
 * conservarse.
 *
 * Se implementa con el listener en vez de `useScrollToTop` de React Navigation
 * porque ese paquete no es dependencia directa de la app —llega por dentro de
 * expo-router—, y depender de algo que no se declaró se rompe el día que
 * cambie una versión.
 */
export function useScrollTop() {
  const navigation = useNavigation();
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress" as never, () => {
      if (!navigation.isFocused()) return;
      ref.current?.scrollTo({ y: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  return ref;
}
