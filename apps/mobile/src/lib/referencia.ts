/**
 * Referencia numérica: convertir el cuerpo de otra persona en metas propias.
 *
 * Hasta aquí la referencia era una foto y la lectura era ordinal —cerca, a
 * medio camino, lejos— porque de una foto no salen centímetros. Cuando existen
 * medidas publicadas de la referencia, sí se puede aterrizar en números; lo
 * que NO se puede es copiarlos tal cual.
 *
 * Cómo se traducen, y por qué así:
 *
 * 1. **Las medidas lineales se escalan por estatura.** Una cintura de 77 cm en
 *    alguien de 1.78 m no significa lo mismo en alguien de 1.60 m. Lo que se
 *    conserva es la PROPORCIÓN, no el centímetro.
 * 2. **Las de extremidades se escalan contra la cintura objetivo, no contra la
 *    estatura.** El muslo y el brazo describen desarrollo muscular relativo al
 *    tronco; anclarlos a la estatura produce metas absurdas en cuanto las dos
 *    personas tienen complexiones distintas.
 * 3. **El porcentaje de grasa NO se copia entre sexos.** La grasa esencial de
 *    una mujer es estructuralmente mayor que la de un hombre, y trasladar un
 *    8 % masculino a una meta femenina es empujar hacia un rango asociado a
 *    pérdida de menstruación y de densidad ósea. Ahí la app se detiene y lo
 *    dice.
 *
 * Nada de esto es una prescripción: es aritmética de proporciones sobre datos
 * que la persona eligió como referencia.
 */

export type MedidasReferencia = {
  /** Cómo se llama, para poder decirlo en pantalla. */
  nombre: string;
  /** Estatura de la referencia, en cm. Es el ancla de todo el escalado. */
  estaturaCm: number;
  sexo: "FEMALE" | "MALE";
  cinturaCm: number | null;
  musloCm: number | null;
  brazoCm: number | null;
  pechoCm: number | null;
  /** Porcentaje de grasa reportado. Se enseña, no se copia. */
  grasaPct: number | null;
  /** De dónde salieron los números. Sin fuente, esto es un rumor. */
  fuente: string | null;
};

export type MetaZona = {
  label: string;
  /** La meta ya escalada a tu cuerpo, en cm. */
  metaCm: number;
  /** Cómo se calculó, en una línea. */
  origen: string;
};

export type LecturaReferencia = {
  metas: MetaZona[];
  /** Avisos que hay que leer antes de perseguir estos números. */
  avisos: string[];
};

/**
 * Pisos de grasa corporal que la app no cruza al sugerir metas.
 *
 * Son los rangos de uso común para deportistas sanos; por debajo de ahí el
 * asunto deja de ser estético y entra en terreno clínico (en mujeres, la
 * disfunción menstrual y la pérdida de densidad ósea son las primeras en
 * aparecer). La app no prescribe grasa corporal: solo se niega a sugerir un
 * número por debajo de esto.
 */
const PISO_GRASA_PCT: Record<"FEMALE" | "MALE", number> = { FEMALE: 18, MALE: 10 };

/**
 * Una referencia conocida, con sus números publicados.
 *
 * Está aquí como PRESET, no como recomendación: es un ejemplo con fuente para
 * no tener que teclear ocho campos. Cualquier otra referencia se captura a
 * mano y funciona igual.
 */
export const REFERENCIAS_CONOCIDAS: MedidasReferencia[] = [
  {
    nombre: "Yun Sung-bin",
    estaturaCm: 178,
    sexo: "MALE",
    cinturaCm: 77,
    musloCm: 66,
    brazoCm: 42,
    pechoCm: 114,
    grasaPct: 8.3,
    fuente: "InBody publicado tras su retiro olímpico (2022): 91 kg, 48.9 kg de músculo esquelético",
  },
];

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Las metas de la persona a partir de una referencia.
 *
 * `estaturaCm` y `sexo` son de quien entrena; `referencia` es de quien se toma
 * como norte. Cuando los sexos no coinciden, el aviso lo dice: no para
 * descalificar la referencia —la forma sí transfiere— sino para que nadie
 * persiga un porcentaje de grasa que no le corresponde.
 */
export function metasDesdeReferencia(input: {
  estaturaCm: number | null;
  sexo: "FEMALE" | "MALE" | "OTHER" | null;
  referencia: MedidasReferencia;
}): LecturaReferencia {
  const { estaturaCm, referencia } = input;
  const avisos: string[] = [];

  if (!estaturaCm || estaturaCm <= 0) {
    return {
      metas: [],
      avisos: ["Falta tu estatura en el perfil: sin ella no se pueden escalar las proporciones."],
    };
  }

  const factor = estaturaCm / referencia.estaturaCm;
  const metas: MetaZona[] = [];

  // La cintura escala con la estatura: es la medida del tronco y la que mejor
  // aguanta la comparación entre complexiones.
  if (referencia.cinturaCm !== null) {
    const metaCintura = redondear(referencia.cinturaCm * factor);
    metas.push({
      label: "Cintura",
      metaCm: metaCintura,
      origen: `proporción ${(referencia.cinturaCm / referencia.estaturaCm).toFixed(2)} de su estatura, aplicada a la tuya`,
    });

    // Las extremidades se anclan a TU cintura objetivo, no a tu estatura: lo
    // que describen es desarrollo muscular relativo al tronco.
    if (referencia.musloCm !== null) {
      metas.push({
        label: "Piernas",
        metaCm: redondear((referencia.musloCm / referencia.cinturaCm) * metaCintura),
        origen: `su muslo es ${(referencia.musloCm / referencia.cinturaCm).toFixed(2)}× su cintura`,
      });
    }
    if (referencia.brazoCm !== null) {
      metas.push({
        label: "Brazos",
        metaCm: redondear((referencia.brazoCm / referencia.cinturaCm) * metaCintura),
        origen: `su brazo es ${(referencia.brazoCm / referencia.cinturaCm).toFixed(2)}× su cintura`,
      });
    }
  }

  // La razón cintura-estatura de salud manda sobre cualquier referencia: si la
  // proporción copiada quedara por encima de 0.5, la meta deja de ser un norte
  // y se vuelve un problema.
  const cintura = metas.find((meta) => meta.label === "Cintura");
  if (cintura && cintura.metaCm > estaturaCm * 0.5) {
    cintura.metaCm = redondear(estaturaCm * 0.5);
    cintura.origen = "la mitad de tu estatura: la referencia quedaba por encima de ese corte";
  }

  if (input.sexo && input.sexo !== referencia.sexo) {
    avisos.push(
      "Tu referencia es de otro sexo. Las proporciones —cintura contra estatura, brazo y pierna " +
        "contra cintura— sí transfieren; el porcentaje de grasa no, y por eso no se copia.",
    );
  }

  if (referencia.grasaPct !== null) {
    const piso = PISO_GRASA_PCT[input.sexo === "MALE" ? "MALE" : "FEMALE"];
    if (referencia.grasaPct < piso) {
      avisos.push(
        `Su ${referencia.grasaPct} % de grasa está por debajo del piso que esta app sugiere ` +
          `(${piso} %). Debajo de ahí deja de ser una meta estética y lo revisa un médico, no una app.`,
      );
    }
  }

  avisos.push(
    "Son proporciones, no promesas: la estructura ósea y el reparto de grasa son tuyos y no se negocian.",
  );

  return { metas, avisos };
}

/** Cuánto falta para una meta, con dirección. */
export function faltaPara(actual: number | null, meta: number): string {
  if (actual === null) return "sin medir todavía";
  const diferencia = redondear(meta - actual);
  if (Math.abs(diferencia) < 0.5) return "ya estás ahí";
  return `${Math.abs(diferencia)} cm ${diferencia < 0 ? "por bajar" : "por subir"}`;
}
