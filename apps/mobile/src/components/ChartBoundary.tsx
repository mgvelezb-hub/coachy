import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { paletteDark } from "@/lib/theme";

/**
 * Red de seguridad alrededor de una gráfica.
 *
 * Una gráfica depende de datos que llegan del servidor y del reloj, y basta un
 * caso que nadie previó —una serie vacía, un valor imposible, un componente de
 * SVG que no soporta un hijo— para tirar TODA la pantalla. En una app de
 * consulta diaria eso es inaceptable: la racha, el check-in y las medidas no
 * tienen por qué desaparecer porque un anillo no supo dibujarse.
 *
 * Con esto, lo que falla es la gráfica y nada más: en su lugar queda una nota
 * corta y el resto de la pantalla sigue de pie.
 *
 * Los colores van del tema oscuro y no del contexto a propósito — un límite de
 * error tiene que poder pintarse aunque el problema esté precisamente en el
 * proveedor de tema.
 */

type Props = { children: React.ReactNode; label?: string };
type State = { failed: boolean };

export class ChartBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Se registra pero no se reporta a ningún lado: la app no manda telemetría.
    console.warn("[grafica] no se pudo dibujar", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.fallback}>
        <Text style={styles.texto}>
          {this.props.label ?? "Esta gráfica no se pudo dibujar con los datos de hoy."}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fallback: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  texto: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: paletteDark.paloRosa,

  },
});
