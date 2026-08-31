import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { Explicacion, TextoExplicativo } from "@/components/Explicacion";
import { ErrorState, LoadingState } from "@/components/States";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RegenerarMenu } from "@/components/RegenerarMenu";
import { SectionLabel } from "@/components/SectionLabel";
import { SeccionEntrenamiento } from "@/components/ajustes/SeccionEntrenamiento";
import { HorarioDeEntrenamiento } from "@/components/ajustes/HorarioDeEntrenamiento";
import { SeccionHorariosComida } from "@/components/ajustes/SeccionHorariosComida";
import { SeccionPuntoCero } from "@/components/ajustes/SeccionPuntoCero";
import { useTheme } from "@/context/theme";
import type { ThemePreference } from "@/context/theme";
import {
  ApiError,
  getActivities,
  getMe,
  getPuntoCero,
  patchCheckinSchedule,
  patchNutricion,
  patchPresupuesto,
  type PuntoCero,
  type MeResponse,
  type DietStyle,
} from "@/lib/api";
import {
  ESTILOS_DIETA,
  PRESUPUESTOS,
  SUPLEMENTOS,
  VENTANAS_AYUNO,
  avisoDeDieta,
} from "@/lib/nutricion";
import { estadoDelReloj } from "@/lib/reloj-nativo";
import { TIEMPOS_COCINA, listaDeAlimentos } from "@/lib/entrenamiento";
import {
  connectHealth,
  ensureCurrentPermissions,
  getHealthSummary,
  isHealthConnected,
  syncHealth,
  syncWorkouts,
  type HealthSummary,
} from "@/lib/health";
import {
  fonts,
  withAlpha,
  paletteChampan,
  paletteDark,
  paletteLight,
  radius,
  spacing,
  type Palette,
  type as typeScale,
} from "@/lib/theme";
import { countPendingSessions } from "@/lib/training-db";
import { DIAS, programarRecordatorio } from "@/lib/recordatorio";
import {
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  biometricsAvailable,
  biometricsEnabled,
  clearPin,
  hasPin,
  setBiometricsEnabled,
  setPin,
} from "@/lib/vault";
import { subscribePendingCount, syncAndNotify, type SyncResult } from "@/lib/training-sync";
import { countDownloadedVideos, purgeVideoDownloads } from "@/lib/video-downloads";
import { supabase } from "@/lib/supabase";

/**
 * Ajustes — fuera de tabs, empujada con back (igual que /objetivo).
 *
 * 4 bloques: apariencia (el selector de tema), perfil de solo lectura (viene
 * de `GET /api/v1/me`, no hay endpoint de edición todavía), estado de los
 * datos locales del modo gimnasio/biblioteca, y sesión (versión + logout).
 */

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; palette: Palette | null }> = [
  { value: "system", label: "Sistema", palette: null },
  { value: "light", label: "Claro", palette: paletteLight },
  { value: "dark", label: "Oscuro", palette: paletteDark },
  { value: "champan", label: "Champán", palette: paletteChampan },
];

function formatSyncResult(result: SyncResult): string {
  if (result.sent === 0 && result.failed === 0) {
    return result.pending === 0 ? "Ya estaba todo sincronizado." : "Sin conexión: sigue guardado en tu teléfono.";
  }
  const parts: string[] = [];
  if (result.sent > 0) parts.push(`${result.sent} ${result.sent === 1 ? "sesión subida" : "sesiones subidas"}`);
  if (result.failed > 0) parts.push(`${result.failed} sin poder subir`);
  if (result.prs.length > 0) parts.push(`¡PR en ${result.prs.join(", ")}!`);
  return parts.join(" · ");
}

/**
 * El detalle de una sección de Ajustes: `/ajustes/apariencia`,
 * `/ajustes/perfil`, `/ajustes/telefono`, `/ajustes/reloj`, `/ajustes/fotos`,
 * `/ajustes/sesion`.
 *
 * Las seis viven en la misma pantalla porque comparten el mismo estado
 * cargado —perfil, cola de sincronización, salud, bóveda— y partirlo en seis
 * archivos multiplicaría las mismas llamadas por seis. Lo que cambia por
 * sección es únicamente qué tarjeta se pinta.
 */
export const SECCIONES = {
  checkin: "Tu check-in",
  entrenamiento: "Tu entrenamiento",
  nutricion: "Nutrición",
  apariencia: "Apariencia",
  perfil: "Tu perfil",
  telefono: "Tu teléfono",
  reloj: "Tu reloj",
  fotos: "Tus fotos",
  sesion: "Sesión",
} as const;

export type Seccion = keyof typeof SECCIONES;

export default function AjustesDetalleScreen() {
  const { seccion } = useLocalSearchParams<{ seccion: string }>();
  const activa = (Object.keys(SECCIONES) as Seccion[]).find((clave) => clave === seccion) ?? null;
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [me, setMe] = useState<MeResponse | null>(null);
  // Desde qué check-in se compara todo. Vive aquí y no dentro de la tarjeta
  // porque la carga inicial de Ajustes ya hace una tanda de llamadas: una más
  // suelta desde el hijo dejaría la tarjeta parpadeando al abrir la sección.
  const [puntoCero, setPuntoCero] = useState<PuntoCero>(null);
  const [meError, setMeError] = useState<string | null>(null);

  // Emparejar un reloj o instalarle la app son cosas que se hacen fuera de
  // aquí; se lee una vez al abrir Ajustes y no se vigila.
  const [reloj] = useState(estadoDelReloj);

  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [videoCount, setVideoCount] = useState(0);
  const [deletingVideos, setDeletingVideos] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  // Fase N5 — "Tu reloj" (solo iOS: Android no tiene HealthKit, ver Fase Health Connect pendiente).
  const [healthConnected, setHealthConnected] = useState(false);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [activityCount, setActivityCount] = useState<number | null>(null);
  const [connectingHealth, setConnectingHealth] = useState(false);
  const [syncingHealth, setSyncingHealth] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setMeError(null);
    try {
      const response = await getMe();
      setMe(response);
    } catch (error) {
      setMeError(error instanceof ApiError ? error.message : "No se pudo cargar tu perfil");
    }

    // El punto cero va aparte y sin romper nada si falla: es una etiqueta de
    // "desde cuándo te comparas", no un dato sin el cual Ajustes no sirva.
    try {
      const respuesta = await getPuntoCero();
      setPuntoCero(respuesta.puntoCero);
    } catch {
      setPuntoCero(null);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const unsubscribe = subscribePendingCount(setPendingCount);
    void countPendingSessions().then(setPendingCount);
    return unsubscribe;
  }, []);

  const refreshVideoCount = useCallback(() => {
    setVideoCount(countDownloadedVideos());
  }, []);

  useEffect(() => {
    refreshVideoCount();
  }, [refreshVideoCount]);

  // Cierre de semana: el día y la hora que la persona elige, y el
  // recordatorio local que se programa con ellos.
  const [diaCierre, setDiaCierre] = useState<number | null>(null);
  const [horaCierre, setHoraCierre] = useState<number | null>(null);
  const [cierreMsg, setCierreMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setDiaCierre(me.profile.checkinWeekday);
    setHoraCierre(me.profile.checkinHour);
  }, [me]);

  async function guardarCierre(weekday: number | null, hour: number | null) {
    setDiaCierre(weekday);
    setHoraCierre(hour);
    setCierreMsg(null);
    try {
      await patchCheckinSchedule(weekday, hour);
      const programado = await programarRecordatorio(weekday, hour);
      setCierreMsg(
        weekday === null || hour === null
          ? "Sin recordatorio: nadie te va a avisar."
          : programado
            ? `Listo: te aviso los ${DIAS[weekday]} a las ${hour}:00.`
            : "Guardado, pero falta permiso de notificaciones para avisarte.",
      );
    } catch (error) {
      setCierreMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu día de cierre");
    }
  }

  // Presupuesto de despensa: cambia el catálogo con el que se arma el menú.
  const [presupuesto, setPresupuesto] = useState<"BAJO" | "MEDIO" | "ALTO" | null>(null);
  const [presupuestoMsg, setPresupuestoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (me?.profile) setPresupuesto(me.profile.budget);
  }, [me]);

  async function guardarPresupuesto(valor: "BAJO" | "MEDIO" | "ALTO") {
    setPresupuesto(valor);
    setPresupuestoMsg(null);
    try {
      await patchPresupuesto(valor);
      setPresupuestoMsg(
        "Guardado — regenera tu menú abajo para verlo hoy, o espera a tu siguiente check-in.",
      );
    } catch (error) {
      setPresupuestoMsg(
        error instanceof ApiError ? error.message : "No se pudo guardar tu presupuesto",
      );
    }
  }

  // Tiempo de cocina y alimentos: las preferencias que el motor sí usa al
  // armar el menú (el tope de minutos filtra el catálogo, los favoritos pesan
  // en la elección y los excluidos salen).
  const [tiempoCocina, setTiempoCocina] = useState<number | null>(null);
  const [favoritos, setFavoritos] = useState("");
  const [excluidos, setExcluidos] = useState("");
  const [alimentosMsg, setAlimentosMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setTiempoCocina(me.profile.maxPrepMin ?? null);
    setFavoritos((me.profile.favoriteFoods ?? []).join(", "));
    setExcluidos((me.profile.excludedFoods ?? []).join(", "));
  }, [me]);

  /**
   * Lo que la persona tiene en la alacena.
   *
   * Se pregunta qué TIENES, no qué deberías comprar: la app no recomienda
   * productos. Lo marcado entra al plan —el polvo como alimento del menú, la
   * creatina y el omega como pauta diaria— y lo no marcado no existe.
   */
  const [suplementos, setSuplementos] = useState<Array<"WHEY" | "CREATINA" | "OMEGA3">>([]);
  const [suplementosMsg, setSuplementosMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setSuplementos(
      ((me.profile.supplements ?? []) as Array<"WHEY" | "CREATINA" | "OMEGA3">).filter((valor) =>
        SUPLEMENTOS.some((opcion) => opcion.valor === valor),
      ),
    );
  }, [me]);

  async function alternarSuplemento(valor: "WHEY" | "CREATINA" | "OMEGA3") {
    const siguiente = suplementos.includes(valor)
      ? suplementos.filter((entrada) => entrada !== valor)
      : [...suplementos, valor];

    setSuplementos(siguiente);
    setSuplementosMsg(null);
    try {
      await patchNutricion({ supplements: siguiente });
      setSuplementosMsg(
        "Guardado — regenera tu menú abajo para verlo hoy, o espera a tu siguiente check-in.",
      );
    } catch (error) {
      setSuplementos(suplementos);
      setSuplementosMsg(
        error instanceof ApiError ? error.message : "No se pudo guardar tus suplementos",
      );
    }
  }

  async function guardarTiempoCocina(minutos: number | null) {
    setTiempoCocina(minutos);
    setAlimentosMsg(null);
    try {
      await patchNutricion({ maxPrepMin: minutos });
      setAlimentosMsg(
        minutos === null
          ? "Sin tope: el menú puede pedir cocinar en el momento."
          : "Listo. Lo que se cocina en lote sigue entrando: cuenta como calentar.",
      );
    } catch (error) {
      setAlimentosMsg(
        error instanceof ApiError ? error.message : "No se pudo guardar tu tiempo de cocina",
      );
    }
  }

  async function guardarAlimentos() {
    setAlimentosMsg(null);
    try {
      const guardado = await patchNutricion({
        favoriteFoods: listaDeAlimentos(favoritos),
        excludedFoods: listaDeAlimentos(excluidos),
      });
      setFavoritos(guardado.favoriteFoods.join(", "));
      setExcluidos(guardado.excludedFoods.join(", "));
      setAlimentosMsg(
        "Guardado — regenera tu menú abajo para verlo hoy, o espera a tu siguiente check-in.",
      );
    } catch (error) {
      setAlimentosMsg(
        error instanceof ApiError ? error.message : "No se pudieron guardar tus alimentos",
      );
    }
  }

  // Estilo de dieta y, si es ayuno, la ventana en la que sí se come.
  const [dieta, setDieta] = useState<DietStyle>("ESTANDAR");
  const [ventana, setVentana] = useState<{ inicio: number | null; fin: number | null }>({
    inicio: null,
    fin: null,
  });
  const [dietaMsg, setDietaMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.profile) return;
    setDieta(me.profile.dietStyle ?? "ESTANDAR");
    setVentana({
      inicio: me.profile.fastingStartHour ?? null,
      fin: me.profile.fastingEndHour ?? null,
    });
  }, [me]);

  async function guardarDieta(valor: DietStyle) {
    const anterior = dieta;
    setDieta(valor);
    setDietaMsg(null);
    try {
      await patchNutricion({ dietStyle: valor });
      setDietaMsg(
        "Guardado — regenera tu menú abajo para verlo hoy, o espera a tu siguiente check-in.",
      );
    } catch (error) {
      setDieta(anterior);
      setDietaMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu dieta");
    }
  }

  async function guardarVentana(inicio: number, fin: number) {
    const anterior = ventana;
    setVentana({ inicio, fin });
    setDietaMsg(null);
    try {
      await patchNutricion({ fastingStartHour: inicio, fastingEndHour: fin });
      setDietaMsg(`Listo: comes entre las ${inicio}:00 y las ${fin}:00.`);
    } catch (error) {
      setVentana(anterior);
      setDietaMsg(error instanceof ApiError ? error.message : "No se pudo guardar tu ventana");
    }
  }

  // Bóveda de fotos: clave propia del teléfono + biometría opcional.
  const [tieneClave, setTieneClave] = useState(false);
  const [biometria, setBiometria] = useState<"facial" | "huella" | null>(null);
  const [biometriaOn, setBiometriaOn] = useState(false);
  const [claveNueva, setClaveNueva] = useState("");
  const [claveMsg, setClaveMsg] = useState<string | null>(null);

  const loadVault = useCallback(async () => {
    setTieneClave(await hasPin());
    setBiometria(await biometricsAvailable());
    setBiometriaOn(await biometricsEnabled());
  }, []);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  async function guardarClave() {
    try {
      await setPin(claveNueva);
      setClaveNueva("");
      setClaveMsg("Clave guardada. Tus fotos ya están detrás de ella.");
      await loadVault();
    } catch (error) {
      setClaveMsg(error instanceof Error ? error.message : "No se pudo guardar tu clave");
    }
  }

  async function quitarClave() {
    await clearPin();
    setClaveMsg("Clave quitada: tus fotos quedan sin candado.");
    await loadVault();
  }

  async function alternarBiometria(valor: boolean) {
    try {
      await setBiometricsEnabled(valor);
      setBiometriaOn(valor);
      setClaveMsg(null);
    } catch (error) {
      setClaveMsg(error instanceof Error ? error.message : "No se pudo cambiar Face ID");
    }
  }

  const loadHealth = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    const connected = await isHealthConnected();
    setHealthConnected(connected);
    if (connected) {
      try {
        setHealthSummary(await getHealthSummary());
      } catch {
        // Sin red o el servidor no respondió: se queda con lo que ya tenía en pantalla.
      }
      try {
        const { actividades } = await getActivities();
        setActivityCount(actividades.length);
      } catch {
        // Igual: se queda con el conteo previo si lo había.
      }
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function refreshHealthSummaryAndCount() {
    setHealthSummary(await getHealthSummary());
    try {
      const { actividades } = await getActivities();
      setActivityCount(actividades.length);
    } catch {
      // Se queda con el conteo previo si la llamada falla.
    }
  }

  async function handleConnectHealth() {
    if (connectingHealth) return;
    setConnectingHealth(true);
    setHealthMessage(null);
    try {
      const granted = await connectHealth();
      if (!granted) {
        setHealthMessage("No se pudo abrir el diálogo de Salud. Intenta de nuevo.");
        return;
      }
      setHealthConnected(true);
      // Primera conexión: backfill grande para que el PAL tenga sus 14+ días de una vez.
      const [healthResult, workoutsResult] = await Promise.all([syncHealth(30), syncWorkouts(30)]);
      await refreshHealthSummaryAndCount();
      const enviados = (healthResult?.enviados ?? 0) + (workoutsResult?.enviados ?? 0);
      setHealthMessage(
        enviados > 0
          ? `Listo: ${enviados} ${enviados === 1 ? "dato enviado" : "datos enviados"}.`
          : "Conectado. Cuando el reloj traiga datos, se sincronizan solos.",
      );
    } finally {
      setConnectingHealth(false);
    }
  }

  async function handleSyncHealth() {
    if (syncingHealth) return;
    setSyncingHealth(true);
    setHealthMessage(null);
    try {
      await ensureCurrentPermissions();
      const [healthResult, workoutsResult] = await Promise.all([syncHealth(7), syncWorkouts(7)]);
      await refreshHealthSummaryAndCount();
      const parts: string[] = [];
      if (healthResult && healthResult.enviados > 0) {
        parts.push(`${healthResult.enviados} ${healthResult.enviados === 1 ? "día" : "días"}`);
      }
      if (workoutsResult && workoutsResult.enviados > 0) {
        parts.push(
          `${workoutsResult.enviados} ${workoutsResult.enviados === 1 ? "entrenamiento" : "entrenamientos"}`,
        );
      }
      setHealthMessage(parts.length > 0 ? `${parts.join(" · ")} enviados.` : "Sin datos nuevos del reloj.");
    } finally {
      setSyncingHealth(false);
    }
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncAndNotify();
      setSyncMessage(formatSyncResult(result));
    } finally {
      setSyncing(false);
    }
  }

  function handleDeleteVideos() {
    if (videoCount === 0 || deletingVideos) return;
    Alert.alert(
      "Borrar videos descargados",
      `Se borran los ${videoCount} ${videoCount === 1 ? "video" : "videos"} que tienes guardados en el teléfono. Puedes volver a descargarlos cuando quieras.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar",
          style: "destructive",
          onPress: () => {
            setDeletingVideos(true);
            try {
              purgeVideoDownloads();
              refreshVideoCount();
            } finally {
              setDeletingVideos(false);
            }
          },
        },
      ],
    );
  }

  function handleSignOut() {
    if (signingOut) return;
    Alert.alert("Cerrar sesión", "¿Seguro que quieres cerrar tu sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          // El signOut ya dispara la purga de datos locales (context/session.tsx
          // escucha SIGNED_OUT) — no hay que repetirla aquí.
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  const appVersion = Constants.expoConfig?.version ?? "—";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
          <Text style={styles.backText}>← Atrás</Text>
        </Pressable>

        <Text style={styles.title}>{activa ? SECCIONES[activa] : "Ajustes"}</Text>

        {activa === "checkin" && (
        <SeccionPuntoCero puntoCero={puntoCero} onCambio={setPuntoCero} />
        )}

        {activa === "checkin" && (
        <Card>
          <SectionLabel>Cuándo cierras tu semana</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              El día que elijas es el que la app espera tu check-in, y a esa hora te manda un
              recordatorio que abre el formulario. El aviso lo programa tu teléfono: funciona sin
              señal y sin servidor.
            </TextoExplicativo>
          </Explicacion>

          <Text style={styles.cierreLabel}>Día</Text>
          <View style={styles.cierreRow}>
            {DIAS.map((dia, indice) => (
              <Pressable
                key={dia}
                onPress={() => guardarCierre(indice, horaCierre ?? 9)}
                style={[styles.cierreChip, diaCierre === indice && styles.cierreChipOn]}
              >
                <Text
                  style={[styles.cierreChipText, diaCierre === indice && styles.cierreChipTextOn]}
                >
                  {dia.slice(0, 3)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.cierreLabel}>Hora</Text>
          <View style={styles.cierreRow}>
            {[7, 9, 12, 18, 20, 21].map((hora) => (
              <Pressable
                key={hora}
                onPress={() => guardarCierre(diaCierre ?? 0, hora)}
                style={[styles.cierreChip, horaCierre === hora && styles.cierreChipOn]}
              >
                <Text
                  style={[styles.cierreChipText, horaCierre === hora && styles.cierreChipTextOn]}
                >
                  {hora}:00
                </Text>
              </Pressable>
            ))}
          </View>

          {cierreMsg && <Text style={styles.vaultMsg}>{cierreMsg}</Text>}

          {(diaCierre !== null || horaCierre !== null) && (
            <Pressable onPress={() => guardarCierre(null, null)} hitSlop={8} style={{ marginTop: spacing.lg }}>
              <Text style={styles.vaultLinkSoft}>Quitar recordatorio</Text>
            </Pressable>
          )}
        </Card>
        )}

        {activa === "entrenamiento" && <HorarioDeEntrenamiento me={me} />}

        {activa === "entrenamiento" && <SeccionEntrenamiento me={me} />}

        {activa === "nutricion" && <SeccionHorariosComida />}

        {activa === "nutricion" && (
        <>
        <Card>
          <SectionLabel>Rearmar tu alimentación</SectionLabel>
          <Text style={styles.vaultIntro}>
            Cambiar una cosa se hace aquí abajo. Cuando cambió el conjunto —otro objetivo, otro
            estilo, otro presupuesto— conviene volver a mirar todas las respuestas juntas y ver qué
            implica cada una.
          </Text>

          <Pressable onPress={() => router.push("/replantear-dieta")} style={styles.replantear}>
            <RotateCcw size={18} color={colors.pergamino} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replantearTitulo}>Volver a armar mi perfil</Text>
              <Text style={styles.replantearDetalle}>
                Entra con tu siguiente check-in: el menú de esta semana ya se compró.
              </Text>
            </View>
          </Pressable>
        </Card>

        <Card>
          <SectionLabel>Tu tipo de dieta</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              Cada estilo cambia una cosa y nada más. Lo eliges tú: la app no decide sola qué
              filosofía sigues, y te dice qué implica cada una antes de cambiar.
            </TextoExplicativo>
          </Explicacion>

          <View style={styles.presupuestoLista}>
            {ESTILOS_DIETA.map((estilo) => (
              <Pressable
                key={estilo.valor}
                onPress={() => guardarDieta(estilo.valor)}
                style={[styles.presupuestoFila, dieta === estilo.valor && styles.presupuestoFilaOn]}
              >
                <Text
                  style={[
                    styles.presupuestoNombre,
                    dieta === estilo.valor && styles.presupuestoNombreOn,
                  ]}
                >
                  {estilo.nombre}
                </Text>
                <Text style={styles.presupuestoDetalle}>{estilo.detalle}</Text>
              </Pressable>
            ))}
          </View>

          {dieta === "AYUNO" && (
            <>
              <Text style={styles.cierreLabel}>Tu ventana para comer</Text>
              <View style={styles.cierreRow}>
                {VENTANAS_AYUNO.map((opcion) => {
                  const activo = ventana.inicio === opcion.inicio && ventana.fin === opcion.fin;
                  return (
                    <Pressable
                      key={opcion.nombre}
                      onPress={() => guardarVentana(opcion.inicio, opcion.fin)}
                      style={[styles.cierreChip, activo && styles.cierreChipOn]}
                    >
                      <Text style={[styles.cierreChipText, activo && styles.cierreChipTextOn]}>
                        {opcion.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {(() => {
            const aviso = avisoDeDieta(dieta, {
              // La hora que importa es la del entrenamiento, no la del
              // recordatorio del check-in.
              entrenaTemprano: (me?.profile?.trainingTime ?? "MANANA") === "MANANA",
              inicioVentana: ventana.inicio,
            });
            return aviso ? <Text style={styles.vaultMsg}>{aviso}</Text> : null;
          })()}

          {dietaMsg && <Text style={styles.vaultMsg}>{dietaMsg}</Text>}
        </Card>

        <Card>
          <SectionLabel>Presupuesto de despensa</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              Acota con qué alimentos se arma tu menú. Los tres niveles cubren proteína,
              carbohidrato, grasa y vegetales: ninguno te deja sin con qué comer, cambian la
              variedad y el precio.
            </TextoExplicativo>
          </Explicacion>

          <View style={styles.presupuestoLista}>
            {PRESUPUESTOS.map((opcion) => (
              <Pressable
                key={opcion.valor}
                onPress={() => guardarPresupuesto(opcion.valor)}
                style={[
                  styles.presupuestoFila,
                  presupuesto === opcion.valor && styles.presupuestoFilaOn,
                ]}
              >
                <Text
                  style={[
                    styles.presupuestoNombre,
                    presupuesto === opcion.valor && styles.presupuestoNombreOn,
                  ]}
                >
                  {opcion.nombre}
                </Text>
                <Text style={styles.presupuestoDetalle}>{opcion.detalle}</Text>
              </Pressable>
            ))}
          </View>

          {presupuestoMsg && <Text style={styles.vaultMsg}>{presupuestoMsg}</Text>}

          <Text style={styles.vaultIntro}>
            Cambiarlo no rehace el menú de esta semana: ese ya se compró, y rehacerlo a media
            semana obliga a tirar comida.
          </Text>
        </Card>

        <Card>
          <SectionLabel>Cuánto quieres cocinar</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              El tiempo se mide **el día que comes**, no el día que cocinas. El arroz tarda media
              hora en la olla, pero si se hace el domingo y entre semana se calienta la porción,
              cuenta como calentar — así que sigue entrando aunque elijas poco tiempo.
              {"\n\n"}
              Es una preferencia y no una regla: si el tope dejara una comida sin proteína, manda
              comer.
            </TextoExplicativo>
          </Explicacion>

          <View style={styles.presupuestoLista}>
            {TIEMPOS_COCINA.map((opcion) => {
              const activo = tiempoCocina === opcion.valor;
              return (
                <Pressable
                  key={opcion.nombre}
                  onPress={() => guardarTiempoCocina(opcion.valor)}
                  style={[styles.presupuestoFila, activo && styles.presupuestoFilaOn]}
                >
                  <Text style={[styles.presupuestoNombre, activo && styles.presupuestoNombreOn]}>
                    {opcion.nombre}
                  </Text>
                  <Text style={styles.presupuestoDetalle}>{opcion.detalle}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionLabel>Lo que tienes en la alacena</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              Se pregunta qué tienes, no qué deberías comprar: la app no recomienda productos. Lo
              que marques entra a tu plan —el polvo como un alimento más del menú, la creatina y el
              omega como pauta del día— y lo que no, simplemente no aparece.
            </TextoExplicativo>
          </Explicacion>

          <View style={styles.presupuestoLista}>
            {SUPLEMENTOS.map((opcion) => {
              const activo = suplementos.includes(opcion.valor);
              return (
                <Pressable
                  key={opcion.valor}
                  onPress={() => alternarSuplemento(opcion.valor)}
                  style={[styles.presupuestoFila, activo && styles.presupuestoFilaOn]}
                >
                  <Text style={[styles.presupuestoNombre, activo && styles.presupuestoNombreOn]}>
                    {activo ? "✓ " : ""}
                    {opcion.nombre}
                  </Text>
                  <Text style={styles.presupuestoDetalle}>{opcion.detalle}</Text>
                </Pressable>
              );
            })}
          </View>

          {suplementosMsg && <Text style={styles.vaultMsg}>{suplementosMsg}</Text>}
        </Card>

        <Card>
          <SectionLabel>Lo que sí y lo que no</SectionLabel>
          <Explicacion>
            <TextoExplicativo>
              Separa con comas. Lo que te gusta aparece más seguido; lo que no comes sale del menú
              y de la lista de súper. Las alergias no se editan aquí: esas las lleva tu perfil y
              nunca entran, ni por equivalencia.
            </TextoExplicativo>
          </Explicacion>

          <Text style={styles.cierreLabel}>Lo que sí te gusta</Text>
          <TextInput
            value={favoritos}
            onChangeText={setFavoritos}
            onBlur={guardarAlimentos}
            placeholder="pollo, avena, camote"
            placeholderTextColor={colors.paloRosaLight}
            autoCapitalize="none"
            style={styles.vaultInput}
          />

          <Text style={styles.cierreLabel}>Lo que no comes</Text>
          <TextInput
            value={excluidos}
            onChangeText={setExcluidos}
            onBlur={guardarAlimentos}
            placeholder="salmón, brócoli"
            placeholderTextColor={colors.paloRosaLight}
            autoCapitalize="none"
            style={styles.vaultInput}
          />

          {alimentosMsg && <Text style={styles.vaultMsg}>{alimentosMsg}</Text>}
        </Card>

        <Card>
          <SectionLabel>Regenerar tu menú</SectionLabel>
          <Text style={styles.vaultIntro}>
            Ya guardaste tus cambios arriba. Si no quieres esperar a tu siguiente check-in, aquí
            rearmas tu menú de hoy con lo que acabas de elegir.
          </Text>
          <RegenerarMenu />
        </Card>
        </>
        )}

        {activa === "apariencia" && (
        <Card>
          <SectionLabel>Apariencia</SectionLabel>
          <View style={styles.themeList}>
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  style={[styles.themeRow, selected && styles.themeRowSelected]}
                >
                  <ThemeSwatch palette={option.palette} />
                  <Text style={styles.themeLabel}>{option.label}</Text>
                  {selected && <Check size={18} color={colors.champan} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </View>
        </Card>
        )}

        {activa === "perfil" && (
        <Card>
          <SectionLabel>Tu perfil</SectionLabel>
          {!me && !meError && <LoadingState label="Cargando tu perfil..." />}
          {!me && meError && <ErrorState message={meError} onRetry={loadMe} />}
          {me && (
            <View style={styles.profileList}>
              <InfoRow label="Nombre" value={me.profile?.displayName ?? "—"} styles={styles} />
              <InfoRow label="Correo" value={me.user.email} styles={styles} />
              <InfoRow label="Fase actual" value={me.profile?.currentPhase ?? "—"} styles={styles} />
              <InfoRow label="Objetivo" value={me.profile?.goal ?? "—"} styles={styles} />
              <InfoRow
                label="Días de pesas"
                value={me.profile ? `${me.profile.trainingDaysPerWeek} / semana` : "—"}
                styles={styles}
              />
              <InfoRow
                label="Estatura"
                value={me.profile?.heightCm != null ? `${me.profile.heightCm} cm` : "—"}
                styles={styles}
              />
              <Text style={styles.profileNote}>
                Para cambiar tus datos de entrenamiento, escríbele a tu coach.
              </Text>
            </View>
          )}
        </Card>
        )}

        {activa === "telefono" && (
        <Card>
          <SectionLabel>Tu teléfono</SectionLabel>
          <View style={styles.phoneList}>
            <View style={styles.phoneRow}>
              <View style={styles.phoneInfo}>
                <Text style={styles.phoneLabel}>Sesiones sin subir</Text>
                <Text style={styles.phoneValue}>
                  {pendingCount === 0 ? "Todo sincronizado" : `${pendingCount} ${pendingCount === 1 ? "sesión" : "sesiones"}`}
                </Text>
              </View>
              <Pressable onPress={handleSync} disabled={syncing} style={styles.actionButton}>
                <Text style={[styles.actionButtonText, syncing && styles.actionButtonTextDisabled]}>
                  {syncing ? "Sincronizando…" : "Sincronizar ahora"}
                </Text>
              </Pressable>
            </View>
            {syncMessage && <Text style={styles.syncMessage}>{syncMessage}</Text>}

            <View style={styles.phoneDivider} />

            <View style={styles.phoneRow}>
              <View style={styles.phoneInfo}>
                <Text style={styles.phoneLabel}>Videos descargados</Text>
                <Text style={styles.phoneValue}>{videoCount === 0 ? "Ninguno" : `${videoCount}`}</Text>
              </View>
              <Pressable
                onPress={handleDeleteVideos}
                disabled={videoCount === 0 || deletingVideos}
                style={styles.actionButton}
              >
                <Text
                  style={[
                    styles.actionButtonTextDestructive,
                    (videoCount === 0 || deletingVideos) && styles.actionButtonTextDisabled,
                  ]}
                >
                  Borrar videos descargados
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>
        )}

        {activa === "reloj" && Platform.OS === "ios" && (
          <Card>
            <SectionLabel>Tu reloj</SectionLabel>
            {!healthConnected ? (
              <View style={styles.healthBlock}>
                <Text style={styles.profileNote}>
                  Conecta Apple Salud para que tus pasos, sueño y frecuencia cardiaca ajusten tu gasto
                  calórico solos — nada de armar atajos a mano.
                </Text>
                <PrimaryButton
                  label="Conectar Apple Salud"
                  onPress={handleConnectHealth}
                  loading={connectingHealth}
                />
              </View>
            ) : (
              <View style={styles.healthBlock}>
                <View style={styles.phoneRow}>
                  <View style={styles.phoneInfo}>
                    <Text style={styles.phoneLabel}>Último dato recibido</Text>
                    <Text style={styles.phoneValue}>{healthSummary?.lastDate ?? "Todavía nada"}</Text>
                  </View>
                  <Pressable onPress={handleSyncHealth} disabled={syncingHealth} style={styles.actionButton}>
                    <Text style={[styles.actionButtonText, syncingHealth && styles.actionButtonTextDisabled]}>
                      {syncingHealth ? "Sincronizando…" : "Sincronizar ahora"}
                    </Text>
                  </Pressable>
                </View>
                <InfoRow
                  label="Promedio de pasos"
                  value={healthSummary?.avgSteps != null ? `${healthSummary.avgSteps.toLocaleString("es-MX")}` : "—"}
                  styles={styles}
                />
                <InfoRow
                  label="Entrenamientos registrados"
                  value={activityCount != null ? `${activityCount}` : "—"}
                  styles={styles}
                />
              </View>
            )}
            {healthMessage && <Text style={styles.syncMessage}>{healthMessage}</Text>}
          </Card>
        )}

        {/* La app de la muñeca es lo que hace que una sesión no se registre a
            medias: entre serie y serie, sacar el teléfono es la fricción que
            hace que la gente deje de anotar. Aquí se dice qué hace hoy y qué
            todavía no, porque prometer conteo automático antes de tenerlo es
            la forma más rápida de que alguien deje de confiar en el número. */}
        {activa === "reloj" && Platform.OS === "ios" && reloj.soportado && (
          <Card>
            <SectionLabel>Holy Gains en tu muñeca</SectionLabel>

            <InfoRow
              label="Apple Watch emparejado"
              value={reloj.emparejado ? "Sí" : "No"}
              styles={styles}
            />
            <InfoRow
              label="App instalada en el reloj"
              value={reloj.appInstalada ? "Sí" : "No"}
              styles={styles}
            />

            <Text style={styles.profileNote}>
              {reloj.appInstalada
                ? "Durante una sesión en vivo, la serie que te toca aparece en el reloj y la puedes cerrar desde ahí sin sacar el teléfono. Si el teléfono está lejos, lo que cierres se guarda y se manda cuando vuelva a estar cerca."
                : reloj.emparejado
                  ? "Tu reloj está emparejado pero todavía no tiene la app. Instálala desde la app de Apple Watch en tu teléfono, en Apps disponibles."
                  : "Con un Apple Watch emparejado, la serie que te toca se ve en la muñeca y se cierra desde ahí."}
            </Text>

            <Text style={styles.profileNote}>
              Las repeticiones todavía las cuentas tú. El reloj graba el movimiento de cada serie
              para poder contarlas solo más adelante; hasta que ese conteo esté probado contra
              sesiones reales, el número que se guarda es el que tú pones.
            </Text>
          </Card>
        )}

        {activa === "fotos" && (
        <Card>
          <SectionLabel>Tus fotos</SectionLabel>
          <Text style={styles.vaultIntro}>
            Tus fotos de progreso no se ven en ninguna otra pantalla. Aquí defines la clave que las
            abre — distinta a la de tu teléfono a propósito: quien ya lo desbloqueó no debería
            poder verlas.
          </Text>

          {/* Se dice ANTES de crearla, no después de olvidarla: la diferencia
              entre una decisión informada y una sorpresa. */}
          <Text style={styles.vaultAviso}>
            Si la olvidas no hay manera de recuperarla. Tus fotos siguen guardadas en el servidor,
            pero esta pantalla no las va a poder abrir: habría que poner una clave nueva y perder
            el acceso a las anteriores.
          </Text>

          <View style={styles.vaultRow}>
            <TextInput
              value={claveNueva}
              onChangeText={(value) => setClaveNueva(value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH))}
              placeholder={tieneClave ? "Nueva clave" : `${MIN_PIN_LENGTH} a ${MAX_PIN_LENGTH} dígitos`}
              placeholderTextColor={colors.paloRosaLight}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.vaultInput}
            />
            <Pressable
              onPress={guardarClave}
              disabled={claveNueva.length < MIN_PIN_LENGTH}
              style={[styles.vaultButton, claveNueva.length < MIN_PIN_LENGTH && styles.vaultButtonOff]}
            >
              <Text style={styles.vaultButtonText}>{tieneClave ? "Cambiar" : "Crear"}</Text>
            </Pressable>
          </View>

          {biometria && (
            <View style={styles.vaultToggle}>
              <Text style={styles.vaultToggleLabel}>
                {biometria === "facial" ? "Abrir con Face ID" : "Abrir con Touch ID"}
              </Text>
              <Switch
                value={biometriaOn}
                onValueChange={alternarBiometria}
                trackColor={{ true: colors.guinda, false: colors.cardBorder }}
                thumbColor={colors.marfil}
              />
            </View>
          )}

          {claveMsg && <Text style={styles.vaultMsg}>{claveMsg}</Text>}

          <View style={styles.vaultLinks}>
            <Pressable onPress={() => router.push("/fotos")} hitSlop={8}>
              <Text style={styles.vaultLink}>Ver mis fotos →</Text>
            </Pressable>
            {tieneClave && (
              <Pressable onPress={quitarClave} hitSlop={8}>
                <Text style={styles.vaultLinkSoft}>Quitar clave</Text>
              </Pressable>
            )}
          </View>
        </Card>

        )}

        {activa === "sesion" && (
        <Card>
          <SectionLabel>Sesión</SectionLabel>
          <View style={styles.sessionBlock}>
            <Text style={styles.versionText}>Holy Gains v{appVersion}</Text>
            <PrimaryButton label="Cerrar sesión" onPress={handleSignOut} loading={signingOut} />
          </View>
        </Card>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/** Vista previa mínima de cada opción de tema. "Sistema" se pinta partida
 * mitad clara / mitad oscura porque no tiene una paleta propia. */
function ThemeSwatch({ palette }: { palette: Palette | null }) {
  if (!palette) {
    return (
      <View style={swatchStyles.swatch}>
        <View style={[swatchStyles.half, { backgroundColor: paletteLight.obsidiana }]} />
        <View style={[swatchStyles.half, { backgroundColor: paletteDark.obsidiana }]} />
      </View>
    );
  }
  return (
    <View style={[swatchStyles.swatch, { backgroundColor: palette.obsidiana, borderColor: palette.cardBorder }]}>
      <View style={[swatchStyles.dot, { backgroundColor: palette.guinda }]} />
    </View>
  );
}

const swatchStyles = StyleSheet.create({
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: 4,
  },
  half: {
    flex: 1,
    height: "100%",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  presupuestoLista: { gap: spacing.sm, marginTop: spacing.md },
  replantear: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
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
  cierreLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1,
    color: colors.paloRosa,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  cierreRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  vaultAviso: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.champan,
    backgroundColor: withAlpha(colors.champan, 0.12),
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  vaultIntro: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  vaultRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  vaultInput: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.marfil,
  },
  vaultButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.guinda,
  },
  vaultButtonOff: { opacity: 0.5 },
  vaultButtonText: { fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.pergamino },
  vaultToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  vaultToggleLabel: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.marfil },
  vaultMsg: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.champan,
    marginTop: spacing.md,
  },
  vaultLinks: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  vaultLink: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.champan },
  vaultLinkSoft: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    // Extra sobre `spacing.huge`: en las secciones con campos de texto al
    // fondo (favoritos/excluidos), el teclado necesita más aire debajo del
    // último campo para no taparlo — antes se escribía a ciegas ahí.
    paddingBottom: spacing.huge * 2,
  },
  backRow: { flexDirection: "row", alignItems: "center" },
  backText: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
  title: {
    fontFamily: fonts.display,
    ...typeScale.title,
    color: colors.marfil,
  },
  themeList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  themeRowSelected: {
    borderColor: colors.guindaLight,
  },
  themeLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.marfil,
  },
  profileList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  infoValue: {
    fontFamily: fonts.sans,
    ...typeScale.subheading,
    color: colors.marfil,
  },
  profileNote: {
    fontFamily: fonts.serifItalic,
    ...typeScale.body,
    color: colors.paloRosaLight,
    marginTop: spacing.xs,
  },
  phoneList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  healthBlock: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  phoneInfo: { gap: 2 },
  phoneLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  phoneValue: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  phoneDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  actionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionButtonText: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1.5,
    color: colors.champan,
    textAlign: "right",
  },
  actionButtonTextDestructive: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.label,
    letterSpacing: 1.5,
    color: colors.error,
    textAlign: "right",
  },
  actionButtonTextDisabled: {
    opacity: 0.5,
  },
  syncMessage: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
  },
  sessionBlock: {
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  versionText: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
});
