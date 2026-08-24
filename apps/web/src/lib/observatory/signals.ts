/**
 * Escalamiento automático al admin (Fase 3).
 *
 * Con el autopiloto encendido el admin ya no aprueba: observa. Estas señales
 * son la excepción — **avisan, no bloquean**. La decisión del motor se publica
 * igual; lo único que pasa es que alguien se entera.
 *
 * Son cuatro, ni una más (visión v2 §F3):
 *   1. síntoma de seguridad dos semanas seguidas
 *   2. cumplimiento por debajo del 50 % dos semanas
 *   3. tres semanas sin check-in
 *   4. el motor propone salirse de la config
 *
 * Módulo puro y determinista: recibe la fecha de hoy, no la lee del reloj.
 */

export type EscalationSignalId =
  | "SINTOMA_SEGURIDAD_2_SEMANAS"
  | "CUMPLIMIENTO_BAJO_2_SEMANAS"
  | "SIN_CHECKIN_3_SEMANAS"
  | "MOTOR_FUERA_DE_CONFIG";

export interface EscalationSignal {
  id: EscalationSignalId;
  title: string;
  detail: string;
  severity: "alta" | "media";
  /** Fecha ISO que ancla la señal; también deduplica el aviso. */
  since: string | null;
}

/**
 * Síntomas que el motor trata como seguridad (reglas R2 y R3). Se listan aquí
 * explícitamente: un chip nuevo del check-in no debe empezar a escalar solo.
 */
export const SAFETY_SYMPTOMS = ["mareo", "calambres", "enfermedad", "dolor_cabeza"] as const;

export const LOW_COMPLIANCE_PCT = 50;
export const WEEKS_FOR_SYMPTOM_ESCALATION = 2;
export const WEEKS_FOR_COMPLIANCE_ESCALATION = 2;
export const DAYS_WITHOUT_CHECKIN = 21;

export interface EscalationWeek {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  symptoms: string[];
  dietCompliance: number;
  trainingCompliance: number;
}

/** Lo que el motor propuso y por qué eso queda fuera de la config vigente. */
export interface OutOfConfigFinding {
  /** ISO de la decisión. */
  date: string;
  reason: string;
}

export interface EscalationInput {
  /** Check-ins del más viejo al más nuevo. */
  weeks: EscalationWeek[];
  /** Hoy, ISO. */
  today: string;
  outOfConfig?: OutOfConfigFinding | null;
}

function hasSafetySymptom(week: EscalationWeek): boolean {
  return week.symptoms.some((symptom) =>
    (SAFETY_SYMPTOMS as readonly string[]).includes(symptom.trim().toLowerCase()),
  );
}

function lowCompliance(week: EscalationWeek): boolean {
  return Math.min(week.dietCompliance, week.trainingCompliance) < LOW_COMPLIANCE_PCT;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Las últimas `count` semanas, ya ordenadas. */
function lastWeeks(weeks: EscalationWeek[], count: number): EscalationWeek[] {
  return weeks
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-count);
}

export function detectEscalations(input: EscalationInput): EscalationSignal[] {
  const signals: EscalationSignal[] = [];
  const ordered = input.weeks.slice().sort((a, b) => a.date.localeCompare(b.date));

  const symptomWindow = lastWeeks(ordered, WEEKS_FOR_SYMPTOM_ESCALATION);
  if (
    symptomWindow.length === WEEKS_FOR_SYMPTOM_ESCALATION &&
    symptomWindow.every(hasSafetySymptom)
  ) {
    const listed = Array.from(
      new Set(symptomWindow.flatMap((week) => week.symptoms.map((s) => s.toLowerCase()))),
    ).filter((symptom) => (SAFETY_SYMPTOMS as readonly string[]).includes(symptom));

    signals.push({
      id: "SINTOMA_SEGURIDAD_2_SEMANAS",
      title: "Síntoma de seguridad dos semanas seguidas",
      detail: `Reportó ${listed.join(", ")} en las dos últimas semanas. El motor ya aplicó su protocolo; conviene que alguien lo mire.`,
      severity: "alta",
      since: symptomWindow[0]!.date,
    });
  }

  const complianceWindow = lastWeeks(ordered, WEEKS_FOR_COMPLIANCE_ESCALATION);
  if (
    complianceWindow.length === WEEKS_FOR_COMPLIANCE_ESCALATION &&
    complianceWindow.every(lowCompliance)
  ) {
    const worst = complianceWindow
      .map((week) => Math.min(week.dietCompliance, week.trainingCompliance))
      .join(" % y ");

    signals.push({
      id: "CUMPLIMIENTO_BAJO_2_SEMANAS",
      title: "Cumplimiento por debajo del 50 % dos semanas",
      detail: `Cumplimiento mínimo de ${worst} %. El plan no se está ejecutando: ajustar números no arregla eso.`,
      severity: "alta",
      since: complianceWindow[0]!.date,
    });
  }

  const last = ordered[ordered.length - 1] ?? null;
  const daysSince = last ? daysBetween(last.date, input.today) : null;
  if (daysSince !== null && daysSince >= DAYS_WITHOUT_CHECKIN) {
    signals.push({
      id: "SIN_CHECKIN_3_SEMANAS",
      title: "Tres semanas sin check-in",
      detail: `El último check-in fue hace ${daysSince} días. Sin datos, el motor no decide nada.`,
      severity: "alta",
      since: last!.date,
    });
  }

  if (input.outOfConfig) {
    signals.push({
      id: "MOTOR_FUERA_DE_CONFIG",
      title: "El motor propone salirse de la config",
      detail: input.outOfConfig.reason,
      severity: "media",
      since: input.outOfConfig.date,
    });
  }

  return signals;
}
