import { useRouter } from "expo-router";
import {
  Activity as ActivityIcon,
  CalendarCheck,
  ClipboardCheck,
  Dumbbell,
  Flame,
  FlaskConical,
  Footprints,
  HeartPulse,
  Moon,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Waves,
} from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActivityRings, type Ring } from "@/components/ActivityRings";
import { ChartBoundary } from "@/components/ChartBoundary";
import { GapChart, type Brecha } from "@/components/GapChart";
import { LineChart } from "@/components/LineChart";
import { PanelGrande } from "@/components/PanelGrande";
import { RadarChart, type Eje } from "@/components/RadarChart";
import { ScoreTile } from "@/components/ScoreTile";
import { useTheme } from "@/context/theme";
import {
  DISCIPLINE_LABELS,
  type Activity,
  type CheckInPoint,
  type CheckInRow,
  type ComidasResponse,
  type Decision,
  type GoalResponse,
  type HealthDayPayload,
  type LabResult,
  type MeResponse,
  type PersonalRecord,
  type TrainingHistoryRow,
  type WeekView,
} from "@/lib/api";
import { textoDeGlidepath, type Glidepath } from "@/lib/glidepath";
import { EJERCICIO_META_MIN, PASOS_META, SUENO_META_MIN, formatSleep } from "@/lib/insights";
import { brechasDelMes, type MetasDelMes } from "@/lib/metas";
import type { PanelConfig } from "@/lib/paneles";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";

/**
 * Un panel del Resumen, ya resuelto.
 *
 * Vive aparte de la pantalla porque lo usan DOS lugares: el Resumen y el
 * editor, que enseña el tablero de verdad mientras se acomoda. Un editor con
 * cajas grises que dicen el nombre del panel obliga a salir, mirar y volver a
 * entrar por cada cambio; con el panel real, lo que se ve al acomodar es lo
 * que va a quedar.
 *
 * Recibe la vista ya calculada —no vuelve a pedir nada— para que pintarlo dos
 * veces no cueste dos cargas.
 */

export type VistaResumen = {
  datos: {
    sessions: TrainingHistoryRow[] | null;
    records: PersonalRecord[] | null;
    checkIns: CheckInRow[] | null;
    healthDays: HealthDayPayload[] | null;
    activities: Activity[] | null;
    week: WeekView | null;
    goal: GoalResponse | null;
    decision: Decision | null;
    points: CheckInPoint[] | null;
    me: MeResponse | null;
    labs: LabResult[] | null;
    comidas: ComidasResponse | null;
  };
  pasos: { value: number; date: string } | null;
  ejercicio: { value: number; date: string } | null;
  sueno: { value: number; date: string } | null;
  hrv: { value: number; date: string } | null;
  vo2: { value: number; date: string } | null;
  fecha: string | null;
  rings: Ring[];
  ejes: Eje[];
  metas: MetasDelMes;
  brechas: Brecha[];
  plan: Glidepath | null;
  ultimoCheckIn: CheckInRow | null;
  diasCheckIn: number | null;
  checkInPendiente: boolean;
  sesionesTotal: number;
  sesionesHechas: number;
  streak: number;
  best: number;
  prs: PersonalRecord[];
  ultimoPr: PersonalRecord | null;
  objetivoEstado: string | null;
  objetivoListo: boolean;
  objetivoLabel: string | null;
  anchoPanel: number;
  ultimoLab: LabResult | null;
  cumplimiento: {
    rutina: number | null;
    rutinaDetalle: string | null;
    dieta: number | null;
    dietaMedida: boolean;
    dietaContestadas: number;
  };
  serieDe: (campo: "waistCm" | "weightKg") => number[];
  serieSalud: (campo: "steps" | "sleepMin" | "hrvMs" | "vo2max") => number[];
  puntosSalud: (
    campo: "steps" | "sleepMin" | "hrvMs" | "vo2max",
  ) => Array<{ date: string; value: number | null }>;
  formatDateEs: (fecha: string) => string;
};

const DIAS_SEMANA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** Una fila de los anillos: ícono, valor y su meta, tocable hasta el detalle. */
function Leyenda({
  icon: Icon,
  color,
  label,
  valor,
  meta,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
  valor: string;
  meta: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.leyenda, pressed && styles.pressed]}>
      <Icon size={16} color={color} strokeWidth={2} />
      <View style={styles.leyendaTexto}>
        <Text style={styles.leyendaValor}>{valor}</Text>
        <Text style={styles.leyendaLabel}>
          {label} · {meta}
        </Text>
      </View>
    </Pressable>
  );
}

function Macro({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValor}>{valor}</Text>
    </View>
  );
}

export function PanelResumen({
  config,
  vista,
}: {
  config: PanelConfig;
  vista: VistaResumen;
}): React.ReactNode {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const {
    datos,
    pasos,
    ejercicio,
    sueno,
    hrv,
    vo2,
    fecha,
    rings,
    ejes,
    metas,
    brechas,
    plan,
    ultimoCheckIn,
    diasCheckIn,
    checkInPendiente,
    sesionesTotal,
    sesionesHechas,
    streak,
    best,
    prs,
    ultimoPr,
    objetivoEstado,
    objetivoListo,
    objetivoLabel,
    anchoPanel,
    ultimoLab,
    cumplimiento,
    serieDe,
    serieSalud,
    puntosSalud,
    formatDateEs,
  } = vista;

  function navegar(ruta: string) {
    router.push(ruta as never);
  }

    const { id, variante, ancho } = config;
    const grande = ancho === "ancho";
    const conTendencia = variante === "detallado";
    const compacto = variante === "compacto";

    /** Cuadro estándar de media pantalla. Todos los chicos se ven igual. */
    function chico(props: {
      icon: typeof Flame;
      tint: string;
      title: string;
      value: string;
      detail?: string | null;
      status?: { label: string; tone: "ok" | "warn" | "alto" | "neutral" } | null;
      serie?: number[];
      onPress?: () => void;
    }) {
      return (
        <ScoreTile
          icon={props.icon}
          tint={props.tint}
          title={props.title}
          value={props.value}
          detail={compacto ? null : props.detail}
          status={props.status ?? null}
          serie={conTendencia ? props.serie : undefined}
          onPress={props.onPress}
        />
      );
    }

    switch (id) {
      case "anillos": {
        const cuerpo = (
          <>
            <View style={styles.heroBody}>
              <ActivityRings rings={rings} size={grande ? 132 : 108} />
              <View style={styles.leyendas}>
                <Leyenda
                  icon={Footprints}
                  color={colors.champan}
                  label="Pasos"
                  valor={pasos ? `${pasos.value.toLocaleString("es-MX")}` : "—"}
                  meta={`de ${PASOS_META.toLocaleString("es-MX")}`}
                  onPress={() => navegar("/salud/pasos")}
                />
                <Leyenda
                  icon={Timer}
                  color={colors.guindaLight}
                  label="Ejercicio"
                  valor={ejercicio ? `${ejercicio.value} min` : "—"}
                  meta={`de ${EJERCICIO_META_MIN} min`}
                  onPress={() => navegar("/salud/pasos")}
                />
                <Leyenda
                  icon={Moon}
                  color={colors.paloRosa}
                  label="Sueño"
                  valor={sueno ? formatSleep(sueno.value) : "—"}
                  meta={`de ${formatSleep(SUENO_META_MIN)}`}
                  onPress={() => navegar("/salud/descanso")}
                />
              </View>
            </View>

            {/* Recuperación y condición ya no son dos íconos sueltos abajo:
                llevan su número y su lectura, o dicen que falta el dato. Un
                ícono solo no informa nada. */}
            {grande && (
              <View style={styles.extras}>
                <Leyenda
                  icon={HeartPulse}
                  color={colors.error}
                  label="Recuperación"
                  valor={hrv ? `${hrv.value} ms` : "Sin dato"}
                  meta={hrv ? "vs. tu normal de 4 semanas" : "el reloj no la ha subido"}
                  onPress={() => navegar("/salud/recuperacion")}
                />
                <Leyenda
                  icon={ActivityIcon}
                  color={colors.champan}
                  label="Condición"
                  valor={vo2 ? `${vo2.value}` : "Sin dato"}
                  meta={vo2 ? "VO₂ máx" : "necesita entrenos al aire libre"}
                  onPress={() => navegar("/salud/condicion")}
                />
              </View>
            )}
          </>
        );

        return (
          <View style={styles.hero}>
            <View style={styles.heroHead}>
              <Text style={styles.heroTitle}>Tu día</Text>
              <Text style={styles.heroPista}>toca cualquiera para ver su detalle ›</Text>
            </View>
            {!compacto && (
              <Text style={styles.heroCaption}>
                {fecha
                  ? `Último dato del reloj: ${formatDateEs(fecha)}`
                  : "Conecta tu reloj para llenar los anillos"}
              </Text>
            )}
            {cuerpo}
          </View>
        );
      }

      case "perfil":
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu semana vs. lo esperado</Text>
            <Text style={styles.heroCaption}>
              Cada eje contra lo que tocaba a estas alturas
              {objetivoLabel ? `, para tu objetivo de ${objetivoLabel}` : ""}.
            </Text>
            <ChartBoundary label="La telaraña no se pudo dibujar.">
              <RadarChart ejes={grande ? ejes : ejes.slice(0, 6)} size={grande ? 260 : anchoPanel} />
            </ChartBoundary>
          </View>
        );

      case "mes":
        if (metas.medidas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Tu mes</Text>
            <Text style={styles.heroCaption}>
              Dónde estás hoy y a dónde llega el escalón de este mes, desde tu check-in del{" "}
              {metas.desde}
            </Text>

            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="Las metas del mes no se pudieron dibujar.">
                <GapChart brechas={grande ? brechasDelMes(metas.medidas) : brechasDelMes(metas.medidas).slice(0, 2)} />
              </ChartBoundary>
            </View>

            <Pressable onPress={() => navegar("/glidepath")} hitSlop={6}>
              <Text style={styles.glidepathLink}>Ver todo el camino al objetivo →</Text>
            </Pressable>
          </View>
        );

      case "brecha_objetivo":
        if (brechas.length === 0) return null;
        return (
          <View style={styles.perfil}>
            <Text style={styles.heroTitle}>Vs. tu objetivo final</Text>
            <Text style={styles.heroCaption}>
              {objetivoListo
                ? "Sale de comparar tus fotos con tu referencia. Es una lectura por zona, no centímetros: de una foto no salen medidas."
                : "Todavía sin fotos tuyas: esto es el énfasis que pide tu referencia, no tu brecha."}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <ChartBoundary label="La brecha no se pudo dibujar.">
                <GapChart brechas={grande ? brechas : brechas.slice(0, 3)} />
              </ChartBoundary>
            </View>
          </View>
        );

      case "cintura": {
        const serie = serieDe("waistCm");
        const detalle = ultimoCheckIn
          ? `${datos.checkIns?.length ?? 0} check-ins · ${formatDateEs(ultimoCheckIn.date)}`
          : "Tu primer check-in arranca el historial";
        const valor = ultimoCheckIn?.waistCm != null ? `${ultimoCheckIn.waistCm} cm` : "—";

        if (!grande) {
          return chico({
            icon: TrendingUp,
            tint: colors.champan,
            title: "Cintura",
            value: valor,
            detail: detalle,
            serie,
            onPress: () => navegar("/salud/medidas"),
          });
        }

        return (
          <PanelGrande
            icon={TrendingUp}
            tint={colors.champan}
            title="Cintura"
            value={valor}
            detail={detalle}
            onPress={() => navegar("/salud/medidas")}
          >
            <ChartBoundary label="La tendencia no se pudo dibujar.">
              <LineChart
                points={(datos.points ?? []).slice(-10).map((punto) => ({
                  date: punto.date,
                  value: punto.waistCm,
                }))}
                color={colors.champan}
                goal={plan?.meta ?? null}
                format={(valor) => `${valor} cm`}
              />
            </ChartBoundary>
            {plan && <Text style={styles.panelNota}>{textoDeGlidepath(plan)}</Text>}
          </PanelGrande>
        );
      }

      case "checkin": {
        const valor = diasCheckIn === null ? "—" : diasCheckIn === 0 ? "Hoy" : `${diasCheckIn} d`;
        const estado = {
          label: checkInPendiente ? "Toca" : "Al día",
          tone: (checkInPendiente ? "warn" : "ok") as "warn" | "ok",
        };
        const detalle = diasCheckIn === null ? "Nunca has hecho uno" : "desde el último";

        if (!grande) {
          return chico({
            icon: CalendarCheck,
            tint: colors.guindaLight,
            title: "Check-in",
            value: valor,
            detail: detalle,
            status: estado,
            onPress: () => navegar("/checkin"),
          });
        }

        return (
          <PanelGrande
            icon={CalendarCheck}
            tint={colors.guindaLight}
            title="Check-in"
            value={valor}
            detail={detalle}
            status={estado}
            onPress={() => navegar("/checkin")}
          >
            <Text style={styles.panelNota}>
              {datos.me?.profile?.checkinWeekday != null
                ? `Cierras tu semana los ${DIAS_SEMANA[datos.me.profile.checkinWeekday]}${
                    datos.me.profile.checkinHour != null
                      ? ` a las ${datos.me.profile.checkinHour}:00`
                      : ""
                  }.`
                : "Todavía no eliges qué día cierras tu semana. Se configura en Ajustes."}
            </Text>
            <Text style={styles.panelNota}>
              Seis campos: cintura, peso y cuatro escalas. Brazos y piernas van una vez al mes.
            </Text>
          </PanelGrande>
        );
      }

      case "semana": {
        const valor = sesionesTotal === 0 ? "—" : `${sesionesHechas}/${sesionesTotal}`;
        const detalle = sesionesTotal === 0 ? "Sin semana generada" : "sesiones completadas";

        if (!grande) {
          return chico({
            icon: Dumbbell,
            tint: colors.paloRosa,
            title: "Esta semana",
            value: valor,
            detail: detalle,
            onPress: () => navegar("/rutinas"),
          });
        }

        return (
          <PanelGrande
            icon={Dumbbell}
            tint={colors.paloRosa}
            title="Esta semana"
            value={valor}
            detail={detalle}
            onPress={() => navegar("/rutinas")}
          >
            {(datos.week?.sessions ?? []).map((sesion) => (
              <View key={sesion.workoutId} style={styles.filaSemana}>
                <Text style={styles.filaSemanaDia}>{sesion.date.slice(8)}/{sesion.date.slice(5, 7)}</Text>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {sesion.muscleGroup}
                </Text>
                <Text
                  style={[
                    styles.filaSemanaEstado,
                    sesion.completedAt !== null && styles.filaSemanaHecha,
                  ]}
                >
                  {sesion.completedAt !== null ? "hecha" : "pendiente"}
                </Text>
              </View>
            ))}
          </PanelGrande>
        );
      }

      case "disciplinas": {
        const otras = datos.week?.otherSessions ?? [];
        const valor = `${sesionesTotal + otras.length}`;

        if (!grande) {
          return chico({
            icon: Waves,
            tint: colors.paloRosa,
            title: "Tus disciplinas",
            value: valor,
            detail: "sesiones esta semana",
            onPress: () => navegar("/rutinas"),
          });
        }

        return (
          <PanelGrande
            icon={Waves}
            tint={colors.paloRosa}
            title="Tus disciplinas"
            value={valor}
            detail="sesiones esta semana"
            onPress={() => navegar("/rutinas")}
          >
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Pesas</Text>
              <Text style={styles.filaSemanaEstado}>{sesionesTotal} sesiones</Text>
            </View>
            {otras.length === 0 ? (
              <Text style={styles.panelNota}>
                Solo pesas. Agrega otra disciplina en Ajustes y se reparte sola en tu semana.
              </Text>
            ) : (
              Object.entries(
                otras.reduce<Record<string, number>>((cuenta, sesion) => {
                  const nombre = DISCIPLINE_LABELS[sesion.discipline];
                  cuenta[nombre] = (cuenta[nombre] ?? 0) + 1;
                  return cuenta;
                }, {}),
              ).map(([nombre, cuantas]) => (
                <View key={nombre} style={styles.filaSemana}>
                  <Text style={styles.filaSemanaGrupo}>{nombre}</Text>
                  <Text style={styles.filaSemanaEstado}>{cuantas} sesiones</Text>
                </View>
              ))
            )}
          </PanelGrande>
        );
      }

      case "cumplimiento": {
        const valor = cumplimiento.rutina === null ? "—" : `${cumplimiento.rutina} %`;
        const detalle = "de tu rutina, con lo ya registrado";

        if (!grande) {
          return chico({
            icon: ClipboardCheck,
            tint: colors.champan,
            title: "Cumplimiento",
            value: valor,
            detail: detalle,
            onPress: () => navegar("/checkin"),
          });
        }

        return (
          <PanelGrande
            icon={ClipboardCheck}
            tint={colors.champan}
            title="Cumplimiento"
            value={valor}
            detail={detalle}
            onPress={() => navegar("/checkin")}
          >
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Rutina</Text>
              <Text style={styles.filaSemanaEstado}>
                {cumplimiento.rutinaDetalle ?? "sin semana generada"}
              </Text>
            </View>
            <View style={styles.filaSemana}>
              <Text style={styles.filaSemanaGrupo}>Dieta</Text>
              <Text style={styles.filaSemanaEstado}>
                {cumplimiento.dieta === null
                  ? "sin datos todavía"
                  : cumplimiento.dietaMedida
                    ? `${cumplimiento.dieta} % · ${cumplimiento.dietaContestadas} comidas confirmadas`
                    : `${cumplimiento.dieta} % en tu último check-in`}
              </Text>
            </View>
            <Text style={styles.panelNota}>
              {cumplimiento.dietaMedida
                ? "Los dos se cuentan solos: la rutina con lo que cierras en la app y sube el reloj, y la dieta con las comidas que confirmas desde el aviso."
                : "La rutina se cuenta sola. Para que la dieta también, confirma tus comidas desde Hoy o desde el aviso que llega a su hora."}
            </Text>
          </PanelGrande>
        );
      }

      case "racha": {
        const detalle =
          streak === 0
            ? "Hoy cuenta para empezar"
            : best > streak
              ? `días · tu mejor: ${best}`
              : "días entrenando seguido";

        if (!grande) {
          return chico({ icon: Flame, tint: colors.champan, title: "Racha", value: `${streak}`, detail: detalle });
        }

        return (
          <PanelGrande icon={Flame} tint={colors.champan} title="Racha" value={`${streak}`} detail={detalle}>
            <Text style={styles.panelNota}>
              Tu mejor racha son {best} {best === 1 ? "día" : "días"}. Cuenta cualquier sesión
              registrada, de gimnasio o de otra disciplina.
            </Text>
          </PanelGrande>
        );
      }

      case "estudios": {
        const valor = ultimoLab ? formatDateEs(ultimoLab.takenOn) : "—";
        const detalle = ultimoLab
          ? `${ultimoLab.values.length} valores · ${ultimoLab.kind === "INBODY" ? "bioimpedancia" : "química"}`
          : "Todavía sin estudios cargados";
        const estado =
          ultimoLab && ultimoLab.outsideRange.length > 0
            ? { label: "Revisar", tone: "warn" as const }
            : null;

        if (!grande) {
          return chico({
            icon: FlaskConical,
            tint: colors.guindaLight,
            title: "Tus estudios",
            value: valor,
            detail: detalle,
            status: estado,
            onPress: () => navegar("/laboratorios"),
          });
        }

        return (
          <PanelGrande
            icon={FlaskConical}
            tint={colors.guindaLight}
            title="Tus estudios"
            value={valor}
            detail={detalle}
            status={estado}
            onPress={() => navegar("/laboratorios")}
          >
            {(ultimoLab?.values ?? []).slice(0, 5).map((dato) => (
              <View key={dato.key} style={styles.filaSemana}>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {dato.label}
                </Text>
                <Text style={styles.filaSemanaEstado}>
                  {dato.value} {dato.unit}
                </Text>
              </View>
            ))}
            <Text style={styles.panelNota}>
              Se guardan y se grafican. La app no los interpreta: lo que salga fuera del rango de
              tu laboratorio lo revisa un médico.
            </Text>
          </PanelGrande>
        );
      }

      case "plan": {
        const valor = datos.decision ? `${datos.decision.kcal}` : "—";
        const detalle = datos.decision
          ? `kcal · ${datos.decision.phase.replace(/_/g, " ").toLowerCase()}`
          : "Sin decisión publicada";

        if (!grande) {
          return chico({
            icon: Flame,
            tint: colors.paloRosa,
            title: "Tu plan",
            value: valor,
            detail: detalle,
            onPress: () => navegar("/nutricion"),
          });
        }

        return (
          <PanelGrande
            icon={Flame}
            tint={colors.paloRosa}
            title="Tu plan"
            value={valor}
            detail={detalle}
            onPress={() => navegar("/nutricion")}
          >
            {datos.decision ? (
              <View style={styles.macros}>
                <Macro label="Proteína" valor={`${datos.decision.proteinG} g`} />
                <Macro label="Carbohidratos" valor={`${datos.decision.carbsG} g`} />
                <Macro label="Grasas" valor={`${datos.decision.fatG} g`} />
              </View>
            ) : (
              <Text style={styles.panelNota}>
                Tu primera decisión sale de tu primer check-in.
              </Text>
            )}
          </PanelGrande>
        );
      }

      case "objetivo": {
        const valor =
          objetivoEstado === "listo"
            ? "Listo"
            : objetivoEstado === "en_espera"
              ? "En análisis"
              : "Pendiente";
        const detalle =
          datos.goal && "references" in datos.goal.status
            ? `${datos.goal.status.references} referencias`
            : "Sube tus fotos de referencia";

        if (!grande) {
          return chico({
            icon: Target,
            tint: colors.guindaLight,
            title: "Objetivo",
            value: valor,
            detail: detalle,
            onPress: () => navegar("/objetivo"),
          });
        }

        return (
          <PanelGrande
            icon={Target}
            tint={colors.guindaLight}
            title="Objetivo"
            value={valor}
            detail={detalle}
            onPress={() => navegar("/objetivo")}
          >
            <Text style={styles.panelNota}>
              La referencia es dirección, no promesa: se comparan proporciones, nunca identidades.
            </Text>
          </PanelGrande>
        );
      }

      case "records": {
        const detalle = ultimoPr
          ? `último: ${ultimoPr.exerciseName} ${ultimoPr.weightKg} kg`
          : "Cierra sesiones para tener PRs";

        if (!grande) {
          return chico({
            icon: Trophy,
            tint: colors.champan,
            title: "Récords",
            value: `${prs.length}`,
            detail: detalle,
            onPress: () => navegar("/historial"),
          });
        }

        return (
          <PanelGrande
            icon={Trophy}
            tint={colors.champan}
            title="Récords"
            value={`${prs.length}`}
            detail={detalle}
            onPress={() => navegar("/historial")}
          >
            {prs.slice(0, 5).map((record) => (
              <View key={record.exerciseName} style={styles.filaSemana}>
                <Text style={styles.filaSemanaGrupo} numberOfLines={1}>
                  {record.exerciseName}
                </Text>
                <Text style={styles.filaSemanaEstado}>
                  {record.weightKg} kg × {record.reps}
                </Text>
              </View>
            ))}
          </PanelGrande>
        );
      }

      case "peso":
        return metricaSimple({
          grande,
          icon: TrendingUp,
          tint: colors.paloRosa,
          title: "Peso",
          value: ultimoCheckIn?.weightKg != null ? `${ultimoCheckIn.weightKg} kg` : "—",
          detail: "de tu último check-in",
          serie: serieDe("weightKg"),
          puntos: (datos.points ?? []).slice(-10).map((punto) => ({ date: punto.date, value: punto.weightKg })),
          formato: (valor: number) => `${valor} kg`,
          ruta: "/salud/medidas",
        });

      case "pasos":
        return metricaSimple({
          grande,
          icon: Footprints,
          tint: colors.champan,
          title: "Pasos",
          value: pasos ? pasos.value.toLocaleString("es-MX") : "—",
          detail: `de ${PASOS_META.toLocaleString("es-MX")}`,
          serie: serieSalud("steps"),
          puntos: puntosSalud("steps"),
          formato: (valor: number) => `${Math.round(valor)}`,
          ruta: "/salud/pasos",
        });

      case "sueno":
        return metricaSimple({
          grande,
          icon: Moon,
          tint: colors.paloRosa,
          title: "Sueño",
          value: sueno ? formatSleep(sueno.value) : "—",
          detail: `de ${formatSleep(SUENO_META_MIN)}`,
          serie: serieSalud("sleepMin"),
          puntos: puntosSalud("sleepMin"),
          formato: (valor: number) => formatSleep(valor),
          ruta: "/salud/descanso",
        });

      case "recuperacion":
        return metricaSimple({
          grande,
          icon: HeartPulse,
          tint: colors.error,
          title: "Recuperación",
          value: hrv ? `${hrv.value}` : "—",
          detail: "ms de variabilidad",
          serie: serieSalud("hrvMs"),
          puntos: puntosSalud("hrvMs"),
          formato: (valor: number) => `${Math.round(valor)} ms`,
          ruta: "/salud/recuperacion",
        });

      case "condicion":
        return metricaSimple({
          grande,
          icon: ActivityIcon,
          tint: colors.champan,
          title: "Condición",
          value: vo2 ? `${vo2.value}` : "—",
          detail: "VO₂ máx",
          serie: serieSalud("vo2max"),
          puntos: puntosSalud("vo2max"),
          formato: (valor: number) => `${valor}`,
          ruta: "/salud/condicion",
        });

      default:
        return null;
    }

    /** Métrica de una sola serie: el mismo molde para las cinco del reloj. */
    function metricaSimple(props: {
      grande: boolean;
      icon: typeof Flame;
      tint: string;
      title: string;
      value: string;
      detail: string;
      serie: number[];
      puntos: Array<{ date: string; value: number | null }>;
      formato: (valor: number) => string;
      ruta: string;
    }): React.ReactNode {
      if (!props.grande) {
        return chico({
          icon: props.icon,
          tint: props.tint,
          title: props.title,
          value: props.value,
          detail: props.detail,
          serie: props.serie,
          onPress: () => navegar(props.ruta),
        });
      }

      return (
        <PanelGrande
          icon={props.icon}
          tint={props.tint}
          title={props.title}
          value={props.value}
          detail={props.detail}
          onPress={() => navegar(props.ruta)}
        >
          <ChartBoundary label="La tendencia no se pudo dibujar.">
            <LineChart points={props.puntos} color={props.tint} format={props.formato} />
          </ChartBoundary>
        </PanelGrande>
      );
    }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    hero: {
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.xl,
      gap: spacing.xs,
    },
    heroHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    heroTitle: { fontFamily: fonts.sansBold, ...typeScale.heading, color: colors.marfil },
    heroPista: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosaLight },
    heroCaption: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    heroBody: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      marginTop: spacing.md,
    },
    leyendas: { flex: 1, gap: spacing.md },
    leyenda: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pressed: { opacity: 0.85 },
    leyendaTexto: { flex: 1 },
    leyendaValor: { fontFamily: fonts.sansBold, ...typeScale.subheading, color: colors.marfil },
    leyendaLabel: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: withAlpha(colors.paloRosa, 0.9),
    },
    extras: {
      flexDirection: "row",
      gap: spacing.lg,
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
    },
    perfil: {
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.xl,
      gap: spacing.xs,
      alignItems: "stretch",
    },
    glidepathLink: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.bodySm,
      color: colors.champan,
      marginTop: spacing.md,
    },
    panelNota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    filaSemana: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 4,
    },
    filaSemanaDia: {
      width: 52,
      fontFamily: fonts.sansMedium,
      ...typeScale.bodySm,
      color: colors.paloRosaLight,
      fontVariant: ["tabular-nums"],
    },
    filaSemanaGrupo: {
      flex: 1,
      fontFamily: fonts.sansMedium,
      ...typeScale.bodySm,
      color: colors.marfil,
    },
    filaSemanaEstado: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    filaSemanaHecha: { color: colors.champan, fontFamily: fonts.sansSemiBold },
    macros: { flexDirection: "row", gap: spacing.lg },
    macro: { gap: 2 },
    macroLabel: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.paloRosa },
    macroValor: { fontFamily: fonts.sansBold, ...typeScale.subheading, color: colors.marfil },
  });
