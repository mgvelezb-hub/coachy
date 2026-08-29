/**
 * Triage de la nutrióloga virtual (Fase 8) — lógica PURA.
 *
 * La app responde dudas de alimentación sobre el plan que ella misma generó.
 * Hay preguntas que no le tocan, y el triage existe para pararlas **antes** de
 * que ninguna IA redacte nada: el freno es determinista, no una instrucción en
 * un prompt que el modelo puede ignorar o que alguien puede rodear pidiéndolo
 * de otra forma.
 *
 * Tres cosas frenan la respuesta:
 *
 * 1. **Urgencia médica** — dolor en el pecho, desmayo, sangrado. Se manda a
 *    servicios de emergencia, sin más texto alrededor.
 * 2. **Contexto clínico** — embarazo, lactancia, diabetes con medicamento,
 *    riñón, hígado, cirugía bariátrica. Un plan generado por reglas no puede
 *    responder ahí, y ninguna redacción bonita lo arregla.
 * 3. **Señales de trastorno de la conducta alimentaria** — es el caso donde
 *    una respuesta "técnicamente correcta" sobre calorías hace daño.
 *
 * El triage está escrito para equivocarse hacia frenar de más: una pregunta
 * inocente que se derive a un profesional cuesta una molestia; una pregunta
 * clínica respondida por un motor de reglas cuesta otra cosa.
 */

export type TriageCategory = "URGENCIA" | "CLINICO" | "TCA" | "FUERA_DE_ALCANCE" | "OK";

export type TriageResult = {
  category: TriageCategory;
  /** `true` cuando la app no debe responder la pregunta. */
  blocked: boolean;
  /** Lo que se le dice a la persona. Vacío si no hay bloqueo. */
  message: string;
  /** Qué disparó el freno, para el registro del admin. Nunca se muestra. */
  matched: string[];
};

/** Normaliza para comparar: sin acentos, minúsculas, espacios colapsados. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const URGENCIA = [
  "dolor en el pecho",
  "dolor de pecho",
  "me desmaye",
  "desmayo",
  "no puedo respirar",
  "dificultad para respirar",
  "sangre en",
  "sangrado",
  "vomito sangre",
  "convulsion",
  "me quiero morir",
  "quitarme la vida",
];

const CLINICO = [
  "embarazo",
  "embarazada",
  "lactancia",
  "amamant",
  "diabetes",
  "insulina",
  "metformina",
  "hipotiroidismo",
  "tiroides",
  "reflujo",
  "gastritis cronica",
  "colitis",
  "rinon",
  "renal",
  "higado",
  "hepatic",
  "hipertension",
  "presion alta",
  "colesterol alto",
  "trigliceridos altos",
  "quimioterapia",
  "cirugia bariatrica",
  "manga gastrica",
  "bypass gastrico",
  "medicamento",
  "receta",
  "anemia",
  "menor de edad",
  "mi hijo",
  "mi hija de",
];

const TCA = [
  "vomitar",
  "provocarme el vomito",
  "laxante",
  "atracon",
  "no comer nada",
  "dejar de comer",
  "ayunar varios dias",
  "purga",
  "odio mi cuerpo",
  "me da asco mi cuerpo",
  "500 calorias",
  "300 calorias",
];

/** Temas que no son de esta app aunque suenen a nutrición. */
const FUERA_DE_ALCANCE = [
  "esteroide",
  "anabolico",
  "clembuterol",
  "clenbuterol",
  "sarms",
  "diuretico",
  "quemador de grasa",
  "pastillas para bajar",
  "inyecc",
  "ozempic",
  "semaglutida",
];

function hits(text: string, needles: string[]): string[] {
  return needles.filter((needle) => text.includes(needle));
}

const MENSAJE_URGENCIA =
  "Eso que describes necesita atención médica ahora, no un ajuste de dieta. " +
  "Llama a emergencias (911 en México) o ve a un servicio de urgencias. " +
  "Aquí me detengo a propósito.";

const MENSAJE_CLINICO =
  "Esto ya es terreno clínico y no me toca: tu plan sale de reglas de " +
  "entrenamiento y alimentación, no de una consulta. Guárdalo como pregunta " +
  "para tu médico o para una nutrióloga con cédula, que pueden ver tu " +
  "historia completa. Lo que sí puedo hacer es dejarte el plan por escrito " +
  "para que se lo enseñes.";

const MENSAJE_TCA =
  "No voy a ayudarte con eso. Lo que describes es la clase de cosa que " +
  "empeora sola y con la que un profesional sí ayuda de verdad: busca a " +
  "alguien especializado en conducta alimentaria. Si estás en México, el " +
  "0800 de la Línea de la Vida (800 911 2000) atiende las 24 horas. " +
  "Tu plan aquí seguirá igual cuando quieras retomarlo.";

const MENSAJE_FUERA_DE_ALCANCE =
  "Eso no lo cubre esta app. No prescribo fármacos ni sustancias, ni siquiera " +
  "para decir 'con esto sí'. Si estás considerándolo, esa conversación va con " +
  "un médico que te conozca.";

/**
 * Clasifica una pregunta antes de contestarla.
 *
 * El orden importa: urgencia gana sobre todo lo demás, luego el trastorno de
 * conducta alimentaria (que es donde una respuesta técnica hace daño), luego
 * lo clínico y al final lo que no es de esta app.
 */
export function triageQuestion(question: string): TriageResult {
  const text = normalize(question);

  const urgencia = hits(text, URGENCIA);
  if (urgencia.length > 0) {
    return { category: "URGENCIA", blocked: true, message: MENSAJE_URGENCIA, matched: urgencia };
  }

  const tca = hits(text, TCA);
  if (tca.length > 0) {
    return { category: "TCA", blocked: true, message: MENSAJE_TCA, matched: tca };
  }

  const clinico = hits(text, CLINICO);
  if (clinico.length > 0) {
    return { category: "CLINICO", blocked: true, message: MENSAJE_CLINICO, matched: clinico };
  }

  const fuera = hits(text, FUERA_DE_ALCANCE);
  if (fuera.length > 0) {
    return {
      category: "FUERA_DE_ALCANCE",
      blocked: true,
      message: MENSAJE_FUERA_DE_ALCANCE,
      matched: fuera,
    };
  }

  return { category: "OK", blocked: false, message: "", matched: [] };
}

/** El aviso que acompaña a toda respuesta de nutrición, incluso las que pasan. */
export const NUTRITION_DISCLAIMER =
  "Esto explica tu plan; no es una consulta de nutrición ni sustituye a una.";
