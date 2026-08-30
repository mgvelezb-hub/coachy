import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft, Minus, Plus, SkipForward, Timer, Watch } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { type SessionSyncInput, type SessionView, type WeekView } from "@/lib/api";
import {
  alCerrarSerieEnElReloj,
  drenarSeriesCerradas,
  enviarSesionAlReloj,
  estadoDelReloj,
} from "@/lib/reloj-nativo";
import {
  aplicarDelReloj,
  paraElReloj,
  type SerieCerradaEnReloj,
} from "@/lib/reloj-sesion";
import {
  ajustarDescanso,
  cerrarSerie,
  estadoInicial,
  formatoReloj,
  progreso,
  saltarDescanso,
  tick,
  volumenKg,
  type EjercicioVivo,
  type EstadoSesion,
} from "@/lib/sesion-viva";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";
import { clientIdFor } from "@/lib/training-client-id";
import { getCachedWeek, getPendingSession, upsertPendingSession } from "@/lib/training-db";
import { refreshPendingCount, syncAndNotify } from "@/lib/training-sync";

/**
 * Sesión en vivo — la pantalla que se usa con la barra en la mano.
 *
 * Lo que la separa del modo de captura de siempre: aquí no hay que buscar
 * dónde anotar. En qué serie vas y cuántas reps faltan están escritos en
 * grande y no se van nunca; cerrar una serie es un botón que ocupa media
 * pantalla; y el descanso arranca solo, porque el cronómetro que hay que
 * acordarse de iniciar es el que nadie inicia.
 *
 * El teléfono avisa con **háptica**, no con sonido: en un gimnasio con música
 * un pitido no se oye, y si se oye, se oye para todos. Una vibración corta al
 * cerrar la serie y una doble al terminar el descanso alcanzan, y funcionan
 * con el teléfono boca abajo en la banca.
 *
 * La pantalla se queda encendida mientras dura la sesión: entre serie y serie
 * pasan dos minutos, y desbloquear con las manos llenas de magnesio es
 * exactamente el tipo de fricción que hace que la gente deje de registrar.
 *
 * **Con Apple Watch**: la misma sesión se ve en la muñeca y la serie se puede
 * cerrar desde ahí, sin sacar el teléfono. Lo que el reloj cierra llega por
 * `WatchConnectivity` y entra aquí; lo que ya estaba cerrado en el teléfono no
 * se pisa nunca, porque el peso solo se teclea de este lado.
 *
 * Lo que el reloj **todavía no** hace es contar las repeticiones solo. Graba el
 * movimiento de cada serie y lo manda con ella, que es el dato con el que ese
 * conteo se va a poder calibrar; escribirlo antes daría umbrales inventados y
 * un contador que cuenta mal, que es peor que no tenerlo.
 */

/** Cada cuánto baja el descanso. Un segundo, como cualquier cronómetro. */
const TICK_MS = 1000;

/**
 * Lunes de esta semana, que es la llave del cache.
 *
 * Misma cuenta que en Rutinas: sin señal no hay a quién preguntarle qué semana
 * es, y el teléfono ya lo sabe.
 */
function mondayISO(): string {
  const ahora = new Date();
  const dia = ahora.getDay() || 7;
  ahora.setDate(ahora.getDate() - (dia - 1));
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${String(ahora.getDate()).padStart(2, "0")}`;
}

export default function EnVivoScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Mientras la sesión está abierta la pantalla no se apaga.
  useKeepAwake();

  const [sesion, setSesion] = useState<SessionView | null>(null);
  const [estado, setEstado] = useState<EstadoSesion | null>(null);
  const [draft, setDraft] = useState<SessionSyncInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reps, setReps] = useState(0);
  const [peso, setPeso] = useState<number | null>(null);

  // El intervalo se guarda en ref para poder apagarlo desde varios lugares sin
  // que el efecto se vuelva a montar en cada tick.
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hay un Apple Watch con la app puesta. Se resuelve una vez: emparejar un
  // reloj a media sesión no es un caso que valga la pena vigilar.
  const [conReloj] = useState(() => {
    const reloj = estadoDelReloj();
    return reloj.soportado && reloj.emparejado && reloj.appInstalada;
  });

  // Lo que llega del reloj puede llegar con la pantalla en segundo plano, o
  // entre renders. Estas referencias son para leer el estado de ahora sin
  // volver a montar la suscripción cada vez que cambia algo.
  const estadoRef = useRef<EstadoSesion | null>(null);
  const draftRef = useRef<SessionSyncInput | null>(null);
  const sesionRef = useRef<SessionView | null>(null);
  estadoRef.current = estado;
  draftRef.current = draft;
  sesionRef.current = sesion;

  const cargar = useCallback(async () => {
    try {
      const semana: WeekView | null = await getCachedWeek(mondayISO());
      const encontrada = semana?.sessions.find((entrada) => entrada.workoutId === workoutId) ?? null;
      if (!encontrada) {
        setError("Esa sesión no está en el teléfono. Ábrela una vez en Rutinas con señal.");
        return;
      }

      const pendiente = await getPendingSession(encontrada.workoutId);
      const guardadas = pendiente?.payload ?? {
        workoutId: encontrada.workoutId,
        completedAt: null,
        notes: null,
        sets: [],
        substitutions: [],
      };

      // Lo ya capturado manda: si alguien cerró tres series en el modo de
      // siempre y luego entra aquí, la sesión en vivo arranca en la cuarta.
      const ejercicios: EjercicioVivo[] = encontrada.exercises.map((ejercicio, indice) => ({
        indice,
        nombre: ejercicio.name,
        descansoSeg: ejercicio.restSeconds,
        series: ejercicio.sets.map((serie, setIndex) => {
          const capturada = guardadas.sets.find(
            (set) => set.clientId === clientIdFor(encontrada.workoutId, indice, setIndex),
          );
          return {
            objetivo: serie.reps,
            hechas: capturada?.reps ?? null,
            pesoKg: capturada?.weightKg ?? serie.weightKg ?? null,
            calentamiento: serie.warmup,
          };
        }),
      }));

      setSesion(encontrada);
      setDraft(guardadas);
      setEstado(estadoInicial(ejercicios));
    } catch {
      setError("No se pudo abrir tu sesión.");
    }
  }, [workoutId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al cambiar de serie, los campos se preparan con lo que pide el plan: reps
  // objetivo y el peso de la serie anterior. Escribir desde cero cada vez es
  // la fricción que hace que nadie registre.
  useEffect(() => {
    if (!estado || estado.terminada) return;
    const serie = estado.ejercicios[estado.ejercicioActual]?.series[estado.serieActual];
    if (!serie) return;
    setReps(serie.objetivo);
    setPeso(serie.pesoKg);
  }, [estado?.ejercicioActual, estado?.serieActual, estado?.terminada]);

  // El reloj del descanso.
  useEffect(() => {
    if (!estado || estado.descansoRestante === null) {
      if (intervalo.current) {
        clearInterval(intervalo.current);
        intervalo.current = null;
      }
      return;
    }

    if (intervalo.current) return;

    intervalo.current = setInterval(() => {
      setEstado((actual) => {
        if (!actual) return actual;
        const { estado: siguiente, termino } = tick(actual);
        if (termino) {
          // Doble golpe al terminar: distinto del de cerrar serie, para que se
          // distingan sin mirar la pantalla.
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return siguiente;
      });
    }, TICK_MS);

    return () => {
      if (intervalo.current) {
        clearInterval(intervalo.current);
        intervalo.current = null;
      }
    };
  }, [estado?.descansoRestante === null]);

  const persistir = useCallback(async (siguiente: SessionSyncInput) => {
    setDraft(siguiente);
    await upsertPendingSession(siguiente.workoutId, siguiente);
    await refreshPendingCount();
    void syncAndNotify();
  }, []);

  /**
   * Manda a la muñeca el estado de la sesión.
   *
   * Depende de `estado.ejercicios` y no de `estado`: durante el descanso el
   * estado cambia cada segundo, y mandar el espejo entero una vez por segundo
   * sería gastar batería del reloj para no decirle nada nuevo. La lista de
   * ejercicios solo cambia cuando una serie se cierra, que es justo cuando el
   * reloj necesita enterarse.
   */
  useEffect(() => {
    if (!conReloj || !sesion || !estado) return;
    enviarSesionAlReloj(paraElReloj(sesion.workoutId, sesion.muscleGroup, estado));
  }, [conReloj, sesion?.workoutId, estado?.ejercicios]);

  /**
   * Recoge las series que se cerraron desde la muñeca.
   *
   * El teléfono manda sobre el reloj en los conflictos —eso lo resuelve
   * `aplicarDelReloj`— y aquí solo se escribe lo que de verdad se aplicó: meter
   * en el borrador una serie que la pantalla descartó dejaría la base local
   * diciendo algo distinto de lo que se ve.
   */
  const recogerDelReloj = useCallback(async () => {
    const actual = estadoRef.current;
    const borrador = draftRef.current;
    const abierta = sesionRef.current;
    if (!actual || !borrador || !abierta) return;

    const cerradas = drenarSeriesCerradas<SerieCerradaEnReloj>();
    if (cerradas.length === 0) return;

    const { estado: siguiente, aplicadas } = aplicarDelReloj(actual, cerradas, abierta.workoutId);
    if (aplicadas.length === 0) return;

    setEstado(siguiente);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const nuevos = aplicadas.map((cerrada) => {
      const ejercicio = siguiente.ejercicios[cerrada.ejercicioIndice]!;
      const serie = ejercicio.series[cerrada.serieIndice]!;
      return {
        clientId: clientIdFor(abierta.workoutId, cerrada.ejercicioIndice, cerrada.serieIndice),
        exerciseId: abierta.exercises[cerrada.ejercicioIndice]?.exerciseId ?? null,
        exerciseName: ejercicio.nombre,
        setIndex: cerrada.serieIndice,
        targetReps: serie.objetivo,
        reps: cerrada.reps,
        weightKg: serie.pesoKg,
        rpe: null,
        warmup: serie.calentamiento,
        performedAt: cerrada.cerradaEn,
      };
    });

    const escritos = new Set(nuevos.map((set) => set.clientId));
    await persistir({
      ...borrador,
      sets: [...borrador.sets.filter((set) => !escritos.has(set.clientId)), ...nuevos],
    });
  }, [persistir]);

  /**
   * Cuándo se recoge: al abrir, cuando el reloj avisa, y al volver del segundo
   * plano. Lo último importa porque iOS entrega lo que el reloj mandó aunque la
   * app esté dormida, y ese aviso puede llegar sin nadie escuchando.
   */
  useEffect(() => {
    if (!conReloj) return;

    void recogerDelReloj();

    const suscripcion = alCerrarSerieEnElReloj(() => void recogerDelReloj());
    const appState = AppState.addEventListener("change", (siguiente) => {
      if (siguiente === "active") void recogerDelReloj();
    });

    return () => {
      suscripcion?.remove();
      appState.remove();
    };
  }, [conReloj, recogerDelReloj]);

  function marcarSerie() {
    if (!estado || !draft || !sesion || estado.terminada) return;

    const ejercicioIndex = estado.ejercicioActual;
    const setIndex = estado.serieActual;
    const ejercicio = estado.ejercicios[ejercicioIndex];
    const serie = ejercicio?.series[setIndex];
    if (!ejercicio || !serie) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { estado: siguiente } = cerrarSerie(estado, { reps, pesoKg: peso });
    setEstado(siguiente);

    const clientId = clientIdFor(sesion.workoutId, ejercicioIndex, setIndex);
    const plantilla = sesion.exercises[ejercicioIndex];

    void persistir({
      ...draft,
      sets: [
        ...draft.sets.filter((set) => set.clientId !== clientId),
        {
          clientId,
          exerciseId: plantilla?.exerciseId ?? null,
          exerciseName: ejercicio.nombre,
          setIndex,
          targetReps: serie.objetivo,
          reps,
          weightKg: peso,
          rpe: null,
          warmup: serie.calentamiento,
          performedAt: new Date().toISOString(),
        },
      ],
    });
  }

  async function cerrarSesion() {
    if (!draft) return;
    await persistir({ ...draft, completedAt: new Date().toISOString() });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/rutinas");
  }

  if (error) return <ErrorState message={error} onRetry={() => void cargar()} />;
  if (!estado || !sesion) return <LoadingState label="Preparando tu sesión..." />;

  const avance = progreso(estado);
  const ejercicio = estado.ejercicios[estado.ejercicioActual];
  const descansando = estado.descansoRestante !== null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.barra}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.salir}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.salirTexto}>Salir</Text>
        </Pressable>
        <View style={styles.barraDerecha}>
          {conReloj ? (
            <View style={styles.relojChip}>
              <Watch size={13} color={colors.champan} strokeWidth={2} />
              <Text style={styles.relojChipTexto}>Reloj</Text>
            </View>
          ) : null}
          <Text style={styles.progresoTexto}>
            {avance.hechas} de {avance.total} series · {volumenKg(estado)} kg
          </Text>
        </View>
      </View>

      <View style={styles.barraProgreso}>
        <View
          style={[
            styles.barraLlena,
            { width: `${avance.total === 0 ? 0 : (avance.hechas / avance.total) * 100}%` },
          ]}
        />
      </View>

      {estado.terminada ? (
        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={styles.tituloFin}>Sesión completa</Text>
          <Text style={styles.subtituloFin}>
            {avance.total} series · {volumenKg(estado)} kg levantados. Ya quedó guardada en tu
            teléfono; se sube sola cuando haya señal.
          </Text>
          <Pressable onPress={cerrarSesion} style={styles.botonPrincipal}>
            <Check size={22} color={colors.pergamino} strokeWidth={2.5} />
            <Text style={styles.botonPrincipalTexto}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={styles.ejercicioPaso}>
            Ejercicio {estado.ejercicioActual + 1} de {estado.ejercicios.length}
          </Text>
          <Text style={styles.ejercicioNombre}>{ejercicio?.nombre}</Text>

          <View style={styles.serieCaja}>
            <Text style={styles.serieEtiqueta}>
              Serie {estado.serieActual + 1} de {ejercicio?.series.length}
              {ejercicio?.series[estado.serieActual]?.calentamiento ? " · calentamiento" : ""}
            </Text>

            <View style={styles.campos}>
              <Campo
                etiqueta="Repeticiones"
                valor={`${reps}`}
                onMenos={() => setReps((valor) => Math.max(0, valor - 1))}
                onMas={() => setReps((valor) => valor + 1)}
              />
              <Campo
                etiqueta="Kilos"
                valor={peso === null ? "—" : `${peso}`}
                onMenos={() => setPeso((valor) => Math.max(0, (valor ?? 0) - 2.5))}
                onMas={() => setPeso((valor) => (valor ?? 0) + 2.5)}
              />
            </View>
          </View>

          {descansando ? (
            <View style={styles.descanso}>
              <Timer size={20} color={colors.champan} strokeWidth={2} />
              <Text style={styles.descansoReloj}>{formatoReloj(estado.descansoRestante ?? 0)}</Text>
              <Text style={styles.descansoTexto}>de descanso</Text>

              <View style={styles.descansoBotones}>
                <Pressable
                  onPress={() => setEstado((actual) => (actual ? ajustarDescanso(actual, 30) : actual))}
                  style={styles.botonSecundario}
                >
                  <Plus size={16} color={colors.marfil} strokeWidth={2} />
                  <Text style={styles.botonSecundarioTexto}>30 s</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEstado((actual) => (actual ? saltarDescanso(actual) : actual))}
                  style={styles.botonSecundario}
                >
                  <SkipForward size={16} color={colors.marfil} strokeWidth={2} />
                  <Text style={styles.botonSecundarioTexto}>Ya estoy</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={marcarSerie} style={styles.botonPrincipal}>
              <Check size={26} color={colors.pergamino} strokeWidth={2.5} />
              <Text style={styles.botonPrincipalTexto}>Serie hecha</Text>
            </Pressable>
          )}

          <View style={styles.lista}>
            {ejercicio?.series.map((serie, index) => (
              <View
                key={index}
                style={[
                  styles.listaFila,
                  index === estado.serieActual && styles.listaFilaActual,
                ]}
              >
                <Text style={styles.listaTexto}>
                  Serie {index + 1}
                  {serie.calentamiento ? " · calentamiento" : ""}
                </Text>
                <Text style={styles.listaValor}>
                  {serie.hechas === null
                    ? `${serie.objetivo} reps`
                    : `${serie.hechas} × ${serie.pesoKg ?? "—"} kg`}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.nota}>
            {conReloj
              ? "Esta misma serie está en tu reloj y la puedes cerrar desde ahí. Las repeticiones todavía las cuentas tú: el reloj está grabando el movimiento de cada serie para poder contarlas solo más adelante."
              : "Las repeticiones las cuentas tú. Con un Apple Watch con Holy Gains puesto, la serie se cierra desde la muñeca sin sacar el teléfono."}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Campo({
  etiqueta,
  valor,
  onMenos,
  onMas,
}: {
  etiqueta: string;
  valor: string;
  onMenos: () => void;
  onMas: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      <View style={styles.campoFila}>
        <Pressable onPress={onMenos} hitSlop={8} style={styles.campoBoton}>
          <Minus size={20} color={colors.marfil} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.campoValor}>{valor}</Text>
        <Pressable onPress={onMas} hitSlop={8} style={styles.campoBoton}>
          <Plus size={20} color={colors.marfil} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    barra: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    salir: { flexDirection: "row", alignItems: "center", gap: 2 },
    salirTexto: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    progresoTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    barraDerecha: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    relojChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: withAlpha(colors.champan, 0.14),
    },
    relojChipTexto: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.champan },
    barraProgreso: {
      height: 4,
      backgroundColor: withAlpha(colors.paloRosa, 0.15),
      marginHorizontal: spacing.lg,
      borderRadius: radius.full,
      overflow: "hidden",
    },
    barraLlena: { height: 4, backgroundColor: colors.champan },
    contenido: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.huge },
    ejercicioPaso: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.label,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.paloRosa,
    },
    ejercicioNombre: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    serieCaja: {
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    serieEtiqueta: { fontFamily: fonts.sansSemiBold, ...typeScale.heading, color: colors.champan },
    campos: { flexDirection: "row", gap: spacing.md },
    campo: { flex: 1, gap: spacing.xs },
    campoEtiqueta: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    campoFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    campoBoton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(colors.paloRosa, 0.14),
    },
    campoValor: {
      fontFamily: fonts.sansBold,
      ...typeScale.display,
      color: colors.marfil,
      minWidth: 70,
      textAlign: "center",
    },
    botonPrincipal: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.guinda,
      borderWidth: 1,
      borderColor: colors.guindaLight,
      borderRadius: radius.xxl,
      paddingVertical: spacing.xl,
    },
    botonPrincipalTexto: {
      fontFamily: fonts.sansBold,
      ...typeScale.heading,
      color: colors.pergamino,
    },
    descanso: {
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderColor: withAlpha(colors.champan, 0.35),
      backgroundColor: withAlpha(colors.champan, 0.1),
      paddingVertical: spacing.xl,
    },
    descansoReloj: {
      fontFamily: fonts.sansBold,
      ...typeScale.hero,
      color: colors.champan,
    },
    descansoTexto: { fontFamily: fonts.sans, ...typeScale.body, color: colors.paloRosa },
    descansoBotones: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
    botonSecundario: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    botonSecundarioTexto: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.marfil },
    lista: { gap: spacing.xs },
    listaFila: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
    },
    listaFilaActual: { backgroundColor: withAlpha(colors.champan, 0.12) },
    listaTexto: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    listaValor: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.marfil },
    nota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
    tituloFin: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    subtituloFin: { fontFamily: fonts.sans, ...typeScale.body, color: colors.paloRosa },
  });
