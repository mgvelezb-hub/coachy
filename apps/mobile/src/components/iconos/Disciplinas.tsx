import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

/**
 * Íconos propios de las disciplinas.
 *
 * El set de íconos de la app no tiene raqueta de squash, guantes de box ni
 * siluetas de gente moviéndose, y los sustitutos genéricos —una pelota
 * cualquiera, un puño suelto, unas pisadas— no se reconocen de un vistazo, que
 * es lo único que un ícono tiene que hacer.
 *
 * Están dibujados con el mismo lenguaje que los demás: trazo de 2, extremos
 * redondeados y sin relleno, para que en una fila mezclada no se note cuál
 * viene de dónde. La firma también es la misma (`size`, `color`,
 * `strokeWidth`), así que se pueden intercambiar sin tocar las pantallas.
 */

type IconProps = { size?: number; color?: string; strokeWidth?: number };

/** Raqueta de squash: cabeza ovalada, encordado y mango largo. */
export function RaquetaSquash({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* La cabeza va alargada y no redonda: es lo que distingue una raqueta de
          squash de una de tenis a este tamaño. */}
      <Path
        d="M9 2.6c3 0 5.2 2.6 5.2 6 0 3.5-2.3 6.2-5.2 6.2S3.8 12.1 3.8 8.6c0-3.4 2.2-6 5.2-6Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Line x1="5.2" y1="8.6" x2="12.8" y2="8.6" stroke={color} strokeWidth={strokeWidth * 0.55} />
      <Line x1="9" y1="3" x2="9" y2="14.4" stroke={color} strokeWidth={strokeWidth * 0.55} />
      {/* Garganta y mango. */}
      <Path
        d="M9 14.8v1.7M9 16.5l4.2 4.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M13.2 20.7 15 22.4"
        stroke={color}
        strokeWidth={strokeWidth * 1.4}
        strokeLinecap="round"
      />
      {/* La pelota, que es lo que remata la lectura. */}
      <Circle cx="19" cy="6.5" r="2.2" stroke={color} strokeWidth={strokeWidth} />
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
      {/* Muñequera. */}
      <Line x1="3.7" y1="17.2" x2="9.9" y2="17.2" stroke={color} strokeWidth={strokeWidth * 0.8} />
    </Svg>
  );
}

/** Silueta corriendo. */
export function PersonaCorriendo({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="15.5" cy="4.2" r="2" stroke={color} strokeWidth={strokeWidth} />
      {/* Tronco inclinado: la inclinación es lo que hace que se lea "corriendo"
          y no "de pie". */}
      <Path
        d="M14.6 8.1 11.4 11l2.4 2.6.7 4.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pierna de atrás, flexionada. */}
      <Path
        d="m13.8 13.6-3.6 2.1-2.1 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Brazos en oposición. */}
      <Path
        d="m14.6 8.1 3.6 1.5.9 3.1M11.4 11 8 9.6l-2.6 1.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m14.5 18.2 2.1 2.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Silueta haciendo jumping jacks: brazos y piernas en dos uves. */
export function JumpingJack({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="4" r="2" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="12" y1="6.4" x2="12" y2="13.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Brazos arriba, abiertos. */}
      <Path
        d="M12 8.4 6.6 4.6M12 8.4l5.4-3.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Piernas abiertas. */}
      <Path
        d="m12 13.4-3.8 6.4M12 13.4l3.8 6.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Las líneas de movimiento son lo que separa un jumping jack de una
          estrella quieta. */}
      <Path
        d="M4.6 8.2 3.2 9.4M19.4 8.2l1.4 1.2"
        stroke={color}
        strokeWidth={strokeWidth * 0.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Silueta haciendo un clean: barra a la altura de los hombros. */
export function LevantamientoClean({ size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="4" r="1.9" stroke={color} strokeWidth={strokeWidth} />
      {/* La barra en posición de recepción, con sus discos: es el momento del
          clean, no el de un peso muerto. */}
      <Line x1="4.6" y1="8.4" x2="19.4" y2="8.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Rect x="3.2" y="6.4" width="2.2" height="4" rx="0.8" stroke={color} strokeWidth={strokeWidth * 0.9} />
      <Rect x="18.6" y="6.4" width="2.2" height="4" rx="0.8" stroke={color} strokeWidth={strokeWidth * 0.9} />
      {/* Codos altos por debajo de la barra. */}
      <Path
        d="M9.2 8.4v1.8M14.8 8.4v1.8"
        stroke={color}
        strokeWidth={strokeWidth * 0.9}
        strokeLinecap="round"
      />
      {/* Tronco vertical y sentadilla de recepción. */}
      <Line x1="12" y1="8.4" x2="12" y2="14.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path
        d="M12 14.2 9 17v3M12 14.2l3 2.8v3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
