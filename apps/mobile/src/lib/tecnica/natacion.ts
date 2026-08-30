import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Natación — estilos, ejercicios de técnica y trabajo de piscina.
 *
 * En natación la mejora viene más de la técnica que del volumen, y por eso los
 * ejercicios de técnica (los "drills") ocupan más lugar aquí que los estilos:
 * cada uno aísla una parte de la brazada para poder pensarla sin la prisa de
 * nadar completo.
 */
export const NATACION: EjercicioDisciplina[] = [
  // -- Estilos ---------------------------------------------------------------
  {
    id: "crol",
    nombre: "Crol",
    nivel: "PRINCIPIANTE",
    categoria: "Estilos",
    como: "Brazada alterna con rotación del tronco, patada continua de tijera y respiración lateral.",
    para: "El estilo más eficiente y el que se usa en casi todo el entrenamiento de fondo.",
    ojo: "Nadar plano, sin rotar. Sin rotación no hay alcance y el hombro carga todo.",
  },
  {
    id: "espalda",
    nombre: "Espalda",
    nivel: "PRINCIPIANTE",
    categoria: "Estilos",
    como: "Boca arriba, brazada alterna con entrada del meñique primero, cadera alta y mirada al techo.",
    para: "Equilibra el trabajo del hombro y deja respirar libre. Es el mejor estilo de recuperación.",
    ojo: "Sentarse en el agua. Si la cadera baja, el cuerpo frena como un ancla.",
  },
  {
    id: "pecho",
    nombre: "Pecho",
    nivel: "INTERMEDIO",
    categoria: "Estilos",
    como: "Tirón corto y simultáneo, patada de rana y deslizamiento largo con los brazos al frente.",
    para: "El único estilo donde la pausa se entrena: el deslizamiento es donde se gana o se pierde.",
    ojo: "Encadenar brazadas sin deslizar. En pecho, más frecuencia casi siempre es menos avance.",
  },
  {
    id: "mariposa",
    nombre: "Mariposa",
    nivel: "AVANZADO",
    categoria: "Estilos",
    como: "Brazada simultánea con dos patadas de delfín por ciclo, ondulación desde el pecho.",
    para: "El estilo más exigente; entrena la ondulación que también mejora las salidas y los virajes de los demás.",
    ojo: "Sacar el cuerpo del agua a fuerza de brazo. La ondulación empuja; los brazos acompañan.",
  },

  // -- Ejercicios de técnica -------------------------------------------------
  {
    id: "patada_tabla",
    nombre: "Patada con tabla",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Brazos estirados sobre la tabla, patada continua desde la cadera, piernas casi rectas.",
    para: "Enseña a patear desde la cadera y no desde la rodilla, que es lo que hace que la patada avance en vez de frenar.",
    ojo: "Doblar mucho la rodilla y patear con el pie fuera del agua: mucho ruido, cero avance.",
  },
  {
    id: "brazo_solo",
    nombre: "Brazo solo",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Un brazo trabaja y el otro descansa estirado al frente; se cambia cada 25 metros.",
    para: "Deja pensar en una sola mano: cómo entra, cómo agarra el agua y cómo sale.",
    ojo: "Girar el cuerpo de más para alcanzar. El giro sale del tronco, no del hombro.",
  },
  {
    id: "respiracion_tres",
    nombre: "Respiración de tres",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Respirar cada tres brazadas, alternando lado.",
    para: "Empareja los dos lados del cuerpo y evita el clásico crol torcido de quien siempre respira igual.",
    ojo: "Levantar la cabeza en vez de girarla. Un ojo se queda dentro del agua.",
  },
  {
    id: "punta_dedos",
    nombre: "Punta de dedo al agua",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Recobro con la mano rozando la superficie y los dedos apuntando abajo antes de entrar.",
    para: "Coloca el codo alto, que es de donde sale el agarre. Sin eso se empuja agua abajo, no atrás.",
    ojo: "Entrar con la mano plana y de golpe: mete burbujas y pierdes el agarre inicial.",
  },
  {
    id: "catch_up",
    nombre: "Alcance (catch-up)",
    nivel: "INTERMEDIO",
    categoria: "Técnica",
    como: "Una mano espera al frente hasta que la otra la alcanza; ahí empieza la siguiente brazada.",
    para: "Alarga la brazada y baja el número de brazadas por largo, que es la medida más honesta de la técnica.",
    ojo: "Quedarse quieto de más y perder velocidad. Es una pausa corta, no una parada.",
  },
  {
    id: "sculling",
    nombre: "Sculling",
    nivel: "INTERMEDIO",
    categoria: "Técnica",
    como: "Movimientos cortos de antebrazo y mano en forma de ocho, buscando sentir la presión del agua.",
    para: "Es el ejercicio que enseña a 'agarrar' el agua, que es lo que separa a quien avanza de quien chapotea.",
    ojo: "Hacerlo con la mano rígida. La sensibilidad está en la palma y el antebrazo.",
  },
  {
    id: "rotacion_seis",
    nombre: "Seis patadas y cambio",
    nivel: "INTERMEDIO",
    categoria: "Técnica",
    como: "De costado con un brazo al frente, seis patadas, y cambia de lado con una brazada.",
    para: "Aísla la rotación del tronco, que es de donde sale el alcance sin esfuerzo extra.",
    ojo: "Rotar la cabeza junto con el cuerpo. La cabeza se queda quieta salvo para respirar.",
  },
  {
    id: "pull_buoy",
    nombre: "Pull buoy",
    nivel: "INTERMEDIO",
    categoria: "Técnica",
    como: "Flotador entre las piernas para anular la patada y nadar solo con brazos.",
    para: "Obliga a sostener la posición con el core y deja trabajar el tirón sin la ayuda de la pierna.",
    ojo: "Usarlo todo el entrenamiento. Es una herramienta, no una muleta: la posición tiene que salir sin él.",
  },
  {
    id: "palas",
    nombre: "Palas",
    nivel: "AVANZADO",
    categoria: "Técnica",
    como: "Palas en las manos para aumentar la superficie del tirón, a volumen bajo y con técnica limpia.",
    para: "Fuerza específica de tirón y sensibilidad del agarre.",
    ojo: "Volumen alto con palas es la vía rápida al hombro de nadador. Series cortas y pocas.",
  },

  // -- Piscina ---------------------------------------------------------------
  {
    id: "viraje",
    nombre: "Viraje",
    nivel: "INTERMEDIO",
    categoria: "Piscina",
    como: "Voltereta a medio metro de la pared, empuje con los dos pies y deslizamiento en posición hidrodinámica.",
    para: "En una piscina de 25 m, los virajes son una parte enorme del total. Un viraje malo cuesta más que una brazada mala.",
    ojo: "Respirar justo antes o justo después. La respiración se acomoda alrededor del viraje, no dentro.",
  },
  {
    id: "deslizamiento",
    nombre: "Posición hidrodinámica",
    nivel: "PRINCIPIANTE",
    categoria: "Piscina",
    como: "Brazos extendidos con una mano sobre la otra, cabeza entre los brazos, cuerpo apretado.",
    para: "Es la posición de menos resistencia. Cada empuje de pared se aprovecha o se desperdicia aquí.",
    ojo: "Sacar la cabeza a mirar al frente. Basta con eso para frenar todo el deslizamiento.",
  },
  {
    id: "ondulacion",
    nombre: "Patada de delfín bajo el agua",
    nivel: "AVANZADO",
    categoria: "Piscina",
    como: "Después del empuje, patada ondulante desde el pecho, hasta cinco metros como marca el reglamento.",
    para: "El tramo más rápido de cualquier largo, y donde los nadadores buenos sacan ventaja.",
    ojo: "Ondular solo con las rodillas. La onda empieza en el pecho y se transmite hasta los pies.",
  },
];
