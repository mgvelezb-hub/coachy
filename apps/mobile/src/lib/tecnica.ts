/**
 * Las fichas de técnica de cada disciplina.
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

/** Squash: el desplazamiento manda sobre el golpe. */
export const TECNICA_SQUASH: FichaTecnica[] = [
  {
    id: "vuelta_t",
    nombre: "Vuelta a la T",
    como: "Después de cada golpe, dos o tres pasos de vuelta al centro de la cancha.",
    para: "Es lo que decide si llegas al siguiente punto parado o corriendo. En squash casi todos los errores son de posición, no de raqueta.",
    ojo: "Quedarse admirando el golpe. La vuelta empieza antes de que la pelota toque la pared.",
  },
  {
    id: "drive_paralelo",
    nombre: "Drive paralelo",
    como: "Golpe recto pegado a la pared lateral, buscando que muera al fondo.",
    para: "Es el golpe que te devuelve el centro: obliga al otro a ir al fondo mientras tú vuelves a la T.",
    ojo: "Abrir demasiado la cara de la raqueta y mandarla al centro, que es servirle el punto en bandeja.",
  },
  {
    id: "dejada",
    nombre: "Dejada",
    como: "Golpe corto y suave al frente, con la raqueta abierta y el cuerpo bajo.",
    para: "Rompe el ritmo y saca al otro de la T. Vale más por la sorpresa que por la potencia.",
    ojo: "Anunciarla con la postura. Si preparas distinto que en el drive, se ve venir desde el otro lado.",
  },
  {
    id: "servicio_lob",
    nombre: "Servicio alto",
    como: "Saque alto que muere en la esquina del fondo, tocando la pared lateral.",
    para: "El servicio es el único golpe que controlas al cien por ciento: mal aprovechado, regalas el punto de salida.",
    ojo: "Sacar fuerte y plano. En squash el saque no es un arma de potencia, es de colocación.",
  },
  {
    id: "posicion_baja",
    nombre: "Posición baja",
    como: "Rodilla flexionada y peso adelante al golpear, sin doblar la espalda.",
    para: "Baja el centro de gravedad y te deja salir en cualquier dirección.",
    ojo: "Agacharse doblando la espalda en vez de la rodilla. Ahí es donde aparece el lumbar de fin de semana.",
  },
];

/** Box: la guardia primero, el golpe después. */
export const TECNICA_BOX: FichaTecnica[] = [
  {
    id: "guardia",
    nombre: "Guardia",
    como: "Manos a la altura de los pómulos, codos cerrados, barbilla abajo.",
    para: "Es lo que sostiene todo lo demás. Un golpe potente con la guardia abajo es un intercambio que pierdes.",
    ojo: "Bajar la mano que no golpea. Ese es el hueco por donde entra el cruzado.",
  },
  {
    id: "jab",
    nombre: "Jab",
    como: "Extiende la mano de adelante girando el puño al final, y regrésala por la misma línea.",
    para: "Mide la distancia, abre las combinaciones y frena al que entra. Es el golpe que más se usa y el que menos se practica.",
    ojo: "Empujar en vez de golpear. El puño vuelve tan rápido como salió.",
  },
  {
    id: "directo",
    nombre: "Directo (dos)",
    como: "Gira cadera y pie de atrás mientras la mano trasera sale recta.",
    para: "La fuerza sale del piso y la cadera, no del brazo. Por eso el core importa tanto en box.",
    ojo: "Sacar el brazo sin girar la cadera: cansa el hombro y no pega.",
  },
  {
    id: "gancho",
    nombre: "Gancho",
    como: "Codo a noventa grados, giro de cadera y pie, el puño va en horizontal.",
    para: "Es el golpe corto de la distancia media, donde el directo ya no llega.",
    ojo: "Abrir el codo y convertirlo en un swing. Sin ángulo no hay gancho, hay manotazo.",
  },
  {
    id: "salida_lateral",
    nombre: "Salida lateral",
    como: "Después de la combinación, dos pasos hacia un lado, nunca hacia atrás en línea recta.",
    para: "Salir por donde entraste es como te alcanzan. La salida lateral te saca de la línea del contragolpe.",
    ojo: "Cruzar los pies al moverte. Con los pies cruzados no se puede ni golpear ni esquivar.",
  },
];

/** Correr: la técnica que evita lesiones, no la que gana carreras. */
export const TECNICA_RUNNING: FichaTecnica[] = [
  {
    id: "cadencia",
    nombre: "Cadencia",
    como: "Pasos más cortos y más frecuentes, alrededor de 170-180 por minuto.",
    para: "Reduce el frenado de cada zancada, que es de donde sale gran parte del impacto en rodilla.",
    ojo: "Buscar zancada larga. La zancada larga aterriza con el talón por delante del cuerpo y frena.",
  },
  {
    id: "pisada",
    nombre: "Pisada bajo el cuerpo",
    como: "El pie toca el suelo debajo de la cadera, no por delante.",
    para: "Es la diferencia entre amortiguar con el músculo o con la articulación.",
    ojo: "Fijarse en si aterrizas de talón o de punta. Importa mucho menos que DÓNDE aterrizas.",
  },
  {
    id: "postura",
    nombre: "Postura",
    como: "Tronco erguido con una inclinación mínima desde el tobillo, mirada al frente.",
    para: "Deja respirar y evita que la cadera se hunda cuando llega el cansancio.",
    ojo: "Doblarse desde la cintura al final del rodaje. Ahí es cuando aparecen las molestias lumbares.",
  },
  {
    id: "respiracion",
    nombre: "Respiración",
    como: "Rítmica y por nariz y boca; en rodaje debes poder decir una frase completa.",
    para: "Es el termómetro más honesto del ritmo: si no puedes hablar, vas rápido para ser base.",
    ojo: "Correr todos los días al mismo ritmo medio-duro. Es el error más común y el que menos mejora.",
  },
];

/** CrossFit: escalar es parte del método. */
export const TECNICA_CROSSFIT: FichaTecnica[] = [
  {
    id: "escalado",
    nombre: "Escalar",
    como: "Bajar peso, repeticiones o cambiar el movimiento hasta que la técnica aguante todo el WOD.",
    para: "El estímulo del WOD es el ritmo, no el peso. Escalado bien hecho da el mismo entrenamiento con menos riesgo.",
    ojo: "Escalar solo cuando ya falló la técnica. Se decide antes de empezar, no a media ronda.",
  },
  {
    id: "sentadilla_frontal",
    nombre: "Sentadilla frontal",
    como: "Codos altos, barra apoyada en los hombros, tronco vertical.",
    para: "Es la base de casi todo el trabajo con barra en CrossFit, incluido el thruster.",
    ojo: "Codos que caen: la barra se va adelante y la espalda paga la diferencia.",
  },
  {
    id: "kettlebell_swing",
    nombre: "Swing",
    como: "Bisagra de cadera, no sentadilla. La pesa sube por el impulso de la cadera, no de los brazos.",
    para: "Enseña el patrón de bisagra, que es el que protege la espalda en todo lo demás.",
    ojo: "Ponerse en cuclillas y levantar con los brazos. Ahí no hay cadena posterior trabajando.",
  },
  {
    id: "ritmo",
    nombre: "Dosificar",
    como: "Elegir un ritmo que puedas sostener toda la sesión, y respetarlo en la primera ronda.",
    para: "Los WOD se ganan en las últimas rondas, y esas dependen de cómo saliste en la primera.",
    ojo: "Salir volando por el marcador. Terminar caminando es más lento que ir parejo.",
  },
];

/** Funcional: densidad sin competir con las pesas. */
export const TECNICA_FUNCIONAL: FichaTecnica[] = [
  {
    id: "bisagra",
    nombre: "Bisagra de cadera",
    como: "Cadera atrás, espalda neutra, rodillas apenas flexionadas.",
    para: "Es el patrón que más se usa y peor se ejecuta. Bien hecho, protege la espalda en todo lo demás.",
    ojo: "Redondear la zona lumbar al bajar. Si no puedes mantenerla neutra, acorta el recorrido.",
  },
  {
    id: "plancha",
    nombre: "Plancha",
    como: "Codos bajo los hombros, glúteo apretado, costillas abajo.",
    para: "El core se entrena aguantando, no doblándose. Esta es la posición base de todo lo demás.",
    ojo: "Subir la cadera para descansar. Si la cadera sube, el ejercicio se acabó.",
  },
  {
    id: "zancada",
    nombre: "Zancada",
    como: "Paso largo, rodilla de atrás casi al suelo, tronco vertical.",
    para: "Trabaja cada pierna por separado y expone el desbalance que la sentadilla esconde.",
    ojo: "Rodilla que se mete hacia dentro. Antes de sumar peso, corrige eso.",
  },
  {
    id: "densidad",
    nombre: "Densidad",
    como: "Mismo trabajo en menos tiempo, no más peso en el mismo tiempo.",
    para: "Es lo que hace que el circuito sume al gimnasio en vez de competir con él.",
    ojo: "Convertir el circuito en una sesión de fuerza. Para eso ya está el día de pesas.",
  },
];

import type { Discipline } from "@/lib/api";

/** Las fichas de cada disciplina, para la Biblioteca. */
export const TECNICA_POR_DISCIPLINA: Partial<Record<Discipline, FichaTecnica[]>> = {
  NATACION: TECNICA_NATACION,
  SQUASH: TECNICA_SQUASH,
  BOX: TECNICA_BOX,
  CARDIO: TECNICA_RUNNING,
  FUNCIONAL: TECNICA_FUNCIONAL,
  CROSSFIT: TECNICA_CROSSFIT,
};
