import type { EjercicioDisciplina } from "@/lib/tecnica/tipos";

/**
 * Squash — golpes, movimiento y ejercicios de cancha.
 *
 * La idea que ordena esta biblioteca: en squash casi todos los errores son de
 * **posición**, no de raqueta. Por eso el bloque de movimiento pesa tanto como
 * el de golpeo, y por eso los ejercicios en solitario —los que se hacen sin
 * compañero— aparecen antes que los patrones de dos.
 */
export const SQUASH: EjercicioDisciplina[] = [
  // -- Golpes ----------------------------------------------------------------
  {
    id: "drive_paralelo",
    nombre: "Drive paralelo",
    nivel: "PRINCIPIANTE",
    categoria: "Golpes",
    como: "Golpe recto pegado a la pared lateral, buscando que muera al fondo de la cancha.",
    para: "El golpe base del squash: obliga al otro a ir al fondo mientras tú vuelves a la T.",
    ojo: "Abrir la cara de la raqueta y mandarla al centro, que es servirle el punto en bandeja.",
  },
  {
    id: "cruzado",
    nombre: "Cruzado",
    nivel: "PRINCIPIANTE",
    categoria: "Golpes",
    como: "Golpe en diagonal que cruza la cancha y muere en la esquina contraria, pasando ancho.",
    para: "Cambia el lado del juego y saca al rival de su posición cómoda.",
    ojo: "Cruzarla corta y por el centro: es la pelota que te devuelven en volea y te deja vendido.",
  },
  {
    id: "servicio_lob",
    nombre: "Servicio alto",
    nivel: "PRINCIPIANTE",
    categoria: "Golpes",
    como: "Saque alto y suave que toca la pared lateral y muere en la esquina del fondo.",
    para: "El servicio es el único golpe que controlas al cien por ciento: mal usado, regalas el punto de salida.",
    ojo: "Sacar fuerte y plano. En squash el saque es de colocación, no de potencia.",
  },
  {
    id: "boast",
    nombre: "Boast",
    nivel: "INTERMEDIO",
    categoria: "Golpes",
    como: "Golpe a la pared lateral que rebota al frontis y muere corto en la esquina opuesta.",
    para: "La salida cuando te atrapan al fondo, y la forma de mandar al rival al frente.",
    ojo: "Usarlo desde el centro. El boast se juega desde el fondo; desde la T es un regalo.",
  },
  {
    id: "dejada",
    nombre: "Dejada (drop)",
    nivel: "INTERMEDIO",
    categoria: "Golpes",
    como: "Golpe corto y suave al frente, raqueta abierta y cuerpo bajo, para que muera cerca del frontis.",
    para: "Rompe el ritmo y saca al otro de la T. Vale por la sorpresa, no por la potencia.",
    ojo: "Anunciarla con la postura. Si preparas distinto que en el drive, se ve venir desde el otro lado.",
  },
  {
    id: "lob",
    nombre: "Lob",
    nivel: "INTERMEDIO",
    categoria: "Golpes",
    como: "Golpe alto y lento que pasa por encima del rival y muere al fondo.",
    para: "Es el botón de pausa del squash: te da tiempo de volver a la T cuando vas a contrapié.",
    ojo: "Quedarse corto. Un lob corto es un remate servido.",
  },
  {
    id: "volea",
    nombre: "Volea",
    nivel: "INTERMEDIO",
    categoria: "Golpes",
    como: "Golpear la pelota antes de que bote, con preparación corta y muñeca firme.",
    para: "Roba tiempo al rival y es la forma de mantener el control de la T.",
    ojo: "Preparar como en un drive de fondo. La volea es corta: si preparas largo, ya pasó.",
  },
  {
    id: "nick",
    nombre: "Nick",
    nivel: "AVANZADO",
    categoria: "Golpes",
    como: "Golpe que muere justo en la unión de la pared lateral con el suelo, sin bote útil.",
    para: "El punto ganador más limpio del deporte cuando sale.",
    ojo: "Buscarlo todo el tiempo. Es un golpe de bajo margen: se intenta cuando el punto ya está a favor.",
  },

  // -- Movimiento ------------------------------------------------------------
  {
    id: "vuelta_t",
    nombre: "Vuelta a la T",
    nivel: "PRINCIPIANTE",
    categoria: "Movimiento",
    como: "Después de cada golpe, dos o tres pasos de vuelta al centro de la cancha.",
    para: "Decide si llegas al siguiente punto parado o corriendo. Casi todos los errores son de posición.",
    ojo: "Quedarse admirando el golpe. La vuelta empieza antes de que la pelota toque la pared.",
  },
  {
    id: "split_step",
    nombre: "Paso de reacción",
    nivel: "INTERMEDIO",
    categoria: "Movimiento",
    como: "Pequeño salto con los dos pies justo cuando el rival golpea, para caer listo a salir.",
    para: "Es lo que convierte una reacción tardía en una salida inmediata, en cualquier dirección.",
    ojo: "Quedarse plantado esperando a ver dónde va. Para entonces ya perdiste medio paso.",
  },
  {
    id: "lunge",
    nombre: "Estirada (lunge)",
    nivel: "PRINCIPIANTE",
    categoria: "Movimiento",
    como: "Último paso largo con la pierna del lado del golpe, rodilla alineada con el pie, tronco erguido.",
    para: "Es el paso con el que se llega a las pelotas cortas, y el que más protege la rodilla si se hace bien.",
    ojo: "Llegar con la rodilla por delante de la punta del pie y el tronco doblado. Ahí aparece la molestia lumbar y de rodilla.",
  },
  {
    id: "ghosting",
    nombre: "Fantasmas (ghosting)",
    nivel: "INTERMEDIO",
    categoria: "Movimiento",
    como: "Recorrido a las esquinas sin pelota, simulando el golpe y volviendo a la T cada vez.",
    para: "El acondicionamiento específico del squash: la mejor forma de llegar entero al tercer juego.",
    ojo: "Hacerlo lento y sin intención. Se hace a ritmo de partido o no entrena nada.",
  },
  {
    id: "posicion_baja",
    nombre: "Posición baja",
    nivel: "PRINCIPIANTE",
    categoria: "Movimiento",
    como: "Rodilla flexionada y peso adelante al golpear, sin doblar la espalda.",
    para: "Baja el centro de gravedad y deja salir en cualquier dirección.",
    ojo: "Agacharse doblando la espalda en vez de la rodilla.",
  },

  // -- Ejercicios de cancha --------------------------------------------------
  {
    id: "solo_drive",
    nombre: "Drive en solitario",
    nivel: "PRINCIPIANTE",
    categoria: "Ejercicios",
    como: "Solo en cancha, golpea paralelos seguidos contra la pared frontal buscando el mismo punto.",
    para: "La forma más barata de mejorar: no necesita compañero y arregla la precisión aburriéndose.",
    ojo: "Golpear fuerte para que rebote más. Se busca repetir el punto, no la potencia.",
  },
  {
    id: "figura_ocho",
    nombre: "Figura de ocho",
    nivel: "INTERMEDIO",
    categoria: "Ejercicios",
    como: "Alterna cruzados de derecha y de revés en un patrón continuo, sin dejar caer el ritmo.",
    para: "Entrena el cruzado y el movimiento lateral a la vez, y es el mejor calentamiento en solitario.",
    ojo: "Cruzar demasiado corto. Si la pelota pasa por el centro, el patrón se rompe.",
  },
  {
    id: "drill_dos_frente_fondo",
    nombre: "Uno al frente, otro al fondo",
    nivel: "INTERMEDIO",
    categoria: "Ejercicios",
    como: "Un jugador solo juega dejadas y el otro solo pelotas al fondo, por tiempo, y después cambian.",
    para: "El condicionado clásico: entrena un golpe con presión real y sin depender del marcador.",
    ojo: "Convertirlo en partido. El punto de un condicionado es repetir, no ganar.",
  },
  {
    id: "drill_volea",
    nombre: "Voleas seguidas",
    nivel: "AVANZADO",
    categoria: "Ejercicios",
    como: "Peloteo de voleas sin dejar botar, desde la zona de la T, a ritmo alto.",
    para: "Entrena el control de la T y la preparación corta, que es lo que separa el nivel alto.",
    ojo: "Retroceder al primer apuro. El punto del ejercicio es aguantar en la T.",
  },
];
