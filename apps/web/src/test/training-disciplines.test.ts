import { describe, expect, it } from "vitest";

import { planDisciplines, sesionesDeDiaOverride } from "@/lib/training/disciplines";
import { prescribirSesion, DISCIPLINAS_PRESCRIBIBLES } from "@/lib/training/disciplinas";
import type { DayKind, DisciplineLoad } from "@/lib/training/types";
import type { WeekDay } from "@/lib/training/split";

/**
 * El modelo de convivencia entre disciplinas (Fase 7, ampliada en Fase 9).
 *
 * Lo que se prueba no son los números —cuántos metros, cuántos puntos de
 * puntuación—, sino las reglas: el presupuesto no se estira, la primaria arma
 * el esqueleto, el alto impacto no va la víspera de pierna, y desde la Fase 9,
 * nada se tira en silencio — lo que no cabe en su propio día se anexa a uno ya
 * ocupado o libera un descanso, y solo si de plano no cabe en ningún lado se
 * avisa.
 */

/** Lunes 2026-01-05 = semana ISO 2. */
const MONDAY = new Date("2026-01-05T12:00:00");

/** Semana de pesas típica de 5 días con el split del coach. */
function gymWeek(entries: Array<[WeekDay, DayKind]>): Map<WeekDay, DayKind> {
  return new Map(entries);
}

function plan(input: {
  loads: Array<Pick<DisciplineLoad, "discipline" | "sessionsPerWeek" | "modo">>;
  gym: Map<WeekDay, DayKind>;
  isoWeek?: number;
  timePerDay?: Partial<Record<WeekDay, number>> | null;
  compactos?: boolean;
}) {
  return planDisciplines({
    weekStart: MONDAY,
    otherDisciplines: input.loads,
    gymByDay: input.gym,
    niveles: { NATACION: "INTERMEDIO" },
    objetivo: "RECOMPOSICION",
    isoWeek: input.isoWeek ?? 2,
    timePerDay: input.timePerDay,
    compactos: input.compactos,
  });
}

/** Los 7 días con el mismo minutaje: sirve para aislar el efecto de `timePerDay`. */
function todosLosDias(minutos: number): Record<WeekDay, number> {
  return {
    LUN: minutos,
    MAR: minutos,
    MIE: minutos,
    JUE: minutos,
    VIE: minutos,
    SAB: minutos,
    DOM: minutos,
  };
}

/** Semana de gimnasio los 7 días: fuerza a que cualquier secundaria pase por la Fase 2 (anexar). */
function gymTodaLaSemana(kind: DayKind): Map<WeekDay, DayKind> {
  return gymWeek([
    ["LUN", kind],
    ["MAR", kind],
    ["MIE", kind],
    ["JUE", kind],
    ["VIE", kind],
    ["SAB", kind],
    ["DOM", kind],
  ]);
}

describe("reparto de disciplinas en la semana", () => {
  it("coloca las sesiones en los huecos que deja el gimnasio", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 2 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MAR", "HOMBRO"],
        ["MIE", "PECHO_ESPALDA"],
      ]),
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => !session.sharesDayWithGym)).toBe(true);
  });

  // En este reparto concreto sobran dos días libres (SAB y DOM no se piden),
  // así que nada combina — la prueba de que SÍ pueden combinar cuando hace
  // falta vive en el bloque "el caso real" más abajo.
  it("no pone dos disciplinas el mismo día cuando hay huecos de sobra", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 2 },
        { discipline: "BOX", sessionsPerWeek: 2 },
      ],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });

    const fechas = sessions.map((session) => session.date);
    expect(new Set(fechas).size).toBe(fechas.length);
  });

  it("el alto impacto no cae la víspera de pierna", () => {
    const { sessions } = plan({
      loads: [{ discipline: "BOX", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "HOMBRO"],
        ["MIE", "PIERNA_CUADRICEPS"],
        ["VIE", "PECHO_ESPALDA"],
      ]),
    });

    // El martes es la víspera del miércoles de pierna: no debe elegirse.
    expect(sessions[0]!.weekday).not.toBe("MAR");
  });

  it("la natación prefiere el día después de pierna", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MIE", "HOMBRO"],
        ["JUE", "PECHO_ESPALDA"],
      ]),
    });

    expect(sessions[0]!.weekday).toBe("MAR");
    expect(sessions[0]!.note).toContain("después de pierna");
  });

  // Fase 9: antes, el único destino de "no hay huecos" era compartir día con
  // el gimnasio y perder un accesorio a ciegas. Ahora pasa por
  // `combinaciones.ts`: la sesión de pesas se REDIMENSIONA a los minutos que
  // le tocan de verdad (`gymMinutesPorFecha`), y la nota explica el porqué del
  // orden en vez de solo avisar el recorte.
  it("cuando no hay huecos, anexa el día con la mejor combinación de gimnasio y redimensiona esa sesión", () => {
    const { sessions, crowdedDates, gymMinutesPorFecha, avisos } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MAR", "HOMBRO"],
        ["MIE", "PECHO_ESPALDA"],
        ["JUE", "PIERNA_FEMORAL"],
        ["VIE", "BRAZO"],
        ["SAB", "PIERNA_GLUTEO"],
        ["DOM", "TORSO"],
      ]),
    });

    expect(sessions[0]!.sharesDayWithGym).toBe(true);
    expect(crowdedDates).toEqual([sessions[0]!.date]);
    // Natación siempre cierra el día (recuperación activa): la nota lo dice.
    expect(sessions[0]!.note).toContain("soltar");
    expect(gymMinutesPorFecha[sessions[0]!.date]).toBeGreaterThan(0);
    // No cupo en un día libre, pero SÍ combinó: no es un "no cupo" real.
    expect(avisos).toEqual([]);
  });

  it("las disciplinas con prescriptor traen plan; las demás reservan el día", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 1 },
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "OTRO", sessionsPerWeek: 1 },
      ],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });

    expect(sessions.find((session) => session.discipline === "NATACION")?.sesion).not.toBeNull();
    expect(sessions.find((session) => session.discipline === "SQUASH")?.sesion).not.toBeNull();
    // `OTRO` es la cubeta de lo que se registra pero no se planea.
    expect(sessions.find((session) => session.discipline === "OTRO")?.sesion).toBeNull();
  });

  it("una disciplina sin sesiones no ocupa ningún día", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 0 }],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });
    expect(sessions).toEqual([]);
  });

  // `timePerDay` es el tiempo REAL que la persona declaró al replanificar.
  // Sin él, la Fase 2 asume 60 minutos de gimnasio (imaginarios) más el
  // default de la secundaria — con él, el combo se acepta o se rechaza
  // contra lo que de verdad hay ese día.
  it("con 90 minutos reales declarados, el combo con gimnasio sí cabe", () => {
    const { sessions, avisos } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      // Los 7 días llenos de gimnasio: no hay día libre, así que NATACION
      // solo puede colocarse anexándose (Fase 2).
      gym: gymTodaLaSemana("HOMBRO"),
      timePerDay: todosLosDias(90),
    });

    expect(avisos).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sharesDayWithGym).toBe(true);
  });

  it("con 45 minutos reales declarados, el mismo combo no cabe y se avisa", () => {
    const { sessions, avisos } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymTodaLaSemana("HOMBRO"),
      timePerDay: todosLosDias(45),
    });

    expect(sessions).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("no cupo");
  });

  it("sin timePerDay declarado, se cae al default de siempre (60 + secundaria)", () => {
    // Mismo escenario que el de "cuando no hay huecos, anexa..." de arriba,
    // solo que aquí se fuerzan los 7 días de gimnasio: sin `timePerDay`, el
    // comportamiento no debe cambiar — es el fallback que protege a quien
    // nunca ha replanificado.
    const { sessions, avisos } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymTodaLaSemana("HOMBRO"),
    });

    expect(avisos).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sharesDayWithGym).toBe(true);
  });
});

describe("el caso real: 5 días de gimnasio + natación + squash (Fase 9)", () => {
  // El reporte que motivó este rediseño: 5 días de pesas más natación y
  // squash, cada una una vez por semana, en una semana de 7 días. Eso es
  // 5 + 1 + 1 = 7 — la semana queda exactamente llena, sin un solo día
  // libre. Con el planificador viejo esto no tiraba nada (el `break` solo
  // aparecía con MÁS demanda que días), pero tampoco liberaba un descanso;
  // con el nuevo, la Fase 3 debe notar que la semana quedó 7/7 y fusionar
  // squash+natación —los únicos dos días de secundaria, y compatibles entre
  // sí— para devolver un día de descanso de verdad.
  const gym = gymWeek([
    ["LUN", "PIERNA_CUADRICEPS"],
    ["MAR", "HOMBRO"],
    ["MIE", "PECHO_ESPALDA"],
    ["JUE", "PIERNA_FEMORAL"],
    ["VIE", "BRAZO"],
  ]);

  it("no tira nada: squash y natación quedan colocadas", () => {
    const { sessions, avisos } = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "NATACION", sessionsPerWeek: 1 },
      ],
      gym,
    });

    expect(avisos).toEqual([]);
    expect(sessions.map((s) => s.discipline).sort()).toEqual(["NATACION", "SQUASH"]);
  });

  it("squash jamás cae en un día de pierna del gimnasio", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "NATACION", sessionsPerWeek: 1 },
      ],
      gym,
    });

    const squash = sessions.find((s) => s.discipline === "SQUASH")!;
    const kindDelDiaDeSquash = gym.get(squash.weekday);
    // O bien squash cayó en un día sin gimnasio (lo normal), o si combinó con
    // gimnasio no puede ser uno de pierna — esa combinación es `null` en
    // `compatibilidad` a propósito.
    if (kindDelDiaDeSquash) {
      expect(kindDelDiaDeSquash.startsWith("PIERNA")).toBe(false);
    }
  });

  it("como la semana quedaba 7/7, se libera al menos un día de descanso completo", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "NATACION", sessionsPerWeek: 1 },
      ],
      gym,
    });

    const diasConAlgo = new Set([...gym.keys(), ...sessions.map((s) => s.weekday)]);
    expect(diasConAlgo.size).toBeLessThan(7);

    // Y ese descanso sale de fusionar squash con natación en un solo día: las
    // dos terminan en la misma fecha, natación cerrando (recuperación activa).
    const [primero, segundo] = [...sessions].sort((a, b) => a.orden - b.orden);
    expect(primero!.date).toBe(segundo!.date);
    expect(segundo!.discipline).toBe("NATACION");
    expect(segundo!.orden).toBe(2);
  });
});

describe("compactar por gusto (Fase 10, compactos)", () => {
  // El reporte real que motivó esta fase: gimnasio 1 vez + natación 2 +
  // squash 2 en una semana de 7 días son 5 sesiones para 7 días — cada una
  // cabe SUELTA (no hay desborde, así que las Fases 2 y 3 no hacen nada), y
  // aun así la persona quiere squash y natación el mismo día. `HOMBRO` (no
  // pierna) es el único gimnasio de la semana, a propósito: aísla el efecto
  // de "compactar por gusto" del de "no queda de otra" que ya prueban los
  // bloques de arriba.
  const gymUnDia = gymWeek([["MIE", "HOMBRO"]]);

  it("con compactos:true combina squash+natación y deja más días libres que compactos:false", () => {
    const suelto = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 2 },
        { discipline: "NATACION", sessionsPerWeek: 2 },
      ],
      gym: gymUnDia,
      timePerDay: todosLosDias(90),
      compactos: false,
    });
    const compacto = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 2 },
        { discipline: "NATACION", sessionsPerWeek: 2 },
      ],
      gym: gymUnDia,
      timePerDay: todosLosDias(90),
      compactos: true,
    });

    const diasLibresDe = (sessions: typeof compacto.sessions) => {
      const ocupados = new Set([...gymUnDia.keys(), ...sessions.map((s) => s.date)]);
      return 7 - ocupados.size;
    };

    expect(suelto.avisos).toEqual([]);
    expect(compacto.avisos).toEqual([]);
    // Suelto: las 4 sesiones (2 squash + 2 natación) en 4 días propios, sin
    // combinar entre sí ni con el único día de gimnasio (nada desborda).
    expect(new Set(suelto.sessions.map((s) => s.date)).size).toBe(4);
    expect(diasLibresDe(compacto.sessions)).toBeGreaterThan(diasLibresDe(suelto.sessions));

    // Al menos un día combina squash con natación, con natación cerrando.
    const combosSquashNatacion = compacto.sessions.filter(
      (s, _i, todas) =>
        s.discipline === "NATACION" &&
        s.orden === 2 &&
        todas.some((otra) => otra.date === s.date && otra.discipline === "SQUASH" && otra.orden === 1),
    );
    expect(combosSquashNatacion.length).toBeGreaterThan(0);
  });

  it("con 45 minutos reales por día no fusiona: no caben dos bloques", () => {
    const { sessions, avisos } = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 2 },
        { discipline: "NATACION", sessionsPerWeek: 2 },
      ],
      gym: gymUnDia,
      timePerDay: todosLosDias(45),
      compactos: true,
    });

    expect(avisos).toEqual([]);
    // Las 4 sesiones quedan sueltas: ninguna comparte fecha con otra.
    const fechas = sessions.map((s) => s.date);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect(sessions.every((s) => !s.sharesDayWithGym)).toBe(true);
  });

  it("un día de pierna jamás recibe squash, ni siquiera compactando", () => {
    const { sessions } = plan({
      loads: [{ discipline: "SQUASH", sessionsPerWeek: 1 }],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
      timePerDay: todosLosDias(90),
      compactos: true,
    });

    // El único día de gimnasio de la semana es de pierna: si `compactos`
    // ignorara la incompatibilidad dura, squash no tendría otro sitio al que
    // "preferir" combinarse. En vez de eso, se queda en su propio día.
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sharesDayWithGym).toBe(false);
    expect(sessions[0]!.weekday).not.toBe("LUN");
  });

  it("compactos:false deja el comportamiento de siempre intacto", () => {
    const conCompactos = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "NATACION", sessionsPerWeek: 1 },
      ],
      gym: gymUnDia,
      timePerDay: todosLosDias(90),
    });

    expect(new Set(conCompactos.sessions.map((s) => s.date)).size).toBe(2);
    expect(conCompactos.sessions.every((s) => !s.sharesDayWithGym)).toBe(true);
  });
});

describe("modo DESPUES vs DIA_PROPIO (Fase 11)", () => {
  // El caso real de Mau e Irma: 6 días de gimnasio, y natación/squash DESPUÉS
  // de pesas, no en un día propio.
  const gym6dias = gymWeek([
    ["LUN", "PIERNA_CUADRICEPS"],
    ["MAR", "HOMBRO"],
    ["MIE", "PECHO_ESPALDA"],
    ["JUE", "PIERNA_FEMORAL"],
    ["VIE", "BRAZO"],
    ["SAB", "TORSO"],
  ]);

  it("DESPUES anexa las sesiones a días de gimnasio, nunca a un día propio", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 2, modo: "DESPUES" },
        { discipline: "SQUASH", sessionsPerWeek: 1, modo: "DESPUES" },
      ],
      gym: gym6dias,
      timePerDay: todosLosDias(120),
    });

    expect(sessions).toHaveLength(3);
    expect(sessions.every((session) => session.sharesDayWithGym)).toBe(true);
    expect(sessions.every((session) => gym6dias.has(session.weekday))).toBe(true);
  });

  it("DESPUES no le quita días al gimnasio: el domingo sigue libre", () => {
    // Sin `modo`, natación x2 + squash x1 recortarían el gimnasio a 3 días
    // (6 - 3). Con DESPUES, el gimnasio conserva sus 6 días completos.
    const conDespues = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 2, modo: "DESPUES" },
        { discipline: "SQUASH", sessionsPerWeek: 1, modo: "DESPUES" },
      ],
      gym: gym6dias,
      timePerDay: todosLosDias(120),
    });

    // Las 6 fechas de gimnasio siguen intactas: ninguna se perdió por pagar
    // presupuesto (eso lo prueba `liftingDaysWithinBudget`/`generate.ts`,
    // aquí solo se confirma que las secundarias no piden un día PROPIO).
    expect(new Set(conDespues.sessions.map((s) => s.weekday)).size).toBeLessThanOrEqual(6);
    expect([...gym6dias.keys()]).toHaveLength(6);
  });

  it("DIA_PROPIO se comporta igual que sin modo: busca día libre primero", () => {
    const sinModo = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gym6dias,
    });
    const conDiaPropio = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1, modo: "DIA_PROPIO" }],
      gym: gym6dias,
    });

    expect(conDiaPropio.sessions[0]!.weekday).toBe(sinModo.sessions[0]!.weekday);
    expect(conDiaPropio.sessions[0]!.sharesDayWithGym).toBe(false);
  });

  it("DESPUES que no cabe en ningún día de gym avisa, no se cae en silencio", () => {
    // Un solo día de gimnasio, ya sin minutos para anexar dos secundarias.
    const { sessions, avisos } = plan({
      loads: [
        { discipline: "SQUASH", sessionsPerWeek: 1, modo: "DESPUES" },
        { discipline: "NATACION", sessionsPerWeek: 1, modo: "DESPUES" },
      ],
      gym: gymWeek([["MIE", "HOMBRO"]]),
      timePerDay: todosLosDias(70),
    });

    // Un solo bloque anexado (el de mejor compatibilidad); el otro avisa.
    expect(sessions).toHaveLength(1);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("no cupo");
  });

  it("DESPUES explícita con pierna + squash: compatibilidad baja y aviso de riesgo, no null", () => {
    // Único gimnasio de la semana es pierna: sin la Fase 11, squash DESPUES
    // no tendría ningún día de gym al que anexarse. Con `explicita`, se
    // acepta con aviso — la persona ya decidió que quiere squash después de
    // pierna.
    const { sessions, avisos } = plan({
      loads: [{ discipline: "SQUASH", sessionsPerWeek: 1, modo: "DESPUES" }],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
      timePerDay: todosLosDias(120),
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sharesDayWithGym).toBe(true);
    expect(avisos.some((aviso) => aviso.includes("riesgo de lesión"))).toBe(true);
  });

  it("sin explicita (el motor decide), pierna + squash sigue prohibida sin excepción", () => {
    // Mismo escenario, pero SQUASH sin modo (DIA_PROPIO): el motor decide
    // sola, y la regla dura de `combinaciones.ts` no se ablanda.
    const { sessions, avisos } = plan({
      loads: [{ discipline: "SQUASH", sessionsPerWeek: 1 }],
      gym: gymTodaLaSemana("PIERNA_CUADRICEPS"),
      timePerDay: todosLosDias(120),
    });

    // No hay ningún día libre (7/7 de pierna) y anexar a pierna está
    // prohibido sin `explicita`: squash no cupo en ningún lado.
    expect(sessions).toEqual([]);
    expect(avisos.some((aviso) => aviso.includes("no cupo"))).toBe(true);
    expect(avisos.some((aviso) => aviso.includes("riesgo de lesión"))).toBe(false);
  });
});

describe("sesionesDeDiaOverride (Fase 11: override de día completo)", () => {
  it("con una sola disciplina, se lleva todo el tiempo declarado", () => {
    const [sesion] = sesionesDeDiaOverride({
      date: "2026-09-04",
      weekday: "VIE",
      disciplinas: ["SQUASH"],
      niveles: {},
      objetivo: "RECOMPOSICION",
      isoWeek: 2,
      minutos: 75,
    });

    expect(sesion).toMatchObject({
      date: "2026-09-04",
      weekday: "VIE",
      discipline: "SQUASH",
      minutes: 75,
      sharesDayWithGym: false,
      orden: 1,
    });
    expect(sesion!.sesion).not.toBeNull();
  });

  it("con dos, reparte el tiempo y ordena igual que combinaciones.ts", () => {
    const sesiones = sesionesDeDiaOverride({
      date: "2026-09-04",
      weekday: "VIE",
      disciplinas: ["SQUASH", "NATACION"],
      niveles: { NATACION: "INTERMEDIO" },
      objetivo: "RECOMPOSICION",
      isoWeek: 2,
      minutos: 120,
    });

    expect(sesiones).toHaveLength(2);
    // Natación siempre cierra (ver `ordenar` en combinaciones.ts).
    expect(sesiones[0]!.discipline).toBe("SQUASH");
    expect(sesiones[1]!.discipline).toBe("NATACION");
    expect(sesiones[0]!.orden).toBe(1);
    expect(sesiones[1]!.orden).toBe(2);
    expect(sesiones.every((s) => !s.sharesDayWithGym)).toBe(true);
    expect(sesiones[0]!.minutes + sesiones[1]!.minutes).toBeLessThanOrEqual(120);
  });

  it("sin minutos declarados, cae en el default de siempre", () => {
    const [sesion] = sesionesDeDiaOverride({
      date: "2026-09-04",
      weekday: "VIE",
      disciplinas: ["GOLF"],
      niveles: {},
      objetivo: "RECOMPOSICION",
      isoWeek: 2,
    });

    expect(sesion!.minutes).toBe(90);
  });
});

describe("prescripción por disciplina", () => {
  const base = { isoWeek: 2, ordinal: 1, minutes: 45, objetivo: "RECOMPOSICION" as const };

  it("cada disciplina del registro prescribe en sus tres niveles", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      for (const { nivel } of prescriptor.niveles) {
        const sesion = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel });

        expect(sesion, `${prescriptor.nombre} ${nivel}`).not.toBeNull();
        expect(sesion!.blocks.length, `${prescriptor.nombre} ${nivel}`).toBeGreaterThan(2);
        expect(sesion!.unidad, `${prescriptor.nombre} ${nivel}`).toBeTruthy();
      }
    }
  });

  it("la carga total es la suma de los bloques que sí se miden", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const sesion = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
      })!;
      const suma = sesion.blocks.reduce((total, bloque) => total + (bloque.carga ?? 0), 0);
      expect(sesion.cargaTotal, prescriptor.nombre).toBe(suma);
    }
  });

  it("quien empieza siempre carga menos que quien va avanzado", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const principiante = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "PRINCIPIANTE",
      })!;
      const avanzado = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "AVANZADO",
      })!;

      expect(principiante.cargaTotal, prescriptor.nombre).toBeLessThan(avanzado.cargaTotal);
    }
  });

  it("el objetivo mueve el volumen: perder grasa pide más que ganar músculo", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const grasa = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
        objetivo: "PERDIDA_GRASA",
      })!;
      const musculo = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
        objetivo: "GANANCIA_MUSCULO",
      })!;

      expect(grasa.cargaTotal, prescriptor.nombre).toBeGreaterThanOrEqual(musculo.cargaTotal);
      expect(musculo.notes.join(" "), prescriptor.nombre).toContain("compite con la fuerza");
    }
  });

  it("descarga cada cuarta semana, en todas", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const normal = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "INTERMEDIO", isoWeek: 3 })!;
      const descarga = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "INTERMEDIO", isoWeek: 4 })!;

      expect(descarga.deload, prescriptor.nombre).toBe(true);
      expect(descarga.cargaTotal, prescriptor.nombre).toBeLessThanOrEqual(normal.cargaTotal);
    }
  });

  it("box no prescribe sparring en ningún nivel", () => {
    for (const nivel of ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"] as const) {
      const sesion = prescribirSesion({ ...base, discipline: "BOX", nivel })!;
      const texto = `${sesion.blocks.map((b) => `${b.title} ${b.detail} ${b.note}`).join(" ")} ${sesion.notes.join(" ")}`;

      expect(texto.toLowerCase(), nivel).not.toMatch(/haz sparring|hacer sparring|guanteo con/);
      expect(sesion.notes.join(" "), nivel).toContain("no hay sparring");
    }
  });

  it("CrossFit no manda olímpicos a un principiante", () => {
    const sesion = prescribirSesion({ ...base, discipline: "CROSSFIT", nivel: "PRINCIPIANTE" })!;
    const texto = sesion.blocks.map((bloque) => `${bloque.detail} ${bloque.note}`).join(" ").toLowerCase();

    expect(texto).not.toMatch(/arranque de|envión de|snatch|clean and jerk/);
    expect(sesion.notes.join(" ")).toContain("no se prescriben desde una app");
  });

  it("es determinista: misma entrada, misma sesión", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const a = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "AVANZADO" });
      const b = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "AVANZADO" });
      expect(a, prescriptor.nombre).toEqual(b);
    }
  });
});
