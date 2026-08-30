/**
 * Los ejercicios de técnica que la sesión de natación prescribe.
 *
 * Existen porque la app ya te pide "patada con tabla" y "brazo solo" en el
 * bloque de técnica: pedir un ejercicio que no se enseña en ningún lado es
 * exactamente lo que en pesas sería impensable —ahí cada ejercicio tiene su
 * video—.
 *
 * Todavía no hay video. Lo que sí hay es la explicación escrita: qué es, para
 * qué sirve y en qué fijarte, que es la parte que se puede leer en la orilla
 * de la alberca con el teléfono mojado. El video llega cuando se grabe.
 */

export type FichaTecnica = {
  id: string;
  nombre: string;
  /** Qué se hace, en una línea. */
  como: string;
  /** Por qué vale la pena. */
  para: string;
  /** El error que casi todo el mundo comete. */
  ojo: string;
};

export const TECNICA_NATACION: FichaTecnica[] = [
  {
    id: "patada_tabla",
    nombre: "Patada con tabla",
    como: "Brazos estirados sobre la tabla, patada continua desde la cadera, piernas casi rectas.",
    para: "Enseña a patear desde la cadera y no desde la rodilla, que es lo que hace que la patada avance en vez de frenar.",
    ojo: "Doblar mucho la rodilla y patear con el pie fuera del agua: mucho ruido, cero avance.",
  },
  {
    id: "brazo_solo",
    nombre: "Brazo solo",
    como: "Un brazo trabaja y el otro descansa estirado al frente; se cambia cada 25 metros.",
    para: "Deja pensar en una sola mano: cómo entra, cómo agarra el agua y cómo sale.",
    ojo: "Girar el cuerpo de más para alcanzar. El giro sale del tronco, no del hombro.",
  },
  {
    id: "respiracion_tres",
    nombre: "Respiración de tres",
    como: "Respirar cada tres brazadas, alternando lado.",
    para: "Empareja los dos lados del cuerpo y evita el clásico crol torcido de quien siempre respira igual.",
    ojo: "Levantar la cabeza en vez de girarla. Un ojo se queda dentro del agua.",
  },
  {
    id: "punta_dedos",
    nombre: "Punta de dedo al agua",
    como: "Recobro con la mano rozando la superficie y los dedos apuntando abajo antes de entrar.",
    para: "Coloca el codo alto, que es de donde sale el agarre. Sin eso se empuja agua hacia abajo, no hacia atrás.",
    ojo: "Entrar con la mano plana y de golpe: mete burbujas y pierdes el agarre de la primera parte de la brazada.",
  },
  {
    id: "deslizamiento",
    nombre: "Deslizamiento",
    como: "Contar hasta uno con el brazo estirado al frente antes de empezar la siguiente brazada.",
    para: "Baja el número de brazadas por largo, que es la medida más honesta de la técnica.",
    ojo: "Quedarse quieto de más y perder velocidad. Es una pausa corta, no una parada.",
  },
  {
    id: "rotacion",
    nombre: "Rotación de tronco",
    como: "Nadar de costado a costado, dejando que la cadera gire con cada brazada.",
    para: "Alarga la brazada sin esfuerzo extra: el cuerpo que rota alcanza más lejos que el hombro solo.",
    ojo: "Rotar la cabeza junto con el cuerpo. La cabeza se queda quieta salvo para respirar.",
  },
];
