import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Funcional — trabajo con equipo, en un gimnasio.
 *
 * Es lo que la separa de "En casa": aquí hay trineo, sacos, balones, remo y
 * pesas rusas. La primera versión de esta biblioteca estaba llena de flexiones
 * y planchas, que es exactamente lo que se puede hacer sin equipo — con eso,
 * las dos disciplinas eran la misma.
 *
 * El marco de referencia es el formato de carrera funcional tipo Hyrox: ocho
 * estaciones de trabajo con equipo intercaladas con carrera. No porque haya
 * que competir, sino porque es la lista más honesta de lo que un gimnasio
 * funcional bien equipado sabe entrenar, y porque cada estación tiene una
 * técnica que se puede enseñar.
 *
 * Lo que sigue fuera: los patrones pesados de barra —sentadilla, peso muerto,
 * press— se quedan en el gimnasio de pesas. Aquí compiten con tu día de pierna
 * en vez de sumarle.
 */
export const FUNCIONAL: EjercicioDisciplina[] = [
  // -- Estaciones con equipo -------------------------------------------------
  {
    id: "wall_ball",
    nombre: "Wall ball",
    nivel: "PRINCIPIANTE",
    categoria: "Estaciones",
    como: "Sentadilla completa con el balón al pecho y lánzalo al objetivo extendiendo cadera; recíbelo y baja en el mismo movimiento.",
    para: "Junta sentadilla y empuje en un ciclo continuo: la estación que más mide capacidad de trabajo con equipo mínimo.",
    ojo: "Cortar la profundidad cuando cansa. Si el objetivo pide sentadilla completa, la repetición sin profundidad no cuenta.",
  },
  {
    id: "sled_push",
    nombre: "Empuje de trineo",
    nivel: "PRINCIPIANTE",
    categoria: "Estaciones",
    como: "Cuerpo inclinado, brazos extendidos y empuje continuo con pasos cortos y potentes, sin dejar de mover el trineo.",
    para: "Fuerza de piernas sin fase excéntrica: cansa mucho y deja poca agujeta, así que cabe cerca de un día de pierna.",
    ojo: "Dar pasos largos. El trineo se mueve con muchos pasos cortos, no con zancadas.",
  },
  {
    id: "sled_pull",
    nombre: "Arrastre de trineo",
    nivel: "INTERMEDIO",
    categoria: "Estaciones",
    como: "De espaldas al trineo, tira de la cuerda mano sobre mano con la cadera atrás y los pies plantados.",
    para: "El complemento del empuje: trabaja toda la cadena posterior y el agarre.",
    ojo: "Tirar solo con los brazos. La fuerza sale de bajar la cadera y empujar el piso.",
  },
  {
    id: "farmer_carry",
    nombre: "Caminata del granjero",
    nivel: "PRINCIPIANTE",
    categoria: "Estaciones",
    como: "Una pesa pesada en cada mano, camina erguido con pasos cortos y los hombros atrás.",
    para: "Agarre, core y postura de una sola vez. En cualquier formato de carrera funcional es la estación que más gente subestima.",
    ojo: "Encoger los hombros o inclinarte. Si el cuerpo se dobla, sobra peso.",
  },
  {
    id: "sandbag_lunge",
    nombre: "Zancadas con saco",
    nivel: "INTERMEDIO",
    categoria: "Estaciones",
    como: "Saco sobre los hombros o la espalda alta, zancadas largas alternando pierna, rodilla de atrás casi al suelo.",
    para: "Pierna unilateral bajo carga inestable: el saco obliga al core a trabajar en cada paso.",
    ojo: "Inclinar el tronco al frente por el peso. El saco va apoyado, no colgado del cuello.",
  },
  {
    id: "burpee_broad_jump",
    nombre: "Burpee con salto largo",
    nivel: "INTERMEDIO",
    categoria: "Estaciones",
    como: "Burpee completo con pecho al piso y, en vez de saltar hacia arriba, salta hacia adelante lo más lejos que puedas.",
    para: "La estación más dura de cualquier formato funcional: junta suelo, salto y desplazamiento.",
    ojo: "Salir a ritmo de esprint. En cualquier formato largo, este bloque se hace parejo o te come.",
  },
  {
    id: "remo_maquina",
    nombre: "Remo en máquina",
    nivel: "PRINCIPIANTE",
    categoria: "Estaciones",
    como: "Empuje de piernas primero, después cadera y al final brazos; al volver, el orden se invierte.",
    para: "El monitor más honesto del gimnasio: el ritmo se mide en tiempo por 500 m y no admite excusas.",
    ojo: "Tirar con los brazos desde el inicio. El 60 % del empuje viene de la pierna.",
  },
  {
    id: "ski_erg",
    nombre: "SkiErg",
    nivel: "INTERMEDIO",
    categoria: "Estaciones",
    como: "De pie frente a la máquina, tira de los mangos hacia abajo cerrando cadera y abdomen, no solo con los brazos.",
    para: "Tren superior y core en un patrón que casi ningún gimnasio entrena, y con cero impacto.",
    ojo: "Quedarse erguido tirando solo con los hombros. La bisagra de cadera es la que mueve la máquina.",
  },
  {
    id: "assault_bike",
    nombre: "Bicicleta de aire",
    nivel: "PRINCIPIANTE",
    categoria: "Estaciones",
    como: "Pedalea empujando y jalando los manubrios al mismo tiempo, con el tronco estable.",
    para: "La forma más rápida de subir el pulso sin impacto: la resistencia sube con tu propio esfuerzo.",
    ojo: "Balancear el cuerpo. Si el torso se mece, estás gastando en movimiento que no mueve la rueda.",
  },

  // -- Fuerza con equipo -----------------------------------------------------
  {
    id: "kb_swing_funcional",
    nombre: "Swing con pesa rusa",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Bisagra explosiva de cadera; la pesa pasa alta entre las piernas y sube por el impulso hasta la altura del pecho.",
    para: "El mejor puente entre fuerza y cardio: cadena posterior y pulso alto en el mismo movimiento.",
    ojo: "Levantar con los brazos o ponerse en cuclillas. Ahí no trabaja la cadera, que es todo el punto.",
  },
  {
    id: "goblet_squat",
    nombre: "Sentadilla goblet",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Pesa rusa o mancuerna sujeta al pecho, sentadilla completa con los codos por dentro de las rodillas.",
    para: "El contrapeso al frente endereza el tronco solo: la forma más rápida de aprender a sentarse bien con carga.",
    ojo: "Separar la pesa del pecho al bajar. Si se aleja, el peso lo sostiene la espalda.",
  },
  {
    id: "step_over",
    nombre: "Paso sobre el cajón",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Sube al cajón apoyando el pie completo, pasa por encima y baja del otro lado, con o sin mancuernas.",
    para: "Patrón unilateral con carga, sin el impacto del salto: aguanta mucho más volumen que el box jump.",
    ojo: "Empujar con la pierna de abajo. Si te ayudas, la que trabaja no trabaja.",
  },
  {
    id: "kb_clean",
    nombre: "Clean con pesa rusa",
    nivel: "INTERMEDIO",
    categoria: "Fuerza",
    como: "Desde el swing, guía la pesa hasta el hombro rotando la mano por dentro para que aterrice suave en el antebrazo.",
    para: "Enseña a recibir una carga en movimiento sin barra: potencia con mucha menos técnica que el clean olímpico.",
    ojo: "Dejar que la pesa golpee el antebrazo. Si suena, la rotación llegó tarde.",
  },
  {
    id: "push_press_mancuerna",
    nombre: "Push press con mancuernas",
    nivel: "INTERMEDIO",
    categoria: "Fuerza",
    como: "Flexión corta de rodilla y empuje arriba usando ese impulso, con el core apretado.",
    para: "Empuje vertical potente con equipo que hay en cualquier gimnasio.",
    ojo: "Bajar demasiado en el impulso. Es un dip de dos dedos, no una sentadilla.",
  },
  {
    id: "thruster_mancuerna",
    nombre: "Thruster con mancuernas",
    nivel: "INTERMEDIO",
    categoria: "Fuerza",
    como: "Sentadilla completa con las mancuernas en los hombros y, sin pausa, empuje arriba.",
    para: "Junta pierna y empuje en un solo movimiento: el que más rápido sube el pulso con carga.",
    ojo: "Separar la sentadilla del empuje. Es un movimiento continuo; partirlo cuesta el doble.",
  },
  {
    id: "slam_ball",
    nombre: "Slam ball",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Levanta el balón por encima de la cabeza y lánzalo al piso con toda la cadera y el abdomen.",
    para: "Potencia de tronco sin fase excéntrica: se puede hacer con fatiga sin arriesgar la técnica.",
    ojo: "Lanzar solo con los brazos. El movimiento sale de cerrar cadera y abdomen.",
  },
  {
    id: "battle_ropes",
    nombre: "Cuerdas de batalla",
    nivel: "INTERMEDIO",
    categoria: "Fuerza",
    como: "Media sentadilla estable y ondas alternadas o simultáneas, con los brazos relajados.",
    para: "Sube el pulso muchísimo sin impacto en rodilla ni tobillo: útil cuando la pierna viene cargada.",
    ojo: "Tensar los hombros. La onda sale de la cadera y del tronco, no de apretar los brazos.",
  },
  {
    id: "suitcase_carry",
    nombre: "Acarreo a un lado",
    nivel: "INTERMEDIO",
    categoria: "Fuerza",
    como: "Una sola pesa en una mano; camina sin inclinarte hacia ese lado.",
    para: "Anti-inclinación lateral: entrena al core a resistir una carga descentrada, que es como aparece en la vida.",
    ojo: "Inclinarse al lado del peso. Baja la carga hasta poder caminar recto.",
  },
  {
    id: "trx_row",
    nombre: "Remo en anillas o TRX",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Cuerpo recto colgado de las anillas, tira del pecho hacia las manos manteniendo la línea.",
    para: "Tirón horizontal escalable con solo mover los pies: equilibra todo el empuje del circuito.",
    ojo: "Sacar la cadera. El cuerpo sube entero, como una plancha que se acerca.",
  },

  // -- Core con equipo -------------------------------------------------------
  {
    id: "pallof",
    nombre: "Press Pallof",
    nivel: "INTERMEDIO",
    categoria: "Core",
    como: "De pie y de costado a una polea o banda, empuja las manos al frente resistiendo la rotación.",
    para: "Anti-rotación: entrena al core en su trabajo real, que es impedir movimiento, no producirlo.",
    ojo: "Girar el tronco al empujar. Si giras, la polea ganó.",
  },
  {
    id: "plancha_arrastre",
    nombre: "Plancha con arrastre",
    nivel: "AVANZADO",
    categoria: "Core",
    como: "En plancha alta, arrastra una pesa de un lado al otro por debajo del cuerpo sin que la cadera gire.",
    para: "Anti-rotación bajo carga y con fatiga, que es donde el core de verdad falla.",
    ojo: "Abrir los pies para no girar. Cuanto más juntos, más exige, y de eso se trata.",
  },
  {
    id: "turkish_get_up",
    nombre: "Levantada turca",
    nivel: "AVANZADO",
    categoria: "Core",
    como: "Del suelo a de pie con una pesa sostenida arriba, pasando por cada posición sin perder el brazo vertical.",
    para: "El ejercicio más completo de estabilidad de hombro y control de tronco que existe con una sola pesa.",
    ojo: "Hacerla rápido. Es un movimiento lento y por posiciones; con prisa se pierde el hombro.",
  },
  {
    id: "bear_crawl",
    nombre: "Bear crawl",
    nivel: "INTERMEDIO",
    categoria: "Core",
    como: "Rodillas a un palmo del suelo, avanza moviendo mano y pie contrarios sin que la cadera oscile.",
    para: "Coordinación contralateral y core bajo tensión, y sirve de transición entre estaciones.",
    ojo: "Subir la cadera. Se avanza bajo, aunque avance menos.",
  },

  // -- Formato ---------------------------------------------------------------
  {
    id: "estaciones_con_carrera",
    nombre: "Estaciones con carrera",
    nivel: "INTERMEDIO",
    categoria: "Formato",
    como: "Alterna tramos de carrera de 400 a 1000 m con una estación de trabajo con equipo, sin descanso entre medias.",
    para: "El formato de las carreras funcionales: entrena llegar a la estación con el pulso alto, que es lo difícil de verdad.",
    ojo: "Salir a correr al ritmo de tu mejor 5K. El ritmo de este formato es el que te deja trabajar al llegar.",
  },
  {
    id: "emom",
    nombre: "EMOM",
    nivel: "PRINCIPIANTE",
    categoria: "Formato",
    como: "Cada minuto en punto empieza una serie; lo que sobra del minuto es tu descanso.",
    para: "El reloj obliga a dosificar y hace comparable la sesión de una semana a otra.",
    ojo: "Elegir un número de repeticiones que no deje descanso. Si no sobran 15 segundos, va demasiado alto.",
  },
  {
    id: "amrap_funcional",
    nombre: "AMRAP",
    nivel: "INTERMEDIO",
    categoria: "Formato",
    como: "Tantas rondas como puedas en un tiempo fijo, con un circuito de dos a cuatro estaciones.",
    para: "Mide capacidad de trabajo y deja comparar contra ti mismo: mismo circuito, mismo tiempo, más rondas.",
    ojo: "Que la primera ronda no se parezca a la última. Si baja mucho, saliste demasiado rápido.",
  },
];
