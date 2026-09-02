import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Correr — técnica, tipos de sesión y fuerza específica.
 *
 * Aquí la biblioteca tiene una función distinta a la de las demás: en correr
 * casi nadie se lesiona por técnica, se lesiona por **volumen y ritmo mal
 * repartidos**. Por eso los tipos de sesión ocupan tanto lugar como los
 * ejercicios de técnica: saber qué es un rodaje fácil y respetarlo previene
 * más lesiones que cualquier corrección de pisada.
 */
export const RUNNING: EjercicioDisciplina[] = [
  // -- Técnica ---------------------------------------------------------------
  {
    id: "cadencia",
    nombre: "Cadencia",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Pasos más cortos y frecuentes, alrededor de 170-180 por minuto.",
    para: "Reduce el frenado de cada zancada, que es de donde sale gran parte del impacto en rodilla.",
    ojo: "Buscar zancada larga. La zancada larga aterriza con el talón por delante del cuerpo y frena.",
  },
  {
    id: "pisada",
    nombre: "Pisada bajo el cuerpo",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "El pie toca el suelo debajo de la cadera, no por delante.",
    para: "Es la diferencia entre amortiguar con el músculo o con la articulación.",
    ojo: "Obsesionarse con talón o punta. Importa mucho menos que DÓNDE aterrizas.",
  },
  {
    id: "postura_running",
    nombre: "Postura",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Tronco erguido con inclinación mínima desde el tobillo, mirada al frente, hombros sueltos.",
    para: "Deja respirar y evita que la cadera se hunda cuando llega el cansancio.",
    ojo: "Doblarse desde la cintura al final del rodaje. Ahí aparecen las molestias lumbares.",
  },
  {
    id: "brazos",
    nombre: "Braceo",
    nivel: "PRINCIPIANTE",
    categoria: "Técnica",
    como: "Codos a noventa grados, movimiento adelante y atrás sin cruzar la línea media del cuerpo.",
    para: "Los brazos equilibran la rotación de las piernas: mal usados, hacen serpentear el tronco.",
    ojo: "Cruzar las manos por delante del pecho. Eso obliga a la cadera a compensar en cada paso.",
  },

  // -- Ejercicios de técnica -------------------------------------------------
  {
    id: "a_skip",
    nombre: "A-skip",
    nivel: "INTERMEDIO",
    categoria: "Ejercicios",
    como: "Saltos cortos elevando la rodilla al frente con el tobillo firme, apoyo bajo la cadera.",
    para: "Enseña la posición de la rodilla y el tobillo en el momento del apoyo. Es el ejercicio de técnica más usado del atletismo.",
    ojo: "Hacerlo alto y lento. Se busca frecuencia y contacto corto, no altura.",
  },
  {
    id: "taloneo",
    nombre: "Taloneo",
    nivel: "INTERMEDIO",
    categoria: "Ejercicios",
    como: "Trote corto llevando el talón al glúteo, con el muslo casi vertical.",
    para: "Trabaja el recobro de la pierna, que es lo que permite subir de cadencia sin gastar más.",
    ojo: "Inclinarse hacia adelante para alcanzar el glúteo. El tronco se queda erguido.",
    videoPath: "library/taloneo.mp4",
    videoLicense: "Dominio público",
    videoAuthor: null,
  },
  {
    id: "zancadas",
    nombre: "Zancadas (strides)",
    nivel: "INTERMEDIO",
    categoria: "Ejercicios",
    como: "4 a 6 aceleraciones de 20 segundos hasta ritmo rápido, con recuperación completa entre cada una.",
    para: "Recuerda al cuerpo cómo correr rápido sin acumular fatiga. Van al final de un rodaje fácil.",
    ojo: "Convertirlas en series. Son aceleraciones cortas, no trabajo de calidad.",
  },

  // -- Tipos de sesión -------------------------------------------------------
  {
    id: "rodaje_facil",
    nombre: "Rodaje fácil",
    nivel: "PRINCIPIANTE",
    categoria: "Sesiones",
    como: "Ritmo de conversación: tienes que poder decir una frase completa sin cortarte.",
    para: "Es la mayor parte del kilometraje de cualquiera que corra bien, y lo que construye la base aeróbica.",
    ojo: "Correr todos los días a ritmo medio-duro. Es el error más común y el que menos mejora.",
  },
  {
    id: "corre_camina",
    nombre: "Corre y camina",
    nivel: "PRINCIPIANTE",
    categoria: "Sesiones",
    como: "Bloques de 1-2 minutos corriendo y 1-2 caminando, repetidos.",
    para: "Deja acumular minutos de carrera sin que el tendón reciba la carga de golpe.",
    ojo: "Saltarse la caminata porque 'ya se puede'. La progresión funciona porque es gradual.",
  },
  {
    id: "tempo",
    nombre: "Tempo",
    nivel: "INTERMEDIO",
    categoria: "Sesiones",
    como: "20-40 minutos a un ritmo cómodamente duro: puedes decir tres palabras, no una frase.",
    para: "Mueve el umbral, que es el ritmo que puedes sostener mucho tiempo.",
    ojo: "Correrlo como carrera. Si terminas vaciado, ibas por encima del tempo.",
  },
  {
    id: "series",
    nombre: "Series",
    nivel: "INTERMEDIO",
    categoria: "Sesiones",
    como: "Repeticiones de 2 a 5 minutos fuertes con trote de recuperación entre ellas.",
    para: "Sube el techo aeróbico. Es la sesión que más rápido mejora el ritmo.",
    ojo: "Empezar demasiado rápido. Si la última serie es mucho más lenta que la primera, la sesión estuvo mal repartida.",
  },
  {
    id: "fartlek",
    nombre: "Fartlek",
    nivel: "INTERMEDIO",
    categoria: "Sesiones",
    como: "Cambios de ritmo libres dentro del rodaje: acelera hasta un poste, afloja hasta el siguiente.",
    para: "Mete calidad sin la rigidez de la pista. Bueno cuando la cabeza no está para series.",
    ojo: "Que se convierta en un rodaje rápido de principio a fin. Los cambios necesitan tramos suaves de verdad.",
  },
  {
    id: "cuestas",
    nombre: "Cuestas",
    nivel: "AVANZADO",
    categoria: "Sesiones",
    como: "Repeticiones cortas subiendo una pendiente moderada, bajando trotando o caminando.",
    para: "Fuerza específica con menos impacto que la velocidad en llano: subir amortigua.",
    ojo: "Bajar rápido. La bajada es donde de verdad se castiga el cuádriceps y la rodilla.",
  },
  {
    id: "tirada_larga",
    nombre: "Tirada larga",
    nivel: "INTERMEDIO",
    categoria: "Sesiones",
    como: "La sesión más larga de la semana, a ritmo fácil, subiendo poco a poco cada semana.",
    para: "Construye resistencia y adapta tendones y huesos, que necesitan más tiempo que los pulmones.",
    ojo: "Subirla de golpe. Un salto grande en la larga es la causa más frecuente de lesión por sobrecarga.",
  },

  // -- Fuerza específica -----------------------------------------------------
  {
    id: "gemelo",
    nombre: "Elevación de talón",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Sube y baja el talón apoyado en un escalón, primero a dos piernas y después a una.",
    para: "El gemelo y el aquíleo aguantan varias veces tu peso en cada zancada. Es la fuerza que más previene lesiones al correr.",
    ojo: "Hacerlo rápido y corto. Se busca recorrido completo y control al bajar.",
    videoPath: "library/elevacion-de-talon.mp4",
    videoLicense: "CC-BY-SA 4.0",
    videoAuthor: "Goulart",
  },
  {
    id: "puente_gluteo",
    nombre: "Puente de glúteo",
    nivel: "PRINCIPIANTE",
    categoria: "Fuerza",
    como: "Boca arriba, sube la cadera apretando el glúteo sin arquear la lumbar.",
    para: "Un glúteo fuerte estabiliza la cadera en cada apoyo y evita que la rodilla se meta hacia dentro.",
    ojo: "Empujar con la lumbar. Si sientes la espalda baja, baja el rango y aprieta el glúteo.",
    videoPath: "library/puente-de-gluteo.mp4",
    videoLicense: "Dominio público",
    videoAuthor: null,
  },
  {
    id: "sentadilla_unipodal",
    nombre: "Sentadilla a una pierna",
    nivel: "AVANZADO",
    categoria: "Fuerza",
    como: "Baja controlado sobre una pierna manteniendo la rodilla alineada con el pie.",
    para: "Correr es saltar de una pierna a la otra: la fuerza que importa es unilateral.",
    ojo: "Dejar caer la cadera del lado libre. Si pasa, sujétate de algo y baja menos.",
    videoPath: "library/sentadilla-a-una-pierna.mp4",
    videoLicense: "Dominio público",
    videoAuthor: null,
  },
];
