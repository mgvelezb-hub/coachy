import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Box — golpes, defensas, combinaciones y trabajo de aparato.
 *
 * El orden en que están es el orden en que se aprenden, y no es negociable:
 * primero la guardia y los pies, después los golpes uno por uno, luego las
 * defensas, y solo al final las combinaciones. Quien aprende combinaciones sin
 * defensa termina siendo un saco con guantes.
 *
 * Las combinaciones se nombran con la numeración estándar del gimnasio (1 =
 * jab, 2 = directo, 3 = gancho de mano adelantada, 4 = gancho trasero, 5 y 6 =
 * uppercuts), que es como las va a oír de su entrenador.
 */
export const BOX: EjercicioDisciplina[] = [
  // -- Base ------------------------------------------------------------------
  {
    id: "guardia",
    nombre: "Guardia",
    nivel: "PRINCIPIANTE",
    categoria: "Base",
    como: "Manos a la altura de los pómulos, codos cerrados pegados a las costillas, barbilla abajo y hombro levantado.",
    para: "Sostiene todo lo demás. Un golpe potente con la guardia abajo es un intercambio que pierdes.",
    ojo: "Bajar la mano que no golpea. Ese es el hueco por donde entra el cruzado.",
  },
  {
    id: "postura",
    nombre: "Postura y pasos",
    nivel: "PRINCIPIANTE",
    categoria: "Base",
    como: "Pies al ancho de hombros con el de atrás en diagonal, peso repartido, y desplazamientos cortos sin cruzar nunca los pies.",
    para: "En box se golpea desde el piso: la posición de los pies decide si el golpe tiene fuerza o solo brazo.",
    ojo: "Cruzar los pies al moverte. Con los pies cruzados no se puede ni golpear ni esquivar.",
  },
  {
    id: "cuerda",
    nombre: "Cuerda",
    nivel: "PRINCIPIANTE",
    categoria: "Acondicionamiento",
    como: "Saltos bajos y continuos, muñeca suelta, apoyo en el metatarso. Asaltos de 3 minutos.",
    para: "Es el calentamiento clásico del deporte y entrena el tobillo y el ritmo, que es de lo que vive el juego de pies.",
    ojo: "Saltar alto. La cuerda pasa con un salto de dos dedos; más alto solo cansa antes.",
  },
  {
    id: "jab",
    nombre: "Jab (1)",
    nivel: "PRINCIPIANTE",
    categoria: "Golpeo",
    como: "Extiende la mano de adelante girando el puño al final y regrésala por la misma línea.",
    para: "Mide la distancia, abre las combinaciones y frena al que entra. El golpe que más se usa y el que menos se practica.",
    ojo: "Empujar en vez de golpear. El puño vuelve tan rápido como salió.",
  },
  {
    id: "directo",
    nombre: "Directo (2)",
    nivel: "PRINCIPIANTE",
    categoria: "Golpeo",
    como: "Gira cadera y pie de atrás mientras la mano trasera sale recta desde la barbilla.",
    para: "El golpe de más potencia del repertorio básico. La fuerza sale del piso y la cadera, no del brazo.",
    ojo: "Sacar el brazo sin girar la cadera: cansa el hombro y no pega.",
  },
  {
    id: "gancho",
    nombre: "Gancho (3 y 4)",
    nivel: "PRINCIPIANTE",
    categoria: "Golpeo",
    como: "Codo a noventa grados, giro de cadera y pie, el puño viaja en horizontal.",
    para: "El golpe corto de la distancia media, donde el directo ya no llega.",
    ojo: "Abrir el codo y convertirlo en un swing. Sin ángulo no hay gancho, hay manotazo.",
  },
  {
    id: "uppercut",
    nombre: "Uppercut (5 y 6)",
    nivel: "PRINCIPIANTE",
    categoria: "Golpeo",
    como: "Baja ligeramente la rodilla del lado que golpea y sube el puño en vertical con la palma hacia ti.",
    para: "El golpe de la distancia corta y el que rompe una guardia cerrada.",
    ojo: "Bajar mucho antes de lanzarlo. El aviso es tan grande que se ve desde el otro lado del gimnasio.",
  },
  {
    id: "sombra",
    nombre: "Sombra",
    nivel: "PRINCIPIANTE",
    categoria: "Práctica",
    como: "Asaltos sin saco ni pareja: golpes, defensas y desplazamientos contra un rival imaginario, terminando cada serie con salida lateral.",
    para: "Es donde se corrige la técnica sin la resistencia del saco. Todo boxeador que se ve bien golpeando hizo miles de asaltos de sombra.",
    ojo: "Convertirla en baile sin intención. Cada golpe va a un blanco imaginado, a la altura que tocaría.",
  },

  // -- Defensa ---------------------------------------------------------------
  {
    id: "slip",
    nombre: "Slip (esquiva lateral)",
    nivel: "INTERMEDIO",
    categoria: "Defensa",
    como: "Rotación corta del tronco para que el golpe pase junto a la cara, sin mover los pies ni bajar las manos.",
    para: "Es la defensa que deja el contragolpe servido: esquivas y ya estás en posición de pegar.",
    ojo: "Esquivar con todo el cuerpo. Un slip es de centímetros; de más, quedas fuera de distancia para responder.",
  },
  {
    id: "roll",
    nombre: "Roll (rolar el gancho)",
    nivel: "INTERMEDIO",
    categoria: "Defensa",
    como: "Flexión de rodillas y giro en U por debajo del arco del gancho, terminando del otro lado en guardia.",
    para: "La respuesta al gancho, y la posición desde la que sale el contragancho al cuerpo.",
    ojo: "Agacharse con la espalda en vez de las rodillas, y quedarse abajo. Se pasa por debajo y se vuelve a subir.",
  },
  {
    id: "parry",
    nombre: "Parada y bloqueo",
    nivel: "INTERMEDIO",
    categoria: "Defensa",
    como: "Desvía el jab con la palma de la mano trasera, o recibe el gancho con el antebrazo y el hombro sin abrir la guardia.",
    para: "La defensa más barata en energía: no mueve la cabeza ni los pies y deja las dos manos listas.",
    ojo: "Manotear hacia afuera. La parada es un toque corto; el manotazo abre la guardia entera.",
  },
  {
    id: "salida_lateral",
    nombre: "Salida lateral",
    nivel: "INTERMEDIO",
    categoria: "Defensa",
    como: "Después de la combinación, dos pasos hacia un lado, nunca hacia atrás en línea recta.",
    para: "Salir por donde entraste es como te alcanzan. La lateral te saca de la línea del contragolpe.",
    ojo: "Quedarse admirando la combinación. El último golpe y el primer paso de salida son casi el mismo tiempo.",
  },
  {
    id: "clinch",
    nombre: "Clinch",
    nivel: "AVANZADO",
    categoria: "Defensa",
    como: "Entra pegando el hombro al pecho del otro y controla los codos por dentro o los bíceps por fuera.",
    para: "Es la pausa que se puede pedir dentro de un asalto cuando el ritmo se fue de las manos.",
    ojo: "Entrar con la cabeza baja y por fuera: ahí es donde llega el uppercut.",
  },

  // -- Combinaciones ---------------------------------------------------------
  {
    id: "combo_12",
    nombre: "Uno-dos (1-2)",
    nivel: "PRINCIPIANTE",
    categoria: "Combinaciones",
    como: "Jab y directo encadenados, el segundo saliendo mientras el primero regresa.",
    para: "La combinación base del deporte: el jab abre la línea y el directo entra por ella.",
    ojo: "Esperar a que el jab vuelva del todo antes de soltar el dos. Se pierde el momento en que la guardia se abrió.",
  },
  {
    id: "combo_123",
    nombre: "1-2-3",
    nivel: "INTERMEDIO",
    categoria: "Combinaciones",
    como: "Jab, directo y gancho de la mano adelantada, cambiando de línea en el tercero.",
    para: "Enseña a cambiar de ángulo dentro de la misma combinación, que es lo que hace difícil defenderla.",
    ojo: "Terminar con el peso cargado adelante. El tres se lanza con la cadera, no cayéndote hacia el rival.",
  },
  {
    id: "combo_1_2_5_2",
    nombre: "1-2-5-2",
    nivel: "INTERMEDIO",
    categoria: "Combinaciones",
    como: "Jab, directo, uppercut de mano adelantada y directo otra vez.",
    para: "Alterna alturas: dos rectos, uno que sube y otro recto. Rompe la guardia cerrada.",
    ojo: "Bajar la mano para cargar el uppercut. Sale desde donde está, no desde la cadera.",
  },
  {
    id: "combo_cuerpo",
    nombre: "Doble al cuerpo y arriba",
    nivel: "INTERMEDIO",
    categoria: "Combinaciones",
    como: "Dos golpes al cuerpo flexionando rodilla y el tercero arriba, cuando la guardia baja a cubrir.",
    para: "El cuerpo se cansa antes que la cabeza y baja las manos. Es la combinación que gana asaltos tardíos.",
    ojo: "Agacharse doblando la cintura para llegar al cuerpo. Se baja con las rodillas, con la guardia intacta.",
  },
  {
    id: "contra_jab",
    nombre: "Slip y contra",
    nivel: "AVANZADO",
    categoria: "Combinaciones",
    como: "Esquiva el jab del rival hacia fuera y responde con directo por encima de su brazo extendido.",
    para: "Es el intercambio que define el nivel: defender y golpear en el mismo tiempo.",
    ojo: "Contraatacar sin haber terminado la esquiva. Si sigues en la línea, los dos golpes llegan.",
  },

  // -- Aparatos --------------------------------------------------------------
  {
    id: "saco_pesado",
    nombre: "Saco pesado",
    nivel: "PRINCIPIANTE",
    categoria: "Aparatos",
    como: "Asaltos golpeando con toda la técnica, moviéndote alrededor del saco en vez de quedarte enfrente.",
    para: "Es donde se aprende a golpear con fuerza sin perder la estructura, y donde se construye la resistencia específica.",
    ojo: "Empujar el saco para verlo volar. Un golpe bueno entra y sale; el saco se sacude, no se columpia.",
  },
  {
    id: "manoplas",
    nombre: "Manoplas",
    nivel: "INTERMEDIO",
    categoria: "Aparatos",
    como: "Rondas con el entrenador marcando combinaciones y devolviendo golpes que hay que defender.",
    para: "Lo más parecido al sparring sin recibir de verdad: obliga a reaccionar en vez de repetir.",
    ojo: "Golpear más fuerte de lo que la manopla pide. Quien las sostiene se lesiona la muñeca y el codo.",
  },
  {
    id: "pera_loca",
    nombre: "Pera de doble liga",
    nivel: "INTERMEDIO",
    categoria: "Aparatos",
    como: "Golpes rectos a una pelota sujeta arriba y abajo, que vuelve rápido y hay que esquivar o volver a golpear.",
    para: "Entrena tiempo, precisión y esquiva a velocidad real. No perdona un golpe mal medido.",
    ojo: "Perseguirla. Se espera en guardia y se golpea cuando pasa por su sitio.",
  },
  {
    id: "pera_velocidad",
    nombre: "Pera de velocidad",
    nivel: "INTERMEDIO",
    categoria: "Aparatos",
    como: "Golpes alternos con el borde del puño, en ritmo de tres tiempos, con los codos altos.",
    para: "Resistencia de hombro y ritmo. Los codos arriba tanto tiempo es lo que sostiene la guardia en el asalto 8.",
    ojo: "Buscar velocidad antes que ritmo. Primero suena parejo, después suena rápido.",
  },
];
