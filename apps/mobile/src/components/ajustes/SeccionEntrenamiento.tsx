import { useRouter } from "expo-router";
import { CalendarRange, Plus, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Collapsible } from "@/components/Collapsible";
import { Explicacion, TextoExplicativo } from "@/components/Explicacion";
import { NumberStepper } from "@/components/NumberStepper";
import { ScoreCard } from "@/components/ScoreCard";
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
  type SessionView,
  type SwimLevel,
  type WeekView,
} from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
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
 * "Tu entrenamiento" en Ajustes.
 *
 * EL PROBLEMA que resuelve este componente: la sección había crecido por
 * acreción —grupos a no repetir, disciplinas con stepper, niveles en otra
 * lista, la consecuencia, dos botones de replanteo— sin jerarquía de "qué
 * toco cuándo", y con las preferencias de cada disciplina (sesiones,
 * propósito, nivel) regadas en tres listas distintas que había que cruzar a
 * mano para entender una sola disciplina.
 *
 * EL REDISEÑO ordena la pantalla en tres preguntas, en este orden:
 *  1. "¿Qué tengo?" — Tu semana, arriba de todo, ANTES de tocar nada.
 *  2. "¿Qué tan grande es el cambio que quiero?" — tres niveles explícitos:
 *     ajustar una pieza (las tarjetas de abajo), repartir el peso entre
 *     disciplinas (/recalibrar) o empezar de cero (/replantear).
 *  3. "¿Qué toco de esa disciplina?" — una tarjeta por disciplina activa que
 *     junta sesiones, propósito y nivel, que antes vivían en listas separadas.
 *
 * Vive en su propio archivo (y no en `[seccion].tsx`) para no seguir
 * engordando ese archivo, que ya reúne seis secciones de Ajustes.
 */
export function SeccionEntrenamiento({ me }: { me: MeResponse | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sinRepetir, setSinRepetir] = useState<MuscleGroup[]>([]);
  const [primaria, setPrimaria] = useState<Discipline>("PESAS");
  const [otras, setOtras] = useState<DisciplineLoad[]>([]);
  const [niveles, setNiveles] = useState<Partial<Record<Discipline, SwimLevel>>>({});
  const [tiempoPorDia, setTiempoPorDia] = useState<Record<WeekDay, number>>(() =>
    Object.fromEntries(DIAS_SEMANA.map((dia) => [dia.valor, 0])) as Record<WeekDay, number>,
  );
  const [entrenoMsg, setEntrenoMsg] = useState<string | null>(null);
  const [tiempoMsg, setTiempoMsg] = useState<string | null>(null);
  // `true` por default: coincide con `Profile.compactDays` en el servidor
  // mientras la respuesta de `/me` no llega (deploy en progreso, o versión
  // vieja de la API todavía en producción).
  const [compactDays, setCompactDays] = useState(true);
  const [compactoMsg, setCompactoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setSinRepetir(me.profile.avoidRepeatGroups ?? []);
    setPrimaria(me.profile.primaryDiscipline ?? "PESAS");
    setOtras(me.profile.otherDisciplines ?? []);
    setNiveles({
      NATACION: me.profile.swimLevel ?? "PRINCIPIANTE",
      ...(me.profile.disciplineLevels ?? {}),
    });
    setCompactDays(me.profile.compactDays ?? true);

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

  const presupuestoSemanal = me?.profile?.trainingDaysPerWeek ?? 0;
  const diasGym = diasDeGimnasio(presupuestoSemanal, otras, primaria);

  // "Tu semana": la consecuencia real, pedida al servidor. Va arriba de todo
  // lo demás porque contesta "¿qué tengo?" antes de tocar ningún ajuste — un
  // ajuste que dice "guardado" y no enseña qué cambió pide un acto de fe.
  const [semana, setSemana] = useState<WeekView | null>(null);
  const cargarSemana = useCallback(async () => {
    try {
      setSemana(await getTrainingWeek());
    } catch {
      // Sin semana no hay "Tu semana" que mostrar; los ajustes se guardaron igual.
    }
  }, []);
  useEffect(() => {
    void cargarSemana();
  }, [cargarSemana]);

  const diasDeLaSemana = useMemo(() => diasResumenDe(semana), [semana]);
  const avisos = useMemo(() => avisosDeLaSemana(semana), [semana]);
  const resumenSemana = useMemo(() => {
    if (!semana) return "Cargando...";
    const conSesion = diasDeLaSemana.length;
    return conSesion === 0
      ? "Sin sesiones armadas todavía"
      : `${conSesion} ${conSesion === 1 ? "día" : "días"} con sesión de 7`;
  }, [semana, diasDeLaSemana]);

  async function guardarSinRepetir(grupo: MuscleGroup) {
    const siguiente = sinRepetir.includes(grupo)
      ? sinRepetir.filter((valor) => valor !== grupo)
      : [...sinRepetir, grupo];

    setSinRepetir(siguiente);
    setEntrenoMsg(null);
    try {
      await patchEntrenamiento({ avoidRepeatGroups: siguiente });
      void cargarSemana();
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

  /**
   * Guarda sesiones, propósito o importancia de UNA disciplina.
   *
   * Junta los tres en una sola función porque los tres viven en la misma
   * tarjeta y se mandan igual: el entry COMPLETO de esa disciplina dentro de
   * `otherDisciplines`. Mandar solo el campo que cambió perdería los otros
   * dos en el camino.
   */
  async function actualizarCarga(
    disciplina: Discipline,
    cambios: Partial<Pick<DisciplineLoad, "sessionsPerWeek" | "proposito" | "importancia">>,
  ) {
    const actual = otras.find((carga) => carga.discipline === disciplina);
    const entry: DisciplineLoad = {
      discipline: disciplina,
      sessionsPerWeek: Math.max(0, Math.min(7, cambios.sessionsPerWeek ?? actual?.sessionsPerWeek ?? 0)),
      proposito: cambios.proposito ?? actual?.proposito ?? "COMPLEMENTO",
      importancia: cambios.importancia ?? actual?.importancia ?? 2,
    };
    const siguiente =
      entry.sessionsPerWeek > 0
        ? [...otras.filter((carga) => carga.discipline !== disciplina), entry]
        : otras.filter((carga) => carga.discipline !== disciplina);

    setOtras(siguiente);
    setEntrenoMsg(null);
    try {
      await patchEntrenamiento({ otherDisciplines: siguiente });
      void cargarSemana();
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

  async function guardarNivel(disciplina: Discipline, nivel: SwimLevel) {
    const anterior = niveles;
    const siguiente = { ...niveles, [disciplina]: nivel };
    setNiveles(siguiente);
    setEntrenoMsg(null);
    try {
      // Natación además mantiene `swimLevel`, que existía antes de que el
      // nivel fuera por disciplina y sigue siendo su respaldo.
      await patchEntrenamiento({
        disciplineLevels: siguiente,
        ...(disciplina === "NATACION" ? { swimLevel: nivel } : {}),
      });
      void cargarSemana();
      setEntrenoMsg("Guardado. Entra en tu siguiente sesión de esa disciplina.");
    } catch (error) {
      setNiveles(anterior);
      setEntrenoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu nivel");
    }
  }

  /**
   * Guarda el tiempo de UN día (Fase 7).
   *
   * Hasta hoy, declarar cuánto tiempo hay cada día solo se podía hacer
   * rehaciendo el flujo completo de "Empezar de cero". Es el dato que hace
   * honesto el reparto de un día combinado: sin él, el generador no sabe si
   * un sábado con dos disciplinas de verdad tiene tiempo para las dos.
   */
  async function guardarTiempoDia(dia: WeekDay, minutos: number) {
    const anterior = tiempoPorDia;
    const siguiente = { ...tiempoPorDia, [dia]: minutos };
    setTiempoPorDia(siguiente);
    setTiempoMsg(null);
    try {
      await patchEntrenamiento({ timePerDay: siguiente });
      void cargarSemana();
      setTiempoMsg("Guardado. Entra en tu siguiente semana.");
    } catch (error) {
      setTiempoPorDia(anterior);
      setTiempoMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu tiempo");
    }
  }

  /**
   * Guarda cómo se arma la semana (Fase 10): días compactos o repartidos.
   *
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
      void cargarSemana();
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

  const activas = DISCIPLINAS.filter(
    (disciplina) => disciplina.valor === primaria || otras.some((carga) => carga.discipline === disciplina.valor),
  );
  const inactivas = DISCIPLINAS.filter(
    (disciplina) => disciplina.valor !== primaria && !otras.some((carga) => carga.discipline === disciplina.valor),
  );

  return (
    <>
      {/* 1. "¿Qué tengo?" — la consecuencia real, antes de tocar nada. */}
      <ScoreCard icon={CalendarRange} tint={colors.paloRosa} title="Tu semana" summary={resumenSemana}>
        {diasDeLaSemana.length === 0 ? (
          <TextoExplicativo>Todavía no hay semana armada.</TextoExplicativo>
        ) : (
          <View style={styles.semanaLista}>
            {diasDeLaSemana.map((dia) => (
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
      </ScoreCard>

      {/* "Cómo se arma tu semana" (Fase 10): combinar por gusto o repartir. */}
      <Card>
        <SectionLabel>Cómo se arma tu semana</SectionLabel>
        <Explicacion titulo="Qué decide esto">
          <TextoExplicativo>
            El orden dentro de un día combinado no se pregunta: la app siempre cierra con la
            alberca (recuperación activa) y abre con el impacto —squash, box— cuando las piernas
            todavía están frescas. Esto solo decide si combina disciplinas compatibles el mismo
            día, o si le da a cada una su propio día.
          </TextoExplicativo>
        </Explicacion>

        <View style={styles.presupuestoLista}>
          <Pressable
            onPress={() => guardarCompactDays(true)}
            style={[styles.presupuestoFila, compactDays && styles.presupuestoFilaOn]}
          >
            <Text style={[styles.presupuestoNombre, compactDays && styles.presupuestoNombreOn]}>
              Días compactos
            </Text>
            <Text style={styles.presupuestoDetalle}>
              Combina disciplinas compatibles el mismo día y te deja más días de descanso
              completo.
            </Text>
          </Pressable>
          <Pressable
            onPress={() => guardarCompactDays(false)}
            style={[styles.presupuestoFila, !compactDays && styles.presupuestoFilaOn]}
          >
            <Text style={[styles.presupuestoNombre, !compactDays && styles.presupuestoNombreOn]}>
              Días repartidos
            </Text>
            <Text style={styles.presupuestoDetalle}>Una disciplina por día, sesiones más frescas.</Text>
          </Pressable>
        </View>

        {compactoMsg && <Text style={styles.vaultMsg}>{compactoMsg}</Text>}
      </Card>

      {/* 2. "¿Qué tan grande es el cambio?" — los tres niveles, en orden. */}
      <Card>
        <SectionLabel>Cambiar tu plan</SectionLabel>
        <Explicacion titulo="Qué nivel de cambio necesitas">
          <TextoExplicativo>
            Tres tamaños de cambio, de menor a mayor: ajustar una pieza (las tarjetas de abajo,
            disciplina por disciplina), repartir el peso entre las que ya tienes activas, o empezar
            de cero cuando cambió algo más grande que una preferencia.
          </TextoExplicativo>
        </Explicacion>

        <Pressable onPress={() => router.push("/recalibrar")} style={styles.recalibrar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recalibrarTexto}>Repartir el peso entre disciplinas →</Text>
            <Text style={styles.linkDetalle}>Cuándo usarlo: nadar te está gustando y quieres más.</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => router.push("/replantear")} style={styles.replantear}>
          <RotateCcw size={18} color={colors.pergamino} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replantearTitulo}>Empezar de cero</Text>
            <Text style={styles.replantearDetalle}>
              Cuándo usarlo: cambió tu horario, tu objetivo o tu vida.
            </Text>
          </View>
        </Pressable>
      </Card>

      {/* 3. "¿Qué toco de esa disciplina?" — una tarjeta por disciplina activa. */}
      <SectionLabel>Ajuste fino, por disciplina</SectionLabel>

      <TarjetaDisciplina
        discipline={primaria}
        esPrimaria
        diasGym={diasGym}
        nivel={niveles[primaria] ?? "PRINCIPIANTE"}
        onGuardarNivel={(nivel) => guardarNivel(primaria, nivel)}
      />

      {activas
        .filter((disciplina) => disciplina.valor !== primaria)
        .map((disciplina) => {
          const carga = otras.find((entrada) => entrada.discipline === disciplina.valor)!;
          return (
            <TarjetaDisciplina
              key={disciplina.valor}
              discipline={disciplina.valor}
              esPrimaria={false}
              carga={carga}
              nivel={niveles[disciplina.valor] ?? "PRINCIPIANTE"}
              onGuardarSesiones={(sesiones) => actualizarCarga(disciplina.valor, { sessionsPerWeek: sesiones })}
              onGuardarProposito={(proposito) => actualizarCarga(disciplina.valor, { proposito })}
              onGuardarNivel={(nivel) => guardarNivel(disciplina.valor, nivel)}
            />
          );
        })}

      {entrenoMsg && <Text style={styles.vaultMsg}>{entrenoMsg}</Text>}

      {inactivas.length > 0 && (
        <View style={styles.pastillas}>
          {inactivas.map((disciplina) => {
            const Icono = iconoDe(disciplina.valor);
            return (
              <Pressable
                key={disciplina.valor}
                onPress={() => actualizarCarga(disciplina.valor, { sessionsPerWeek: 1 })}
                style={({ pressed }) => [styles.pastilla, pressed && styles.pastillaPresionada]}
              >
                <Plus size={14} color={colors.champan} strokeWidth={2.5} />
                <Icono size={14} color={colors.paloRosa} strokeWidth={2} />
                <Text style={styles.pastillaTexto}>{disciplina.nombre}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Tiempo por día (Fase 7): lo que hace honesto el reparto de un día combinado. */}
      <Card>
        <SectionLabel>Tiempo por día</SectionLabel>
        <Explicacion titulo="Para qué sirve esto">
          <TextoExplicativo>
            Un día con dos disciplinas —gym y alberca, squash y funcional— solo reparte bien el
            tiempo si sabe cuánto hay de verdad ese día. Hasta ahora esto solo se declaraba rehaciendo
            el flujo completo de "Empezar de cero"; aquí se ajusta un día a la vez.
          </TextoExplicativo>
        </Explicacion>

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

        {tiempoMsg && <Text style={styles.vaultMsg}>{tiempoMsg}</Text>}
      </Card>

      {/* Grupos a no repetir: se queda tal cual estaba, solo que ahora dentro
          de una tarjeta colapsable para no estorbar el flujo de arriba. */}
      <Card>
        <Collapsible title="Grupos que no quieres repetir">
          <Explicacion titulo="Cómo funciona">
            <TextoExplicativo>
              El grupo que marques se entrena una vez a la semana. Los días que lo repetían no
              desaparecen: pasan a trabajar otra cosa, así que sigues entrenando los mismos días.
            </TextoExplicativo>
          </Explicacion>

          <View style={styles.cierreRow}>
            {GRUPOS.map((grupo) => {
              const activo = sinRepetir.includes(grupo.valor);
              return (
                <Pressable
                  key={grupo.valor}
                  onPress={() => guardarSinRepetir(grupo.valor)}
                  style={[styles.cierreChip, activo && styles.cierreChipOn]}
                >
                  <Text style={[styles.cierreChipText, activo && styles.cierreChipTextOn]}>
                    {grupo.nombre}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Collapsible>
      </Card>
    </>
  );
}

/**
 * Una disciplina activa, colapsable: cerrada ya contesta cuánto se entrena,
 * para qué y en qué nivel. Adentro van juntos el stepper de sesiones, los
 * chips de propósito y el selector de nivel — antes vivían en tres listas
 * distintas y para entender UNA disciplina había que cruzarlas a mano.
 */
function TarjetaDisciplina({
  discipline,
  esPrimaria,
  carga,
  diasGym,
  nivel,
  onGuardarSesiones,
  onGuardarProposito,
  onGuardarNivel,
}: {
  discipline: Discipline;
  esPrimaria: boolean;
  carga?: DisciplineLoad;
  diasGym?: number;
  nivel: SwimLevel;
  onGuardarSesiones?: (sesiones: number) => void;
  onGuardarProposito?: (proposito: Proposito) => void;
  onGuardarNivel: (nivel: SwimLevel) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const Icono = iconoDe(discipline);
  const opciones = NIVELES_POR_DISCIPLINA[discipline] ?? [];
  const nombreNivel = opciones.find((opcion) => opcion.valor === nivel)?.nombre ?? "Principiante";
  const nombreProposito = PROPOSITOS.find((opcion) => opcion.valor === carga?.proposito)?.nombre ?? null;

  const partes: string[] = [];
  if (esPrimaria) {
    partes.push(`${diasGym ?? 0} ${(diasGym ?? 0) === 1 ? "día" : "días"} de gimnasio`);
  } else if (carga) {
    partes.push(`${carga.sessionsPerWeek} ${carga.sessionsPerWeek === 1 ? "sesión" : "sesiones"}`);
    if (nombreProposito) partes.push(nombreProposito.toLowerCase());
  }
  partes.push(nombreNivel.toLowerCase());

  return (
    <ScoreCard icon={Icono} tint={colors.champan} title={disciplinaNombre(discipline)} summary={partes.join(" · ")}>
      {!esPrimaria && carga && onGuardarSesiones && (
        <NumberStepper
          label="Sesiones por semana"
          value={carga.sessionsPerWeek}
          onChange={onGuardarSesiones}
          step={1}
          min={0}
        />
      )}

      {!esPrimaria && carga && onGuardarProposito && (
        <View style={styles.propositos}>
          {PROPOSITOS.map((opcion) => (
            <Pressable
              key={opcion.valor}
              onPress={() => onGuardarProposito(opcion.valor)}
              style={[styles.cierreChip, carga.proposito === opcion.valor && styles.cierreChipOn]}
            >
              <Text
                style={[styles.cierreChipText, carga.proposito === opcion.valor && styles.cierreChipTextOn]}
              >
                {opcion.nombre}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {opciones.length > 0 && (
        <View style={styles.presupuestoLista}>
          {opciones.map((opcion) => (
            <Pressable
              key={opcion.valor}
              onPress={() => onGuardarNivel(opcion.valor)}
              style={[styles.presupuestoFila, nivel === opcion.valor && styles.presupuestoFilaOn]}
            >
              <Text
                style={[styles.presupuestoNombre, nivel === opcion.valor && styles.presupuestoNombreOn]}
              >
                {opcion.nombre}
              </Text>
              <Text style={styles.presupuestoDetalle}>{opcion.detalle}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScoreCard>
  );
}

function disciplinaNombre(discipline: Discipline): string {
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
type DiaResumen = { date: string; abrev: string; etiqueta: string };

function diasResumenDe(semana: WeekView | null): DiaResumen[] {
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
function avisosDeLaSemana(semana: WeekView | null): string[] {
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    semanaLista: { gap: spacing.xs, marginTop: spacing.sm },
    semanaFila: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    semanaDia: {
      width: 40,
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1,
      color: colors.paloRosa,
    },
    semanaEtiqueta: { flex: 1, fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    aviso: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.champan,
      marginTop: spacing.md,
      backgroundColor: withAlpha(colors.champan, 0.1),
      borderRadius: radius.md,
      padding: spacing.md,
    },
    recalibrar: { paddingVertical: spacing.md, marginTop: spacing.md },
    recalibrarTexto: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.champan },
    linkDetalle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight, marginTop: 2 },
    replantear: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.sm,
      backgroundColor: colors.guinda,
      borderWidth: 1,
      borderColor: colors.guindaLight,
      borderRadius: radius.xl,
      padding: spacing.lg,
    },
    replantearTitulo: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.pergamino },
    replantearDetalle: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: withAlpha(colors.pergamino, 0.85),
    },
    propositos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    presupuestoLista: { gap: spacing.sm, marginTop: spacing.md },
    presupuestoFila: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.lg,
      gap: 2,
    },
    presupuestoFilaOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    presupuestoNombre: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.marfil },
    presupuestoNombreOn: { color: colors.pergamino },
    presupuestoDetalle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    pastillas: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pastilla: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: withAlpha(colors.champan, 0.45),
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pastillaPresionada: { opacity: 0.7 },
    pastillaTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
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
    cierreRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
    cierreChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
    },
    cierreChipOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    cierreChipText: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
    cierreChipTextOn: { color: colors.pergamino },
    vaultMsg: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.champan, marginTop: spacing.md },
  });
