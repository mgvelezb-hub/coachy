import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { NumberStepper } from "@/components/NumberStepper";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getTrainingWeek,
  patchEntrenamiento,
  type Discipline,
  type DisciplineLoad,
  type MeResponse,
  type MuscleGroup,
  type SchemePreference,
  type SessionView,
  type SwimLevel,
  type WeekView,
} from "@/lib/api";
import {
  DISCIPLINAS,
  GRUPOS,
  NIVELES_POR_DISCIPLINA,
  type BloqueDelDia,
  diasDeGimnasio,
  etiquetaDelDia,
  ordenarBloquesDelDia,
} from "@/lib/entrenamiento";
import { DIAS_SEMANA, PROPOSITOS, TIEMPOS_DIA, type Proposito, type WeekDay } from "@/lib/replantear";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * Los editores de "Tu entrenamiento", cada uno en su propia hoja de zoom.
 *
 * Vivían apilados en `SeccionEntrenamiento` — catálogos con descripciones,
 * la rejilla de tiempo por día, el Collapsible de grupos— y la sección era
 * puro scroll. La sección ahora es una lista de renglones con el estado
 * actual y cada renglón abre su hoja. La lógica y las llamadas son las
 * mismas que tenían allá; el refresco de "Tu semana" ya no se dispara desde
 * aquí porque la sección lo recarga sola al recuperar el foco.
 */

/**
 * Las cuatro opciones de "Cómo te gusta entrenar".
 *
 * "Que la app decida" va PRIMERO: es el default y la recomendación real —
 * variar el estímulo semana a semana (periodización ondulante) es igual o
 * mejor que un esquema fijo para ganar fuerza (Rhea et al. 2002). Las otras
 * tres describen el esquema en el vocabulario de la atleta (peso/reps), no
 * en el del catálogo (`FUERZA`/`HIPERTROFIA`/`METABOLICO` son las llaves que
 * entiende el servidor; ver `SCHEME_PREFERENCES` en `schemes.ts` del motor
 * para el sustento y el mapeo exacto — p. ej. `HIPERTROFIA` fija el esquema
 * `RANGO_MEDIO` del catálogo, que no tiene uno propio).
 *
 * `corto` es lo que cabe en el renglón-resumen de la sección.
 */
export const OPCIONES_ESQUEMA: Array<{
  valor: SchemePreference;
  nombre: string;
  corto: string;
  detalle: string;
}> = [
  {
    valor: "RECOMENDADO",
    nombre: "Que la app decida (recomendado)",
    corto: "Que la app decida",
    detalle: "Rota el estímulo cada semana, que es lo que la evidencia respalda.",
  },
  {
    valor: "FUERZA",
    nombre: "Mucho peso, pocas reps",
    corto: "Mucho peso, pocas reps",
    detalle: "Series de 3–6, descansos largos.",
  },
  {
    valor: "HIPERTROFIA",
    nombre: "Peso medio, reps medias",
    corto: "Peso medio, reps medias",
    detalle: "Series de 8–12, el rango clásico de músculo.",
  },
  {
    valor: "METABOLICO",
    nombre: "Poco peso, muchas reps",
    corto: "Poco peso, muchas reps",
    detalle: "Series de 25–30, quema y resistencia.",
  },
];

export function disciplinaNombre(discipline: Discipline): string {
  return DISCIPLINAS.find((entrada) => entrada.valor === discipline)?.nombre ?? discipline;
}

/** Suma días a una fecha ISO. Misma cuenta que en `(tabs)/rutinas.tsx`. */
function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

const WEEKDAY_ABBR_BY_DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

/** "SÁB" a partir de una fecha ISO. */
function weekdayAbbrOf(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  return WEEKDAY_ABBR_BY_DOW[new Date(year!, month! - 1, day!).getDay()]!;
}

/** Un día de "Tu semana", ya resuelto a su etiqueta ("Squash → Natación"). */
export type DiaResumen = { date: string; abrev: string; etiqueta: string };

export function diasResumenDe(semana: WeekView | null): DiaResumen[] {
  if (!semana) return [];
  const dias: DiaResumen[] = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDaysISO(semana.weekStart, index);
    const gym = semana.sessions.find((sesion) => sesion.date === date) ?? null;
    const otrasDia = semana.otherSessions?.filter((otra) => otra.date === date) ?? [];
    const bloques: Array<BloqueDelDia<SessionView>> = ordenarBloquesDelDia(gym, otrasDia);
    if (bloques.length === 0) continue;
    dias.push({ date, abrev: weekdayAbbrOf(date), etiqueta: etiquetaDelDia(bloques) });
  }
  return dias;
}

/**
 * Los avisos del planificador para "Tu semana": el porqué de un día
 * combinado (la `note` que ya escribió el servidor) y las semanas de
 * descarga. No se inventa copy nuevo — se sube lo que el servidor ya declaró.
 */
export function avisosDeLaSemana(semana: WeekView | null): string[] {
  if (!semana) return [];
  const otras = semana.otherSessions ?? [];
  const avisos = new Set<string>();

  for (const otra of otras) {
    const comparteConGym = semana.sessions.some((sesion) => sesion.date === otra.date);
    const comparteConOtra = otras.some((entrada) => entrada !== otra && entrada.date === otra.date);
    if ((comparteConGym || comparteConOtra) && otra.note) avisos.add(otra.note);
    if (otra.sesion?.deload) avisos.add(`Semana de descarga en ${otra.discipline.toLowerCase()}.`);
  }

  return Array.from(avisos);
}

/**
 * "Tu semana" a detalle: los siete días con su etiqueta y los avisos del
 * planificador. Es lectura pura — el renglón de la sección ya dice cuántos
 * días hay; esta hoja enseña cuáles y por qué se combinaron.
 */
export function DetalleSemana() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [semana, setSemana] = useState<WeekView | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargarSemana = useCallback(async () => {
    try {
      setSemana(await getTrainingWeek());
    } catch {
      // Sin semana no hay detalle que mostrar; el vacío de abajo lo dice.
    } finally {
      setCargado(true);
    }
  }, []);
  useEffect(() => {
    void cargarSemana();
  }, [cargarSemana]);

  const dias = useMemo(() => diasResumenDe(semana), [semana]);
  const avisos = useMemo(() => avisosDeLaSemana(semana), [semana]);

  return (
    <Card>
      <SectionLabel>Tu semana</SectionLabel>

      {cargado && dias.length === 0 ? (
        <Text style={styles.vacio}>Todavía no hay semana armada.</Text>
      ) : (
        <View style={styles.semanaLista}>
          {dias.map((dia) => (
            <View key={dia.date} style={styles.semanaFila}>
              <Text style={styles.semanaDia}>{dia.abrev}</Text>
              <Text style={styles.semanaEtiqueta}>{dia.etiqueta}</Text>
            </View>
          ))}
        </View>
      )}

      {avisos.map((aviso) => (
        <Text key={aviso} style={styles.aviso}>
          {aviso}
        </Text>
      ))}
    </Card>
  );
}

/** "Cómo se arma tu semana" (Fase 10): días compactos o repartidos. */
export function EditorArmadoSemana({ me }: { me: MeResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // `true` por default: coincide con `Profile.compactDays` en el servidor
  // mientras la respuesta de `/me` no llega.
  const [compactDays, setCompactDays] = useState(true);
  const [compactoMsg, setCompactoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setCompactDays(me.profile.compactDays ?? true);
  }, [me]);

  /**
   * El orden DENTRO de un día combinado nunca se pregunta —eso lo decide la
   * app (la alberca al final, el impacto primero)—; esto solo decide SI se
   * combinan disciplinas compatibles el mismo día.
   */
  async function guardarCompactDays(valor: boolean) {
    const anterior = compactDays;
    setCompactDays(valor);
    setCompactoMsg(null);
    try {
      await patchEntrenamiento({ compactDays: valor });
      setCompactoMsg(
        valor
          ? "Guardado. Desde tu siguiente semana, lo que combine bien cae el mismo día."
          : "Guardado. Desde tu siguiente semana, cada disciplina vuelve a tener su propio día.",
      );
    } catch (error) {
      setCompactDays(anterior);
      setCompactoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu preferencia");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>Cómo se arma tu semana</SectionLabel>
        <InfoTip titulo="Qué decide esto">
          <TextoInfo>
            El orden dentro de un día combinado no se pregunta: la app siempre cierra con la
            alberca (recuperación activa) y abre con el impacto —squash, box— cuando las piernas
            todavía están frescas. Esto solo decide si combina disciplinas compatibles el mismo
            día, o si le da a cada una su propio día.
          </TextoInfo>
        </InfoTip>
      </View>

      <View style={styles.lista}>
        <Pressable
          onPress={() => guardarCompactDays(true)}
          style={[styles.fila, compactDays && styles.filaOn]}
        >
          <Text style={[styles.filaNombre, compactDays && styles.filaNombreOn]}>
            Días compactos
          </Text>
          <Text style={styles.filaDetalle}>
            Combina disciplinas compatibles el mismo día y te deja más días de descanso
            completo.
          </Text>
        </Pressable>
        <Pressable
          onPress={() => guardarCompactDays(false)}
          style={[styles.fila, !compactDays && styles.filaOn]}
        >
          <Text style={[styles.filaNombre, !compactDays && styles.filaNombreOn]}>
            Días repartidos
          </Text>
          <Text style={styles.filaDetalle}>Una disciplina por día, sesiones más frescas.</Text>
        </Pressable>
      </View>

      {compactoMsg && <Text style={styles.msg}>{compactoMsg}</Text>}
    </Card>
  );
}

/** "Cómo te gusta entrenar": esquema fijo, o que la app siga rotando. */
export function EditorEsquema({ me }: { me: MeResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // "RECOMENDADO" por default: coincide con el default de
  // `Profile.schemePreference` en el servidor mientras `/me` no llega.
  const [schemePreference, setSchemePreference] = useState<SchemePreference>("RECOMENDADO");
  const [schemeMsg, setSchemeMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setSchemePreference(me.profile.schemePreference ?? "RECOMENDADO");
  }, [me]);

  /**
   * La rotación (periodización ondulante) sigue siendo LA recomendación —
   * por eso "Que la app decida" va primero y marcada por default. Elegir un
   * esquema fijo no rompe nada: los días de rehabilitación (lesión activa)
   * nunca se mueven de su esquema, sin importar lo que se elija aquí.
   */
  async function guardarSchemePreference(valor: SchemePreference) {
    const anterior = schemePreference;
    setSchemePreference(valor);
    setSchemeMsg(null);
    try {
      await patchEntrenamiento({ schemePreference: valor });
      setSchemeMsg("Guardado. Aplica desde la próxima semana que se arme.");
    } catch (error) {
      setSchemePreference(anterior);
      setSchemeMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu preferencia");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>Cómo te gusta entrenar</SectionLabel>
        <InfoTip titulo="Qué decide esto">
          <TextoInfo>
            La rutina siempre viene con un esquema de series y reps. Por default la app lo rota
            cada semana —fuerza, metabólico, rango medio— porque variar el estímulo da mejores
            resultados que quedarse fijo. Si prefieres no variar, elige un estilo aquí y ese
            esquema se queda fijo todas las semanas.
          </TextoInfo>
          <TextoInfo>Aplica desde la próxima semana que se arme.</TextoInfo>
        </InfoTip>
      </View>

      <View style={styles.lista}>
        {OPCIONES_ESQUEMA.map((opcion) => {
          const activo = schemePreference === opcion.valor;
          return (
            <Pressable
              key={opcion.valor}
              onPress={() => guardarSchemePreference(opcion.valor)}
              style={[styles.fila, activo && styles.filaOn]}
            >
              <Text style={[styles.filaNombre, activo && styles.filaNombreOn]}>
                {opcion.nombre}
              </Text>
              <Text style={styles.filaDetalle}>{opcion.detalle}</Text>
            </Pressable>
          );
        })}
      </View>

      {schemeMsg && <Text style={styles.msg}>{schemeMsg}</Text>}
    </Card>
  );
}

/**
 * Tiempo por día (Fase 7): lo que hace honesto el reparto de un día
 * combinado. Hasta la Fase 7 esto solo se declaraba rehaciendo el flujo
 * completo de "Empezar de cero"; aquí se ajusta un día a la vez.
 */
export function EditorTiempoPorDia({ me }: { me: MeResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tiempoPorDia, setTiempoPorDia] = useState<Record<WeekDay, number>>(() =>
    Object.fromEntries(DIAS_SEMANA.map((dia) => [dia.valor, 0])) as Record<WeekDay, number>,
  );
  const [tiempoMsg, setTiempoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    // Se prellena solo con lo declarado: los días ausentes se quedan en 0
    // ("ese día no"), que es un valor honesto y no un supuesto.
    const declarado = me.profile.timePerDay;
    if (declarado) {
      setTiempoPorDia(
        Object.fromEntries(
          DIAS_SEMANA.map((dia) => [dia.valor, declarado[dia.valor] ?? 0]),
        ) as Record<WeekDay, number>,
      );
    }
  }, [me]);

  async function guardarTiempoDia(dia: WeekDay, minutos: number) {
    const anterior = tiempoPorDia;
    const siguiente = { ...tiempoPorDia, [dia]: minutos };
    setTiempoPorDia(siguiente);
    setTiempoMsg(null);
    try {
      await patchEntrenamiento({ timePerDay: siguiente });
      setTiempoMsg("Guardado. Entra en tu siguiente semana.");
    } catch (error) {
      setTiempoPorDia(anterior);
      setTiempoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu tiempo");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>Tiempo por día</SectionLabel>
        <InfoTip titulo="Para qué sirve esto">
          <TextoInfo>
            Un día con dos disciplinas —gym y alberca, squash y funcional— solo reparte bien el
            tiempo si sabe cuánto hay de verdad ese día. Hasta ahora esto solo se declaraba
            rehaciendo el flujo completo de "Empezar de cero"; aquí se ajusta un día a la vez.
          </TextoInfo>
        </InfoTip>
      </View>

      {DIAS_SEMANA.map((dia) => (
        <View key={dia.valor} style={styles.diaFila}>
          <Text style={styles.diaNombre}>{dia.nombre}</Text>
          <View style={styles.diaOpciones}>
            {TIEMPOS_DIA.map((opcion) => {
              const activo = (tiempoPorDia[dia.valor] ?? 0) === opcion.minutos;
              return (
                <Pressable
                  key={opcion.nombre}
                  onPress={() => guardarTiempoDia(dia.valor, opcion.minutos)}
                  style={[styles.diaChip, activo && styles.diaChipOn]}
                >
                  <Text style={[styles.diaChipTexto, activo && styles.diaChipTextoOn]}>
                    {opcion.corto}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {tiempoMsg && <Text style={styles.msg}>{tiempoMsg}</Text>}
    </Card>
  );
}

/** Grupos que no quieres repetir en la semana. */
export function EditorGrupos({ me }: { me: MeResponse | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sinRepetir, setSinRepetir] = useState<MuscleGroup[]>([]);
  const [entrenoMsg, setEntrenoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setSinRepetir(me.profile.avoidRepeatGroups ?? []);
  }, [me]);

  async function guardarSinRepetir(grupo: MuscleGroup) {
    const siguiente = sinRepetir.includes(grupo)
      ? sinRepetir.filter((valor) => valor !== grupo)
      : [...sinRepetir, grupo];

    setSinRepetir(siguiente);
    setEntrenoMsg(null);
    try {
      await patchEntrenamiento({ avoidRepeatGroups: siguiente });
      setEntrenoMsg(
        siguiente.length === 0
          ? "Sin restricciones: la semana vuelve al split completo."
          : "Guardado. Esos grupos se entrenan una vez y los días que los repetían pasan a otra cosa.",
      );
    } catch (error) {
      setSinRepetir(sinRepetir);
      setEntrenoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu preferencia");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>Grupos que no quieres repetir</SectionLabel>
        <InfoTip titulo="Cómo funciona">
          <TextoInfo>
            El grupo que marques se entrena una vez a la semana. Los días que lo repetían no
            desaparecen: pasan a trabajar otra cosa, así que sigues entrenando los mismos días.
          </TextoInfo>
        </InfoTip>
      </View>

      <View style={styles.chipsRow}>
        {GRUPOS.map((grupo) => {
          const activo = sinRepetir.includes(grupo.valor);
          return (
            <Pressable
              key={grupo.valor}
              onPress={() => guardarSinRepetir(grupo.valor)}
              style={[styles.chip, activo && styles.chipOn]}
            >
              <Text style={[styles.chipText, activo && styles.chipTextOn]}>
                {grupo.nombre}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {entrenoMsg && <Text style={styles.msg}>{entrenoMsg}</Text>}
    </Card>
  );
}

/**
 * UNA disciplina a detalle: sesiones, propósito y nivel juntos, que es como
 * se razona sobre ella. La primaria solo edita nivel — sus días salen del
 * presupuesto semanal menos lo que se llevan las demás.
 */
export function EditorDisciplina({
  me,
  discipline,
}: {
  me: MeResponse | null;
  discipline: Discipline;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [primaria, setPrimaria] = useState<Discipline>("PESAS");
  const [otras, setOtras] = useState<DisciplineLoad[]>([]);
  const [niveles, setNiveles] = useState<Partial<Record<Discipline, SwimLevel>>>({});
  const [entrenoMsg, setEntrenoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setPrimaria(me.profile.primaryDiscipline ?? "PESAS");
    setOtras(me.profile.otherDisciplines ?? []);
    setNiveles({
      NATACION: me.profile.swimLevel ?? "PRINCIPIANTE",
      ...(me.profile.disciplineLevels ?? {}),
    });
  }, [me]);

  const presupuestoSemanal = me?.profile?.trainingDaysPerWeek ?? 0;
  const esPrimaria = discipline === primaria;
  const carga = otras.find((entrada) => entrada.discipline === discipline);
  const nivel = niveles[discipline] ?? "PRINCIPIANTE";
  const opciones = NIVELES_POR_DISCIPLINA[discipline] ?? [];
  const diasGym = diasDeGimnasio(presupuestoSemanal, otras, primaria);

  /**
   * Guarda sesiones o propósito de esta disciplina. Se manda el entry
   * COMPLETO dentro de `otherDisciplines`: mandar solo el campo que cambió
   * perdería los otros en el camino.
   */
  async function actualizarCarga(
    cambios: Partial<Pick<DisciplineLoad, "sessionsPerWeek" | "proposito" | "importancia">>,
  ) {
    const actual = otras.find((entrada) => entrada.discipline === discipline);
    const entry: DisciplineLoad = {
      discipline,
      sessionsPerWeek: Math.max(
        0,
        Math.min(7, cambios.sessionsPerWeek ?? actual?.sessionsPerWeek ?? 0),
      ),
      proposito: cambios.proposito ?? actual?.proposito ?? "COMPLEMENTO",
      importancia: cambios.importancia ?? actual?.importancia ?? 2,
    };
    const siguiente =
      entry.sessionsPerWeek > 0
        ? [...otras.filter((entrada) => entrada.discipline !== discipline), entry]
        : otras.filter((entrada) => entrada.discipline !== discipline);

    setOtras(siguiente);
    setEntrenoMsg(null);
    try {
      await patchEntrenamiento({ otherDisciplines: siguiente });
      const restantes = diasDeGimnasio(presupuestoSemanal, siguiente, primaria);
      setEntrenoMsg(
        entry.sessionsPerWeek === 0
          ? `Quitada. Te quedan ${restantes} ${restantes === 1 ? "día" : "días"} de gimnasio a la semana.`
          : `Guardado: te quedan ${restantes} ${restantes === 1 ? "día" : "días"} de gimnasio a la semana.`,
      );
    } catch (error) {
      setOtras(otras);
      setEntrenoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu disciplina");
    }
  }

  async function guardarNivel(valor: SwimLevel) {
    const anterior = niveles;
    const siguiente = { ...niveles, [discipline]: valor };
    setNiveles(siguiente);
    setEntrenoMsg(null);
    try {
      // Natación además mantiene `swimLevel`, que existía antes de que el
      // nivel fuera por disciplina y sigue siendo su respaldo.
      await patchEntrenamiento({
        disciplineLevels: siguiente,
        ...(discipline === "NATACION" ? { swimLevel: valor } : {}),
      });
      setEntrenoMsg("Guardado. Entra en tu siguiente sesión de esa disciplina.");
    } catch (error) {
      setNiveles(anterior);
      setEntrenoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu nivel");
    }
  }

  return (
    <Card>
      <View style={styles.sectionHeader}>
        <SectionLabel>{disciplinaNombre(discipline)}</SectionLabel>
        <InfoTip titulo={disciplinaNombre(discipline)}>
          {esPrimaria ? (
            <TextoInfo>
              Es tu disciplina primaria: arma el esqueleto de tu semana. Sus días de gimnasio
              salen de tu presupuesto semanal menos lo que se llevan las demás disciplinas.
            </TextoInfo>
          ) : (
            <TextoInfo>
              Sus sesiones salen de tu presupuesto semanal: subirle aquí le quita días al
              gimnasio. En cero, la disciplina se quita de tu semana.
            </TextoInfo>
          )}
        </InfoTip>
      </View>

      {esPrimaria && (
        <Text style={styles.nota}>
          {diasGym} {diasGym === 1 ? "día" : "días"} de gimnasio a la semana.
        </Text>
      )}

      {!esPrimaria && carga && (
        <NumberStepper
          label="Sesiones por semana"
          value={carga.sessionsPerWeek}
          onChange={(sesiones) => actualizarCarga({ sessionsPerWeek: sesiones })}
          step={1}
          min={0}
        />
      )}

      {!esPrimaria && carga && (
        <View style={styles.chipsRow}>
          {PROPOSITOS.map((opcion) => (
            <Pressable
              key={opcion.valor}
              onPress={() => actualizarCarga({ proposito: opcion.valor })}
              style={[styles.chip, carga.proposito === opcion.valor && styles.chipOn]}
            >
              <Text
                style={[styles.chipText, carga.proposito === opcion.valor && styles.chipTextOn]}
              >
                {opcion.nombre}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!esPrimaria && !carga && (
        <Text style={styles.nota}>
          Esta disciplina ya no está en tu semana. Regresa a la sección para volver a agregarla.
        </Text>
      )}

      {opciones.length > 0 && (
        <View style={styles.lista}>
          {opciones.map((opcion) => (
            <Pressable
              key={opcion.valor}
              onPress={() => guardarNivel(opcion.valor)}
              style={[styles.fila, nivel === opcion.valor && styles.filaOn]}
            >
              <Text style={[styles.filaNombre, nivel === opcion.valor && styles.filaNombreOn]}>
                {opcion.nombre}
              </Text>
              <Text style={styles.filaDetalle}>{opcion.detalle}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {entrenoMsg && <Text style={styles.msg}>{entrenoMsg}</Text>}
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    lista: { gap: spacing.sm, marginTop: spacing.md },
    fila: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.lg,
      gap: 2,
    },
    filaOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    filaNombre: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    filaNombreOn: { color: colors.pergamino },
    filaDetalle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
    },
    chipOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    chipText: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    chipTextOn: { color: colors.pergamino },
    semanaLista: { gap: spacing.xs, marginTop: spacing.sm },
    semanaFila: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    semanaDia: {
      width: 40,
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1,
      color: colors.paloRosa,
    },
    semanaEtiqueta: {
      flex: 1,
      fontFamily: fonts.sansMedium,
      ...typeScale.bodySm,
      color: colors.marfil,
    },
    vacio: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.paloRosaLight,
      marginTop: spacing.md,
    },
    aviso: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.champan,
      marginTop: spacing.md,
      backgroundColor: withAlpha(colors.champan, 0.1),
      borderRadius: radius.md,
      padding: spacing.md,
    },
    diaFila: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    diaNombre: { width: 40, fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    diaOpciones: { flexDirection: "row", gap: 6, flex: 1 },
    diaChip: {
      flex: 1,
      alignItems: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingVertical: 6,
    },
    diaChipOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    diaChipTexto: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.marfil },
    diaChipTextoOn: { color: colors.pergamino },
    nota: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.paloRosaLight,
      marginTop: spacing.md,
    },
    msg: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.champan,
      marginTop: spacing.md,
    },
  });
