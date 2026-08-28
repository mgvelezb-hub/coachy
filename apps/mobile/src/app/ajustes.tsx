import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ErrorState, LoadingState } from "@/components/States";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/context/theme";
import type { ThemePreference } from "@/context/theme";
import { ApiError, getActivities, getMe, type MeResponse } from "@/lib/api";
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
  paletteChampan,
  paletteDark,
  paletteLight,
  radius,
  spacing,
  type Palette,
  type as typeScale,
} from "@/lib/theme";
import { countPendingSessions } from "@/lib/training-db";
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

export default function AjustesScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

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
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
          <Text style={styles.backText}>← Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Ajustes</Text>

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

        {Platform.OS === "ios" && (
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

        <Card>
          <SectionLabel>Sesión</SectionLabel>
          <View style={styles.sessionBlock}>
            <Text style={styles.versionText}>Holy Gains v{appVersion}</Text>
            <PrimaryButton label="Cerrar sesión" onPress={handleSignOut} loading={signingOut} />
          </View>
        </Card>
      </ScrollView>
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
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
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
