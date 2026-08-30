import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Funcional — fuerza y cardiovascular en el mismo circuito.
 *
 * Es la disciplina más difícil de acotar porque "funcional" no significa nada
 * por sí solo: lo que la separa del gimnasio es la **densidad** (mucho trabajo
 * en poco tiempo, con carga ligera) y el **patrón completo** (movimientos que
 * usan varias articulaciones a la vez y se parecen a lo que el cuerpo hace
 * fuera del gimnasio).
 *
 * Están agrupados por lo que entrenan, no por el aparato: los patrones que
 * sostienen todo, los de empuje y tirón, el core que aguanta, los que suben el
 * pulso y los acarreos, que son los más útiles y los que nadie hace.
 */
export const FUNCIONAL: EjercicioDisciplina[] = [
  // -- Patrones base ---------------------------------------------------------
  {
    id: "sentadilla_goblet",
    nombre: "Sentadilla goblet",
    nivel: "PRINCIPIANTE",
    categoria: "Patrones",
    como: "Pesa rusa o mancuerna sujeta al pecho, sentadilla completa con los codos por dentro de las rodillas.",
    para: "El contrapeso al frente endereza el tronco solo: es la forma más rápida de aprender a sentarse bien.",
    ojo: "Separar la pesa del pecho al bajar. Si se aleja, el peso lo sostiene la espalda.",
  },
  {
    id: "bisagra_cadera",
    nombre: "Bisagra de cadera",
    nivel: "PRINCIPIANTE",
    categoria: "Patrones",
    como: "Cadera atrás con la espalda neutra y las rodillas apenas flexionadas, hasta sentir el isquio.",
    para: "El patrón que más se usa y peor se ejecuta. Bien hecho protege la espalda en todo lo demás.",
    ojo: "Redondear la lumbar al bajar. Si no puedes mantenerla neutra, acorta el recorrido.",
  },
  {
    id: "zancada",
    nombre: "Zancada",
    nivel: "PRINCIPIANTE",
    categoria: "Patrones",
    como: "Paso largo al frente, rodilla de atrás casi al suelo, tronco vertical, y empuja con el talón de adelante.",
    para: "Trabaja cada pierna por separado y expone el desbalance que la sentadilla esconde.",
    ojo: "Rodilla que se mete hacia dentro. Antes de sumar peso, corrige eso.",
  },
  {
    id: "peso_muerto_una_pierna",
    nombre: "Peso muerto a una pierna",
    nivel: "INTERMEDIO",
    categoria: "Patrones",
    como: "Bisagra apoyado en un pie, la otra pierna se extiende atrás como contrapeso, cadera cerrada sin abrirse al lado.",
    para: "Fuerza de cadena posterior más equilibrio: el ejercicio que más previene tropiezos y torceduras.",
    ojo: "Abrir la cadera de la pierna que sube. La cadera se queda cuadrada al piso.",
  },
  {
    id: "step_up",
    nombre: "Subida al cajón",
    nivel: "PRINCIPIANTE",
    categoria: "Patrones",
    como: "Sube apoyando el pie completo y empujando con esa pierna, sin impulsarte con la de abajo.",
    para: "Patrón de escalón unilateral con carga baja: el más transferible a la vida diaria.",
    ojo: "Empujar con la pierna de abajo. Si te ayudas, la pierna que trabaja no trabaja.",
  },

  // -- Empuje y tirón --------------------------------------------------------
  {
    id: "flexion",
    nombre: "Flexión",
    nivel: "PRINCIPIANTE",
    categoria: "Empuje",
    como: "Manos bajo los hombros, cuerpo en línea de la cabeza al talón, codos a 45 grados al bajar.",
    para: "El empuje horizontal sin equipo, y el que más rápido delata si el core aguanta.",
    ojo: "Cadera que se hunde o que sube. Si la línea se rompe, hazla inclinada en una banca.",
  },
  {
    id: "press_hombro",
    nombre: "Press de hombro de pie",
    nivel: "PRINCIPIANTE",
    categoria: "Empuje",
    como: "Mancuernas a la altura de los hombros, empuja arriba sin arquear la espalda, glúteo apretado.",
    para: "De pie obliga al core a trabajar: es un ejercicio de hombro y de tronco a la vez.",
    ojo: "Arquear la lumbar para sacar el peso. Si hay que arquear, sobra peso.",
  },
  {
    id: "remo_mancuerna",
    nombre: "Remo con mancuerna",
    nivel: "PRINCIPIANTE",
    categoria: "Tirón",
    como: "Apoyo en banca, tira del codo pegado al cuerpo hasta la cadera, sin girar el tronco.",
    para: "Equilibra todo el empuje del circuito. Sin tirón, el hombro se cierra hacia adelante.",
    ojo: "Rotar el tronco para subir más. Eso no es más rango, es trampa con la espalda.",
  },
  {
    id: "remo_invertido",
    nombre: "Remo invertido",
    nivel: "INTERMEDIO",
    categoria: "Tirón",
    como: "Colgado bajo una barra o unas anillas, cuerpo recto, tira del pecho hacia la barra.",
    para: "Tirón horizontal con el propio peso, escalable con solo cambiar la altura de los pies.",
    ojo: "Sacar la cadera. El cuerpo sube entero, como una plancha que se acerca.",
  },
  {
    id: "dominada_asistida",
    nombre: "Dominada asistida",
    nivel: "INTERMEDIO",
    categoria: "Tirón",
    como: "Con banda o máquina, sube llevando los codos abajo y atrás, con los hombros lejos de las orejas.",
    para: "El tirón vertical: el que menos gente hace y el que más cambia la postura.",
    ojo: "Encoger los hombros al inicio. El movimiento empieza deprimiendo la escápula, no tirando con el brazo.",
  },

  // -- Core ------------------------------------------------------------------
  {
    id: "plancha",
    nombre: "Plancha",
    nivel: "PRINCIPIANTE",
    categoria: "Core",
    como: "Codos bajo los hombros, glúteo apretado, costillas abajo, cuerpo en línea.",
    para: "El core se entrena aguantando, no doblándose. Es la posición base de todo lo demás.",
    ojo: "Subir la cadera para descansar. Si la cadera sube, el ejercicio se acabó.",
  },
  {
    id: "pallof",
    nombre: "Press Pallof",
    nivel: "INTERMEDIO",
    categoria: "Core",
    como: "De pie y de costado a una polea o banda, empuja las manos al frente resistiendo la rotación.",
    para: "Anti-rotación: entrena al core en su trabajo real, que es impedir movimiento, no producirlo.",
    ojo: "Girar el tronco al empujar. Si giras, la banda ganó.",
  },
  {
    id: "dead_bug",
    nombre: "Dead bug",
    nivel: "PRINCIPIANTE",
    categoria: "Core",
    como: "Boca arriba, baja el brazo y la pierna contrarios manteniendo la lumbar pegada al piso.",
    para: "Enseña a mover las extremidades sin que la espalda se arquee, que es la base del control del tronco.",
    ojo: "Despegar la lumbar. Cuando se despega, se acortó el recorrido.",
  },
  {
    id: "plancha_lateral",
    nombre: "Plancha lateral",
    nivel: "INTERMEDIO",
    categoria: "Core",
    como: "Apoyo en un codo y el canto del pie, cadera arriba, cuerpo en línea vista de frente.",
    para: "Trabaja el lateral del tronco, que es el que sostiene la cadera al correr y al cargar de un lado.",
    ojo: "Dejar caer la cadera. Mejor aguantar menos tiempo con la cadera arriba.",
  },
  {
    id: "hollow",
    nombre: "Hollow hold",
    nivel: "AVANZADO",
    categoria: "Core",
    como: "Boca arriba, lumbar pegada al suelo, brazos y piernas extendidos y elevados, cuerpo en forma de plátano.",
    para: "La posición base de la gimnasia: es lo que sostiene el cuerpo rígido colgado de una barra.",
    ojo: "Arquear la espalda para bajar más las piernas. Se sube el ángulo hasta que la lumbar quede pegada.",
  },

  // -- Cardiovascular --------------------------------------------------------
  {
    id: "jumping_jack",
    nombre: "Jumping jack",
    nivel: "PRINCIPIANTE",
    categoria: "Cardiovascular",
    como: "Salto abriendo piernas y subiendo brazos, y otro cerrando. Ritmo continuo.",
    para: "Sube el pulso sin equipo y sirve de calentamiento en cualquier lado.",
    ojo: "Aterrizar con la pierna rígida. Se cae con la rodilla suave.",
  },
  {
    id: "mountain_climber",
    nombre: "Escalador",
    nivel: "PRINCIPIANTE",
    categoria: "Cardiovascular",
    como: "En plancha, lleva las rodillas al pecho alternadas sin que la cadera suba.",
    para: "Junta core y pulso alto: es la forma más barata de meter cardio a un circuito de fuerza.",
    ojo: "Rebotar la cadera arriba y abajo. La plancha se mantiene mientras las piernas se mueven.",
  },
  {
    id: "burpee_funcional",
    nombre: "Burpee",
    nivel: "PRINCIPIANTE",
    categoria: "Cardiovascular",
    como: "Al piso con el pecho, vuelve de un salto y salta con las manos arriba.",
    para: "El movimiento que más rápido sube el pulso sin nada de equipo.",
    ojo: "Acelerar las primeras diez. En circuito se hace a ritmo constante o te come.",
  },
  {
    id: "skater",
    nombre: "Saltos de patinador",
    nivel: "INTERMEDIO",
    categoria: "Cardiovascular",
    como: "Saltos laterales de un pie al otro, aterrizando con la rodilla suave y el tronco estable.",
    para: "El único plano que casi nadie entrena: el lateral. Protege tobillo y rodilla en deportes de cambio de dirección.",
    ojo: "Aterrizar con la rodilla hacia dentro. Si pasa, acorta el salto.",
  },
  {
    id: "kb_swing_funcional",
    nombre: "Swing con pesa rusa",
    nivel: "INTERMEDIO",
    categoria: "Cardiovascular",
    como: "Bisagra explosiva de cadera, la pesa sube por el impulso hasta la altura del pecho.",
    para: "Fuerza de cadena posterior y pulso alto a la vez. El mejor puente entre fuerza y cardio.",
    ojo: "Levantar con los brazos o ponerse en cuclillas. Ahí no trabaja la cadera, que es todo el punto.",
  },
  {
    id: "battle_ropes",
    nombre: "Cuerdas de batalla",
    nivel: "INTERMEDIO",
    categoria: "Cardiovascular",
    como: "Media sentadilla estable y ondas alternadas o simultáneas con brazos relajados.",
    para: "Sube el pulso muchísimo sin impacto en rodilla ni tobillo: útil cuando la pierna está cargada.",
    ojo: "Tensar los hombros. La onda sale de la cadera y del tronco, no de apretar los brazos.",
  },

  // -- Acarreos --------------------------------------------------------------
  {
    id: "farmer_carry",
    nombre: "Caminata del granjero",
    nivel: "PRINCIPIANTE",
    categoria: "Acarreos",
    como: "Una pesa pesada en cada mano, camina erguido con pasos cortos, hombros atrás.",
    para: "Agarre, core y postura de una sola vez, y es lo más parecido a cargar el súper que existe en un gimnasio.",
    ojo: "Encoger los hombros o inclinarte. Si el cuerpo se dobla, sobra peso.",
  },
  {
    id: "suitcase_carry",
    nombre: "Acarreo a un lado",
    nivel: "INTERMEDIO",
    categoria: "Acarreos",
    como: "Una sola pesa en una mano; camina sin inclinarte hacia ese lado.",
    para: "Anti-inclinación lateral: entrena al core a resistir una carga descentrada, que es como aparece en la vida.",
    ojo: "Inclinarse al lado del peso. Baja el peso hasta poder caminar recto.",
  },
  {
    id: "sled_push",
    nombre: "Empuje de trineo",
    nivel: "INTERMEDIO",
    categoria: "Acarreos",
    como: "Cuerpo inclinado, brazos extendidos y empuje continuo con pasos cortos y potentes.",
    para: "Fuerza de piernas sin fase excéntrica: cansa mucho y deja poca agujeta, ideal cerca de un día de pierna.",
    ojo: "Dar pasos largos. El trineo se mueve con muchos pasos cortos, no con zancadas.",
  },
  {
    id: "bear_crawl",
    nombre: "Bear crawl",
    nivel: "AVANZADO",
    categoria: "Acarreos",
    como: "Rodillas a un palmo del suelo, avanza moviendo mano y pie contrarios sin que la cadera oscile.",
    para: "Coordinación contralateral y core bajo tensión: engañosamente duro y sin ningún equipo.",
    ojo: "Subir la cadera. Se avanza bajo, aunque avance menos.",
  },
];
