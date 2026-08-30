import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

/**
 * Íconos propios de las disciplinas.
 *
 * El set de íconos de la app no tiene raqueta de squash, guantes de box ni
 * siluetas de gente moviéndose, y los sustitutos genéricos —una pelota
 * cualquiera, un puño suelto, unas pisadas— no se reconocen de un vistazo, que
 * es lo único que un ícono tiene que hacer.
 *
 * Las siluetas de personas van con **trazo grueso y extremos redondeados** en
 * vez de líneas finas: a 22 pt una figura de línea fina se lee como un garabato
 * y una de trazo grueso se lee como una persona. Es el mismo lenguaje de la
 * señalética deportiva, que es de donde salen las referencias.
 *
 * La firma es la misma que la de los íconos del set (`size`, `color`,
 * `strokeWidth`), así que se pueden intercambiar sin tocar las pantallas.
 */

type IconProps = { size?: number; color?: string; strokeWidth?: number };

/**
 * Raqueta de squash.
 *
 * En diagonal y con la cabeza grande y ovalada, que es como se reconoce: una
 * raqueta vertical y pequeña se confunde con una paleta o un espejo. El
 * encordado en rejilla es lo que la separa de cualquier otra raqueta a este
 * tamaño, y la pelota remata la lectura.
 */
export function RaquetaSquash({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(-35 14 9)">
        <Ellipse
          cx="14"
          cy="9"
          rx="6"
          ry="7.4"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        {/* Encordado: pocas líneas y finas, las justas para leerse como rejilla
            sin volverse una mancha. */}
        <Line x1="10.4" y1="3.2" x2="10.4" y2="14.8" stroke={color} strokeWidth={strokeWidth * 0.4} />
        <Line x1="14" y1="1.9" x2="14" y2="16.1" stroke={color} strokeWidth={strokeWidth * 0.4} />
        <Line x1="17.6" y1="3.2" x2="17.6" y2="14.8" stroke={color} strokeWidth={strokeWidth * 0.4} />
        <Line x1="8.4" y1="5.6" x2="19.6" y2="5.6" stroke={color} strokeWidth={strokeWidth * 0.4} />
        <Line x1="8" y1="9" x2="20" y2="9" stroke={color} strokeWidth={strokeWidth * 0.4} />
        <Line x1="8.4" y1="12.4" x2="19.6" y2="12.4" stroke={color} strokeWidth={strokeWidth * 0.4} />
      </G>

      {/* Garganta y mango, en la misma diagonal que la cabeza. */}
      <Path
        d="M9.6 13.4 4.2 20.6"
        stroke={color}
        strokeWidth={strokeWidth * 1.5}
        strokeLinecap="round"
      />

      <Circle cx="18.6" cy="19.4" r="2" fill={color} />
    </Svg>
  );
}

/** Par de guantes de box. */
export function GuantesBox({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Guante de atrás, desplazado, para que se lea "par" y no "puño". */}
      <Path
        d="M13.5 4.2h3.6c1.6 0 2.9 1.4 2.9 3.1v3c0 1.5-1 2.8-2.4 3.1v1.7c0 .6-.5 1.1-1.1 1.1h-3.5c-.6 0-1.1-.5-1.1-1.1v-1.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Guante de adelante, completo. */}
      <Path
        d="M4.4 7.5h4.2c1.7 0 3.1 1.4 3.1 3.2v3.1c0 1.4-1 2.6-2.3 3v1.6c0 .6-.5 1.1-1.1 1.1H4.8c-.6 0-1.1-.5-1.1-1.1v-1.6C2.4 16.4 1.4 15.2 1.4 13.8v-3.1c0-1.8 1.4-3.2 3-3.2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* El pulgar: sin él, un guante parece una almohada. */}
      <Path
        d="M11.7 11.2h1.1c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3h-1.1"
        stroke={color}
        strokeWidth={strokeWidth * 0.9}
        strokeLinejoin="round"
      />
      <Line x1="3.7" y1="17.2" x2="9.9" y2="17.2" stroke={color} strokeWidth={strokeWidth * 0.8} />
    </Svg>
  );
}

/**
 * Silueta corriendo, estilo señalética.
 *
 * Cabeza suelta y separada del tronco, y extremidades de trazo grueso en plena
 * zancada: brazo adelante flexionado, brazo atrás, pierna de apoyo extendida y
 * la otra recogida. Esa combinación es la que se lee como "corriendo" y no
 * como "caminando".
 */
export function PersonaCorriendo({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  const grueso = strokeWidth * 1.6;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="15" cy="4.3" r="2.5" fill={color} />

      {/* Tronco inclinado hacia adelante. */}
      <Path
        d="M14.6 8 11.8 12.4"
        stroke={color}
        strokeWidth={grueso * 1.2}
        strokeLinecap="round"
      />

      {/* Brazo de adelante, flexionado y arriba. */}
      <Path
        d="m14.4 8.6 4 1 .8-2.6"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Brazo de atrás, extendido abajo. */}
      <Path
        d="m13.2 10.4-3.6.6-2.4 2.4"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Pierna de adelante: rodilla alta y pie abajo. */}
      <Path
        d="m11.9 12.3 3.2 1.6.6 4.2 2 2.4"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pierna de atrás, extendida. */}
      <Path
        d="m11.9 12.6-3.3 3.1-3 3.4"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Silueta en zancada sobre un apoyo, estilo señalética.
 *
 * Funcional en gimnasio es zancada con carga, subidas al cajón, trineo y wall
 * ball: una figura estática de brazos abiertos no dice nada de eso. Esta —
 * rodilla adelantada, pierna de atrás extendida y un apoyo bajo el pie— sí se
 * lee como trabajo con equipo.
 */
export function ZancadaFuncional({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  const grueso = strokeWidth * 1.6;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9.6" cy="4" r="2.5" fill={color} />

      {/* Tronco vertical. */}
      <Path
        d="M9.6 7.2v5.4"
        stroke={color}
        strokeWidth={grueso * 1.2}
        strokeLinecap="round"
      />

      {/* Brazo al frente, como quien sostiene un balón o empuja. */}
      <Path
        d="M9.9 9.2h5.6"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
      />

      {/* Pierna de adelante: muslo al frente y espinilla hacia abajo. */}
      <Path
        d="m9.8 12.6 4.4 1.1 1.4 4.6"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pierna de atrás, extendida hasta el piso. */}
      <Path
        d="m9.5 12.8-3 4.4-2.4 1.4"
        stroke={color}
        strokeWidth={grueso}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* El apoyo bajo el pie de adelante: cajón, balón o trineo. */}
      <Path
        d="M13.4 20.6a3 3 0 0 1 6 0Z"
        fill={color}
      />
    </Svg>
  );
}

/** Silueta haciendo un clean: barra a la altura de los hombros. */
export function LevantamientoClean({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="4" r="2.2" fill={color} />
      {/* La barra en posición de recepción, con sus discos: es el momento del
          clean, no el de un peso muerto. */}
      <Line x1="4.6" y1="8.4" x2="19.4" y2="8.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Rect x="3.2" y="6.4" width="2.2" height="4" rx="0.8" fill={color} />
      <Rect x="18.6" y="6.4" width="2.2" height="4" rx="0.8" fill={color} />
      {/* Codos altos por debajo de la barra. */}
      <Path
        d="M9.2 8.4v1.8M14.8 8.4v1.8"
        stroke={color}
        strokeWidth={strokeWidth * 0.9}
        strokeLinecap="round"
      />
      {/* Tronco vertical y sentadilla de recepción. */}
      <Line x1="12" y1="8.4" x2="12" y2="14.2" stroke={color} strokeWidth={strokeWidth * 1.4} strokeLinecap="round" />
      <Path
        d="M12 14.2 9 17v3M12 14.2l3 2.8v3"
        stroke={color}
        strokeWidth={strokeWidth * 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
