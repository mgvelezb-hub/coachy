import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Check,
  ChevronLeft,
  HeartPulse,
  Minus,
  Plus,
  SkipForward,
  Timer,
  Watch,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import {
  type ExerciseAlternative,
  type SessionSyncInput,
  type SessionView,
  type WeekView,
} from "@/lib/api";
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
  cerrarDescanso,
  cerrarSerie,
  descansoTermino,
  editarSerie,
  estadoInicial,
  formatoReloj,
  progreso,
  restanteSeg,
  saltarDescanso,
  volumenKg,
  type EjercicioVivo,
  type EstadoSesion,
} from "@/lib/sesion-viva";
import {
  aKilos,
  aUnidad,
  ajustaPeso,
  formatoPeso,
  pasosDe,
  type UnidadDePeso,
} from "@/lib/peso";
import {
  guardaPreferenciaDePeso,
  leePreferenciaDePeso,
} from "@/lib/preferencias-sesion";
import {
  guardaSesionEnCurso,
  leeSesionEnCurso,
  olvidaSesionEnCurso,
} from "@/lib/sesion-en-curso";
import { pulsoEntre, type PulsoDeTramo } from "@/lib/health";
import { fonts, radius, spacing, type as typeScale, withAlpha, type Palette } from "@/lib/theme";
import { clientIdFor, exercisePrefix } from "@/lib/training-client-id";
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

  // Unidad y salto de los botones ±. Se leen del teléfono al abrir: cambian
  // con el gimnasio (discos en libras en uno, en kilos en otro) y no valen un
  // viaje al servidor a media serie.
  const [unidad, setUnidad] = useState<UnidadDePeso>("kg");
  const [paso, setPaso] = useState(2.5);

  // La captura manual: `null` = cerrada. Con `serie` puesta se está corrigiendo
  // una serie YA cerrada; sin ella, se está tecleando la que sigue.
  const [capturando, setCapturando] = useState<
    { campo: "reps" | "peso"; serie: { ejercicio: number; serie: number } | null } | null
  >(null);
  const [borrador, setBorrador] = useState("");

  // El reloj de pared. El descanso se calcula contra ÉL y no contra un
  // contador que se congela cuando iOS suspende la app.
  const [ahora, setAhora] = useState(() => Date.now());

  // El intervalo se guarda en ref para poder apagarlo desde varios lugares sin
  // que el efecto se vuelva a montar en cada tick.
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Pulso por serie, leído del reloj al cerrarla.
   *
   * La llave es `ejercicio:serie` para que la retro quede pegada a la serie
   * que la produjo y no a un promedio de la sesión, que no dice si la cuarta
   * costó más que la primera.
   */
  const [pulsos, setPulsos] = useState<Record<string, PulsoDeTramo>>({});
  const [cambiando, setCambiando] = useState(false);
  const inicioDeSerie = useRef<Date>(new Date());

  // Hay un Apple Watch con la app puesta.
  //
  // Se vuelve a revisar al volver del fondo, y no una sola vez al montar: el
  // reloj puede tardar en aparecer (la app del reloj se está instalando, el
  // reloj estaba fuera de alcance, WatchConnectivity todavía no activaba). Con
  // la comprobación única, ese arranque en frío dejaba la sesión SIN mandar
  // nada a la muñeca durante todo el entrenamiento, y el reloj se veía muerto.
  const [reloj, setReloj] = useState(() => estadoDelReloj());
  const conReloj = reloj.soportado && reloj.emparejado && reloj.appInstalada;

  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (siguiente) => {
      if (siguiente === "active") setReloj(estadoDelReloj());
    });
    // Y una revisión más al abrir: la activación de la sesión es asíncrona y
    // suele completarse justo después del primer render.
    const tarde = setTimeout(() => setReloj(estadoDelReloj()), 2000);

    return () => {
      suscripcion.remove();
      clearTimeout(tarde);
    };
  }, []);

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
        alternativas: ejercicio.alternatives,
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

      const base = estadoInicial(ejercicios);

      // Volver del video de la técnica no puede reiniciar la sesión: se
      // recupera dónde ibas y el descanso que estaba corriendo. Si el
      // descanso ya venció mientras estabas afuera, entra vencido y la
      // pantalla lo apaga en el primer render, que es lo correcto.
      const enCurso = await leeSesionEnCurso(encontrada.workoutId);
      if (enCurso && !base.terminada) {
        const ejercicio = ejercicios[enCurso.ejercicioActual];
        const serieValida = ejercicio?.series[enCurso.serieActual] !== undefined;
        setEstado(
          serieValida
            ? {
                ...base,
                ejercicioActual: enCurso.ejercicioActual,
                serieActual: enCurso.serieActual,
                descansoHasta: enCurso.descansoHasta,
              }
            : base,
        );
        if (serieValida) {
          setReps(enCurso.reps);
          setPeso(enCurso.pesoKg);
        }
      } else {
        setEstado(base);
      }
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
  //
  // El intervalo NO descuenta nada: solo empuja la hora actual para que la
  // pantalla se vuelva a pintar. Cuánto falta sale siempre de la hora de
  // término (`descansoHasta`) contra el reloj de pared, así que contestar un
  // mensaje a media serie —con iOS congelando los timers— ya no deja el
  // descanso parado en el segundo en que se salió.
  useEffect(() => {
    if (!estado || estado.descansoHasta === null) {
      if (intervalo.current) {
        clearInterval(intervalo.current);
        intervalo.current = null;
      }
      return;
    }

    if (intervalo.current) return;

    intervalo.current = setInterval(() => setAhora(Date.now()), TICK_MS);

    return () => {
      if (intervalo.current) {
        clearInterval(intervalo.current);
        intervalo.current = null;
      }
    };
  }, [estado?.descansoHasta === null]);

  // Al volver de otra app —el video de la técnica, un mensaje— la hora se
  // pone al día de inmediato, sin esperar el siguiente tick.
  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (siguiente) => {
      if (siguiente === "active") setAhora(Date.now());
    });
    return () => suscripcion.remove();
  }, []);

  // El aviso de "se acabó el descanso" se dispara una sola vez, cuando la
  // hora de término ya pasó. Vive aquí y no en el intervalo porque también
  // tiene que dispararse al volver de segundo plano con el descanso vencido.
  useEffect(() => {
    if (!estado || !descansoTermino(estado, ahora)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEstado((actual) => (actual ? cerrarDescanso(actual) : actual));
  }, [estado?.descansoHasta, ahora]);

  // El cursor se guarda en cada movimiento: es lo que hace que salir a ver un
  // video y volver caiga exactamente donde estabas.
  useEffect(() => {
    if (!estado || !sesion || estado.terminada) return;
    void guardaSesionEnCurso({
      workoutId: sesion.workoutId,
      ejercicioActual: estado.ejercicioActual,
      serieActual: estado.serieActual,
      descansoHasta: estado.descansoHasta,
      reps,
      pesoKg: peso,
    });
  }, [
    sesion?.workoutId,
    estado?.ejercicioActual,
    estado?.serieActual,
    estado?.descansoHasta,
    estado?.terminada,
    reps,
    peso,
  ]);

  // La preferencia de captura (kg/lb y salto) se lee una vez al abrir.
  useEffect(() => {
    void leePreferenciaDePeso().then((preferencia) => {
      setUnidad(preferencia.unidad);
      setPaso(preferencia.paso);
    });
  }, []);

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

    // El pulso de la serie: desde que terminó el descanso anterior (o desde
    // que abrió la pantalla, en la primera) hasta ahora. Se pide al cerrar,
    // no durante: la app lee lo que el reloj ya escribió en Salud, no hay
    // canal en vivo sin una app en la muñeca.
    const desde = inicioDeSerie.current;
    const hasta = new Date();
    inicioDeSerie.current = hasta;

    const clave = `${ejercicioIndex}:${setIndex}`;
    void pulsoEntre(desde, hasta).then((pulso) => {
      if (pulso.promedio === null) return;
      setPulsos((previos) => ({ ...previos, [clave]: pulso }));
    });

    const { estado: siguiente } = cerrarSerie(estado, { reps, pesoKg: peso }, Date.now());
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

  /**
   * Cambiar de ejercicio a media sesión.
   *
   * Es el caso que pasa siempre: la máquina está ocupada y hay que resolver
   * ahora, no salir a Rutinas a reacomodar el plan. Solo se ofrecen
   * alternativas del mismo grupo muscular — cambiar de máquina no es cambiar
   * de músculo.
   *
   * Lo capturado en ese lugar se va con la máquina anterior: la carga de la
   * prensa no es la del hack squat, y conservarla mentiría en la progresión.
   */
  function sustituir(alternativa: ExerciseAlternative) {
    if (!estado || !draft || !sesion) return;

    const indice = estado.ejercicioActual;
    const ejercicios = estado.ejercicios.map((ejercicio, posicion) =>
      posicion === indice
        ? {
            ...ejercicio,
            nombre: alternativa.name,
            series: ejercicio.series.map((serie) => ({ ...serie, hechas: null, pesoKg: null })),
          }
        : ejercicio,
    );

    setEstado({ ...estado, ejercicios, serieActual: 0, descansoHasta: null });
    setCambiando(false);

    const prefijo = exercisePrefix(sesion.workoutId, indice);
    void persistir({
      ...draft,
      sets: draft.sets.filter((serie) => !serie.clientId.startsWith(prefijo)),
      substitutions: [
        ...draft.substitutions.filter((cambio) => cambio.exerciseIndex !== indice),
        { exerciseIndex: indice, exerciseId: alternativa.exerciseId },
      ],
    });
  }

  /**
   * Guarda una serie YA cerrada que se corrigió (los kilos que faltaban, las
   * reps que salieron distintas).
   *
   * Cerrar una serie sin peso no tenía vuelta atrás: quedaba capturada en
   * blanco y la única salida era rehacer la sesión. Aquí se corrige sin mover
   * dónde vas ni tocar el descanso en curso.
   */
  function corregirSerie(
    ejercicioIndice: number,
    serieIndice: number,
    valores: { reps: number; pesoKg: number | null },
  ) {
    if (!estado || !draft || !sesion) return;

    const ejercicio = estado.ejercicios[ejercicioIndice];
    const serie = ejercicio?.series[serieIndice];
    if (!ejercicio || !serie) return;

    setEstado(editarSerie(estado, ejercicioIndice, serieIndice, valores));

    const clientId = clientIdFor(sesion.workoutId, ejercicioIndice, serieIndice);
    const plantilla = sesion.exercises[ejercicioIndice];
    const previa = draft.sets.find((set) => set.clientId === clientId);

    void persistir({
      ...draft,
      sets: [
        ...draft.sets.filter((set) => set.clientId !== clientId),
        {
          clientId,
          exerciseId: plantilla?.exerciseId ?? null,
          exerciseName: ejercicio.nombre,
          setIndex: serieIndice,
          targetReps: serie.objetivo,
          reps: valores.reps,
          weightKg: valores.pesoKg,
          rpe: null,
          warmup: serie.calentamiento,
          // La hora en que se hizo es la original: corregir el peso no mueve
          // cuándo se levantó.
          performedAt: previa?.performedAt ?? new Date().toISOString(),
        },
      ],
    });
  }

  /** Aplica lo tecleado en el campo manual y cierra el teclado. */
  function aplicarCaptura() {
    if (!capturando) return;

    const numero = Number(borrador.replace(",", "."));
    if (!Number.isFinite(numero) || numero < 0) {
      setCapturando(null);
      return;
    }

    const objetivo = capturando.serie;
    const esPeso = capturando.campo === "peso";
    // Lo tecleado está en la unidad que se está viendo; a kilos antes de
    // guardar, siempre.
    const valor = esPeso ? aKilos(numero, unidad) : Math.round(numero);

    if (objetivo === null) {
      if (esPeso) setPeso(valor);
      else setReps(valor);
    } else {
      const serie = estado?.ejercicios[objetivo.ejercicio]?.series[objetivo.serie];
      corregirSerie(objetivo.ejercicio, objetivo.serie, {
        reps: esPeso ? (serie?.hechas ?? serie?.objetivo ?? 0) : valor,
        pesoKg: esPeso ? valor : (serie?.pesoKg ?? null),
      });
    }

    setCapturando(null);
  }

  /** Abre el teclado para un campo, con el valor de hoy ya escrito. */
  function abrirCaptura(
    campo: "reps" | "peso",
    objetivo: { ejercicio: number; serie: number } | null,
  ) {
    const serie = objetivo ? estado?.ejercicios[objetivo.ejercicio]?.series[objetivo.serie] : null;

    const actual =
      campo === "reps"
        ? objetivo
          ? (serie?.hechas ?? serie?.objetivo ?? 0)
          : reps
        : objetivo
          ? serie?.pesoKg ?? null
          : peso;

    setBorrador(
      actual === null || actual === undefined
        ? ""
        : campo === "peso"
          ? formatoPeso(aUnidad(actual, unidad))
          : String(actual),
    );
    setCapturando({ campo, serie: objetivo });
  }

  function cambiarUnidad(siguiente: UnidadDePeso) {
    // El paso se lleva a uno que exista en la unidad nueva: 2.5 lb no es ni un
    // disco chico, y 10 kg no es un ajuste, es otro ejercicio.
    const opciones = pasosDe(siguiente);
    const nuevoPaso = opciones.includes(paso) ? paso : (opciones[2] ?? opciones[0]!);
    setUnidad(siguiente);
    setPaso(nuevoPaso);
    void guardaPreferenciaDePeso({ unidad: siguiente, paso: nuevoPaso });
  }

  function cambiarPaso(siguiente: number) {
    setPaso(siguiente);
    void guardaPreferenciaDePeso({ unidad, paso: siguiente });
  }

  async function cerrarSesion() {
    if (!draft) return;
    await persistir({ ...draft, completedAt: new Date().toISOString() });
    await olvidaSesionEnCurso();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/rutinas");
  }

  if (error) return <ErrorState message={error} onRetry={() => void cargar()} />;
  if (!estado || !sesion) return <LoadingState label="Preparando tu sesión..." />;

  const avance = progreso(estado);
  const ejercicio = estado.ejercicios[estado.ejercicioActual];
  const restante = restanteSeg(estado, ahora);
  const descansando = restante !== null && restante > 0;

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
            {/* El plan es una referencia, no un campo: lo que se captura son
                las reps que DE VERDAD salieron. Si te quedas corto, la semana
                que viene el plan arranca en tu número, no en el que no
                alcanzaste. */}
            <Text style={styles.seriePlan}>
              El plan pide {ejercicio?.series[estado.serieActual]?.objetivo ?? 0} reps · anota las
              que hiciste
            </Text>

            <View style={styles.campos}>
              <Campo
                etiqueta="Reps que hiciste"
                valor={`${reps}`}
                onMenos={() => setReps((valor) => Math.max(0, valor - 1))}
                onMas={() => setReps((valor) => valor + 1)}
                onTocarValor={() => abrirCaptura("reps", null)}
              />
              <Campo
                etiqueta={unidad === "kg" ? "Kilos" : "Libras"}
                valor={peso === null ? "—" : formatoPeso(aUnidad(peso, unidad))}
                onMenos={() => setPeso((valor) => ajustaPeso(valor, -paso, unidad))}
                onMas={() => setPeso((valor) => ajustaPeso(valor, paso, unidad))}
                onTocarValor={() => abrirCaptura("peso", null)}
              />
            </View>

            {/* El salto de los botones y la unidad, a un toque: la barra sube
                de 2.5 en 2.5 pero la mancuerna de 0.5, y hay gimnasios donde
                los discos están marcados en libras. Tocar el número teclea la
                cantidad exacta, que es lo más rápido cuando el salto es grande. */}
            <View style={styles.ajustes}>
              <View style={styles.ajusteGrupo}>
                {pasosDe(unidad).map((opcion) => (
                  <Pressable
                    key={opcion}
                    onPress={() => cambiarPaso(opcion)}
                    style={[styles.ajusteChip, paso === opcion && styles.ajusteChipOn]}
                  >
                    <Text style={[styles.ajusteTexto, paso === opcion && styles.ajusteTextoOn]}>
                      ±{formatoPeso(opcion)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.ajusteGrupo}>
                {(["kg", "lb"] as const).map((opcion) => (
                  <Pressable
                    key={opcion}
                    onPress={() => cambiarUnidad(opcion)}
                    style={[styles.ajusteChip, unidad === opcion && styles.ajusteChipOn]}
                  >
                    <Text style={[styles.ajusteTexto, unidad === opcion && styles.ajusteTextoOn]}>
                      {opcion}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {descansando ? (
            <View style={styles.descanso}>
              <Timer size={20} color={colors.champan} strokeWidth={2} />
              <Text style={styles.descansoReloj}>{formatoReloj(restante ?? 0)}</Text>
              <Text style={styles.descansoTexto}>de descanso</Text>

              <View style={styles.descansoBotones}>
                <Pressable
                  onPress={() =>
                    setEstado((actual) => (actual ? ajustarDescanso(actual, 30, Date.now()) : actual))
                  }
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

          {(ejercicio?.alternativas ?? []).length > 0 && (
            <View style={styles.cambiarCaja}>
              <Pressable onPress={() => setCambiando((valor) => !valor)} hitSlop={8}>
                <Text style={styles.cambiarEnlace}>
                  {cambiando ? "Dejar este ejercicio" : "¿Máquina ocupada? Cambiar ejercicio"}
                </Text>
              </Pressable>

              {cambiando &&
                (ejercicio?.alternativas ?? []).map((alternativa) => (
                  <Pressable
                    key={alternativa.exerciseId}
                    onPress={() => sustituir(alternativa)}
                    style={styles.alternativa}
                  >
                    <Text style={styles.alternativaNombre}>{alternativa.name}</Text>
                    <Text style={styles.alternativaNota}>mismo grupo muscular</Text>
                  </Pressable>
                ))}
            </View>
          )}

          <View style={styles.lista}>
            {ejercicio?.series.map((serie, index) => (
              <Pressable
                key={index}
                // Una serie ya cerrada se corrige tocándola: cerrar sin peso
                // dejaba el dato en blanco para siempre y la única salida era
                // rehacer la sesión.
                onPress={() =>
                  serie.hechas !== null &&
                  abrirCaptura("peso", { ejercicio: estado.ejercicioActual, serie: index })
                }
                disabled={serie.hechas === null}
                style={[
                  styles.listaFila,
                  index === estado.serieActual && styles.listaFilaActual,
                ]}
              >
                <Text style={styles.listaTexto}>
                  Serie {index + 1}
                  {serie.calentamiento ? " · calentamiento" : ""}
                </Text>
                <View style={styles.listaDerecha}>
                  <Text style={styles.listaValor}>
                    {serie.hechas === null
                      ? `${serie.objetivo} reps`
                      : `${serie.hechas} × ${
                          serie.pesoKg === null
                            ? "sin peso"
                            : `${formatoPeso(aUnidad(serie.pesoKg, unidad))} ${unidad}`
                        }`}
                  </Text>
                  {serie.hechas !== null && serie.pesoKg === null && (
                    <Text style={styles.listaCorregir}>anotar peso</Text>
                  )}
                  {(() => {
                    const pulso = pulsos[`${estado.ejercicioActual}:${index}`];
                    if (!pulso || pulso.promedio === null) return null;
                    return (
                      <View style={styles.listaPulso}>
                        <HeartPulse size={13} color={colors.error} strokeWidth={2} />
                        <Text style={styles.listaPulsoTexto}>{pulso.promedio}</Text>
                      </View>
                    );
                  })()}
                </View>
              </Pressable>
            ))}
          </View>

          <Text style={styles.nota}>
            {conReloj
              ? "Esta misma serie está en tu reloj y la puedes cerrar desde ahí. Abre Holy Gains en la muñeca para verla. Las repeticiones todavía las cuentas tú: el reloj está grabando el movimiento de cada serie para poder contarlas solo más adelante."
              : motivoSinReloj(reloj)}
          </Text>
        </ScrollView>
      )}

      {/* Teclado para la cantidad exacta: sirve para teclear el peso de la
          serie que viene y también para anotar el que faltó en una serie ya
          cerrada, tocándola en la lista. */}
      <Modal
        visible={capturando !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCapturando(null)}
      >
        <Pressable style={styles.tecladoFondo} onPress={() => setCapturando(null)}>
          <Pressable style={styles.tecladoCaja} onPress={() => {}}>
            <Text style={styles.tecladoTitulo}>
              {capturando?.campo === "reps" ? "Repeticiones" : unidad === "kg" ? "Kilos" : "Libras"}
            </Text>
            {capturando?.serie && (
              <Text style={styles.tecladoNota}>
                Corrigiendo la serie {capturando.serie.serie + 1} de {ejercicio?.nombre}.
              </Text>
            )}

            <TextInput
              value={borrador}
              onChangeText={setBorrador}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              style={styles.tecladoInput}
              onSubmitEditing={aplicarCaptura}
              returnKeyType="done"
            />

            <View style={styles.tecladoBotones}>
              <Pressable onPress={() => setCapturando(null)} style={styles.botonSecundario}>
                <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={aplicarCaptura} style={[styles.botonSecundario, { flex: 1 }]}>
                <Check size={16} color={colors.marfil} strokeWidth={2} />
                <Text style={styles.botonSecundarioTexto}>Guardar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Por qué no se está usando el reloj, en palabras.
 *
 * Antes se decía siempre lo mismo —"con un Apple Watch con Holy Gains…"— y
 * quien SÍ tenía el reloj puesto no sabía qué le faltaba. Decir cuál de las
 * tres cosas falla es lo que permite arreglarlo sin adivinar.
 */
function motivoSinReloj(reloj: ReturnType<typeof estadoDelReloj>): string {
  if (!reloj.soportado) {
    return "Las repeticiones las cuentas tú. Este dispositivo no habla con Apple Watch.";
  }
  if (!reloj.emparejado) {
    return "Las repeticiones las cuentas tú. Con un Apple Watch emparejado a este teléfono, la serie se cierra desde la muñeca sin sacar el teléfono.";
  }
  if (!reloj.appInstalada) {
    return "Tu reloj está emparejado pero no tiene Holy Gains instalado. Ábrelo desde la app Watch de tu iPhone (Apps disponibles → Holy Gains → Instalar) y vuelve a entrar aquí.";
  }
  return "Las repeticiones las cuentas tú.";
}

function Campo({
  etiqueta,
  valor,
  onMenos,
  onMas,
  onTocarValor,
}: {
  etiqueta: string;
  valor: string;
  onMenos: () => void;
  onMas: () => void;
  /** Tocar el número teclea la cantidad exacta, sin ir de paso en paso. */
  onTocarValor: () => void;
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
        <Pressable onPress={onTocarValor} hitSlop={8} style={styles.campoValorCaja}>
          <Text style={styles.campoValor}>{valor}</Text>
        </Pressable>
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
    seriePlan: {
      fontFamily: fonts.sans,
      ...typeScale.label,
      color: colors.pergaminoSoft,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    ajustes: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    ajusteGrupo: { flexDirection: "row", gap: 6 },
    ajusteChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      minHeight: 32,
      justifyContent: "center",
    },
    ajusteChipOn: { backgroundColor: colors.guinda, borderColor: colors.guindaLight },
    ajusteTexto: { fontFamily: fonts.sansMedium, ...typeScale.label, color: colors.marfil },
    ajusteTextoOn: { color: colors.pergamino },
    listaCorregir: { fontFamily: fonts.sans, ...typeScale.label, color: colors.champan },
    campoValorCaja: { minWidth: 96, alignItems: "center", justifyContent: "center", minHeight: 44 },
    tecladoFondo: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      padding: spacing.lg,
    },
    tecladoCaja: {
      backgroundColor: colors.cardBg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.lg,
      gap: spacing.md,
    },
    tecladoTitulo: { fontFamily: fonts.sansMedium, ...typeScale.subheading, color: colors.marfil },
    tecladoNota: { fontFamily: fonts.sans, ...typeScale.label, color: colors.pergaminoSoft },
    tecladoInput: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.title,
      color: colors.marfil,
      borderBottomWidth: 1,
      borderBottomColor: colors.champan,
      paddingVertical: spacing.sm,
      textAlign: "center",
    },
    tecladoBotones: { flexDirection: "row", gap: spacing.sm },
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
    cambiarCaja: { gap: spacing.sm },
    cambiarEnlace: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.champan },
    alternativa: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      gap: 2,
    },
    alternativaNombre: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.marfil },
    alternativaNota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
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
    listaDerecha: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    listaPulso: { flexDirection: "row", alignItems: "center", gap: 3 },
    listaPulsoTexto: {
      fontFamily: fonts.sansSemiBold,
      ...typeScale.bodySm,
      color: colors.paloRosa,
      fontVariant: ["tabular-nums"],
    },
    nota: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
    tituloFin: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    subtituloFin: { fontFamily: fonts.sans, ...typeScale.body, color: colors.paloRosa },
  });
