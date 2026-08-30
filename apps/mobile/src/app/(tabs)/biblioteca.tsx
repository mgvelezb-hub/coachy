import NetInfo from "@react-native-community/netinfo";
import {
  Dumbbell,
  Flame,
  Footprints,
  Hand,
  Home,
  Layers,
  Target,
  Waves,
} from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Collapsible } from "@/components/Collapsible";
import { ScoreCard } from "@/components/ScoreCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import { ApiError, getTrainingWeek, type SessionExerciseView, type WeekView } from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
import { TECNICA_POR_DISCIPLINA } from "@/lib/tecnica";
import { DISCIPLINE_LABELS, type Discipline } from "@/lib/api";
import { fonts, radius, spacing, type Palette, type as typeScale } from "@/lib/theme";
import { getCachedWeek, saveWeek } from "@/lib/training-db";
import {
  downloadVideo,
  isVideoDownloaded,
  localVideoFile,
  removeVideoDownload,
} from "@/lib/video-downloads";

/**
 * Biblioteca — una tarjeta por disciplina.
 *
 * Hoy solo Gym tiene contenido: son los videos de tu semana, agrupados por
 * zona. Las demás disciplinas aparecen anunciadas y vacías a propósito, no por
 * descuido — cada una entra con su propia investigación (niveles, estructura
 * de sesión, progresión), y natación es la primera de la fila. Enseñar el
 * lugar vacío es más honesto que esconder que existe el plan.
 *
 * De dónde salen los videos de Gym:
 *
 * No hay endpoint Bearer para el catálogo completo de ejercicios (la web lo
 * arma con cookies vía `apps/web/src/lib/exercise-library.ts`, que corre
 * server-only con Prisma). En vez de tocar eso, esta pantalla arma la
 * biblioteca a partir de `GET /api/v1/training/week`, que ya trae cada
 * ejercicio de la semana con su `videoUrl` firmado — se agrupan por grupo
 * muscular igual que la biblioteca web (`exercise-groups.ts`).
 *
 * Cada video se puede descargar aparte con `expo-file-system` (File API) para
 * verlo sin señal en el gimnasio; `training-sync.ts`/`training-db.ts` ya
 * resuelven el mismo problema para las series, aquí es el mismo patrón
 * aplicado a los archivos de video.
 */

const MUSCLE_GROUP_ORDER = ["PIERNA", "HOMBRO", "PECHO", "ESPALDA", "BICEP", "TRICEP", "ABDOMEN"] as const;
const OTHER_GROUP = "OTROS";
const GROUP_LABELS: Record<string, string> = {
  PIERNA: "Pierna y glúteo",
  HOMBRO: "Hombro",
  PECHO: "Pecho",
  ESPALDA: "Espalda",
  BICEP: "Bíceps",
  TRICEP: "Tríceps",
  ABDOMEN: "Core y abdomen",
  [OTHER_GROUP]: "Otros",
};

function groupKey(group: string): string {
  const upper = group.trim().toUpperCase();
  return (MUSCLE_GROUP_ORDER as readonly string[]).includes(upper) ? upper : OTHER_GROUP;
}

type LibraryVideo = {
  key: string;
  name: string;
  groupKey: string;
  videoPath: string;
  videoUrl: string | null;
};

type LibraryGroup = { key: string; label: string; videos: LibraryVideo[] };

/** Un ejercicio por `exerciseId` (o nombre, si no trae id) — la semana repite
 * el mismo ejercicio en varios días y aquí solo hace falta uno. */
function libraryFromWeek(week: WeekView): LibraryGroup[] {
  const byKey = new Map<string, LibraryVideo>();

  for (const session of week.sessions) {
    for (const exercise of session.exercises as SessionExerciseView[]) {
      if (!exercise.videoPath) continue;
      const key = exercise.exerciseId ?? `${exercise.name}:${exercise.videoPath}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        name: exercise.name,
        groupKey: groupKey(exercise.muscleGroup),
        videoPath: exercise.videoPath,
        videoUrl: exercise.videoUrl,
      });
    }
  }

  const buckets = new Map<string, LibraryVideo[]>();
  for (const video of byKey.values()) {
    const list = buckets.get(video.groupKey);
    if (list) list.push(video);
    else buckets.set(video.groupKey, [video]);
  }

  const order = [...MUSCLE_GROUP_ORDER, OTHER_GROUP];
  return [...buckets.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, videos]) => ({
      key,
      label: GROUP_LABELS[key] ?? "Otros",
      videos: [...videos].sort((a, b) => a.name.localeCompare(b.name, "es")),
    }));
}

function mondayISO(): string {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - (day - 1));
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function BibliotecaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tocar esta pestaña estando en ella regresa el scroll hasta arriba.
  const scrollRef = useScrollTop();

  const [week, setWeek] = useState<WeekView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [openVideo, setOpenVideo] = useState<string | null>(null);

  const groups = useMemo(() => (week ? libraryFromWeek(week) : []), [week]);

  const refreshDownloaded = useCallback((videos: LibraryVideo[]) => {
    const next: Record<string, boolean> = {};
    for (const video of videos) next[video.videoPath] = isVideoDownloaded(video.videoPath);
    setDownloaded(next);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const fresh = await getTrainingWeek();
      setWeek(fresh);
      await saveWeek(fresh.weekStart, fresh);
      refreshDownloaded(libraryFromWeek(fresh).flatMap((g) => g.videos));
    } catch (error) {
      const cached = await getCachedWeek(mondayISO());
      if (cached) {
        setWeek(cached);
        refreshDownloaded(libraryFromWeek(cached).flatMap((g) => g.videos));
      } else {
        setLoadError(
          error instanceof ApiError ? error.message : "Sin conexión y sin biblioteca guardada todavía",
        );
      }
    }
  }, [refreshDownloaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  async function handleDownload(video: LibraryVideo) {
    if (!video.videoUrl || busy[video.videoPath]) return;
    setBusy((current) => ({ ...current, [video.videoPath]: true }));
    try {
      await downloadVideo(video.videoPath, video.videoUrl);
      setDownloaded((current) => ({ ...current, [video.videoPath]: true }));
    } catch {
      // Sin red a medio camino, o el link firmado caducó: se queda como estaba.
    } finally {
      setBusy((current) => ({ ...current, [video.videoPath]: false }));
    }
  }

  function handleRemove(video: LibraryVideo) {
    removeVideoDownload(video.videoPath);
    setDownloaded((current) => ({ ...current, [video.videoPath]: false }));
    if (openVideo === video.key) setOpenVideo(null);
  }

  if (!week && !loadError) return <LoadingState label="Cargando tu biblioteca..." />;
  if (!week && loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!week) return null;

  const totalVideos = groups.reduce((sum, g) => sum + g.videos.length, 0);

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Biblioteca</Text>
      <Text style={styles.subtitle}>
        Los videos de tu semana, agrupados por zona. Descárgalos con señal y quedan en tu teléfono
        para el gimnasio.
      </Text>

      {!online && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>Sin conexión — solo se reproducen los descargados</Text>
        </View>
      )}

      <ScoreCard
        icon={Dumbbell}
        tint={colors.champan}
        title="Gym"
        summary={
          totalVideos === 0
            ? "Tu semana todavía no tiene videos"
            : `${totalVideos} ${totalVideos === 1 ? "video" : "videos"} · ${groups.length} ${groups.length === 1 ? "zona" : "zonas"}`
        }
      >
        {totalVideos === 0 ? (
          <EmptyState message="Tu semana todavía no tiene ejercicios con video." />
        ) : (
          <View style={styles.groups}>
            {groups.map((group) => {
              const groupDownloaded = group.videos.filter((v) => downloaded[v.videoPath]).length;
              return (
                <Collapsible
                  key={group.key}
                  title={group.label}
                  subtitle={`${group.videos.length} ejercicios · ${groupDownloaded}/${group.videos.length} descargados`}
                >
                  {group.videos.map((video) => (
                    <VideoRow
                      key={video.key}
                      video={video}
                      online={online}
                      isDownloaded={Boolean(downloaded[video.videoPath])}
                      isBusy={Boolean(busy[video.videoPath])}
                      isOpen={openVideo === video.key}
                      onToggleOpen={() => setOpenVideo(openVideo === video.key ? null : video.key)}
                      onDownload={() => handleDownload(video)}
                      onRemove={() => handleRemove(video)}
                    />
                  ))}
                </Collapsible>
              );
            })}
          </View>
        )}
      </ScoreCard>

      {/* Cada disciplina con prescripción trae sus fichas de técnica. La sesión
          las pide por nombre —"patada con tabla", "vuelta a la T", "guardia"—
          y pedir algo que no se enseña en ningún lado es lo que en pesas sería
          impensable: ahí cada ejercicio tiene su video. */}
      {(Object.keys(TECNICA_POR_DISCIPLINA) as Discipline[]).map((disciplina) => {
        const fichas = TECNICA_POR_DISCIPLINA[disciplina] ?? [];
        const Icono = iconoDe(disciplina);

        return (
          <ScoreCard
            key={disciplina}
            icon={Icono}
            tint={colors.paloRosa}
            title={DISCIPLINE_LABELS[disciplina]}
            summary={`${fichas.length} ejercicios de técnica · sin video todavía`}
            status={{ label: "Ya se prescribe", tone: "ok" }}
          >
            <Text style={styles.disciplinaIntro}>
              Estos son los que aparecen en el bloque de técnica de tu sesión. Todavía sin video:
              lo que hay es cómo se hace, para qué sirve y el error más común.
            </Text>

            {fichas.map((ficha) => (
              <Collapsible key={ficha.id} title={ficha.nombre}>
                <Text style={styles.fichaLinea}>
                  <Text style={styles.fichaEtiqueta}>Cómo: </Text>
                  {ficha.como}
                </Text>
                <Text style={styles.fichaLinea}>
                  <Text style={styles.fichaEtiqueta}>Para qué: </Text>
                  {ficha.para}
                </Text>
                <Text style={styles.fichaLinea}>
                  <Text style={styles.fichaEtiqueta}>Ojo con: </Text>
                  {ficha.ojo}
                </Text>
              </Collapsible>
            ))}
          </ScoreCard>
        );
      })}

      {/* Lo único que queda sin prescripción: entrenar en casa es un contexto
          —dónde entrenas—, no una disciplina, y por eso no tiene sesión propia. */}
      <ScoreCard
        icon={Home}
        tint={colors.paloRosa}
        title="En casa"
        summary="Sin equipo o con lo mínimo"
        status={{ label: "Próximamente", tone: "neutral" }}
      />

    </ScrollView>
  );
}

function VideoRow({
  video,
  online,
  isDownloaded,
  isBusy,
  isOpen,
  onToggleOpen,
  onDownload,
  onRemove,
}: {
  video: LibraryVideo;
  online: boolean;
  isDownloaded: boolean;
  isBusy: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const playable = isDownloaded || (online && Boolean(video.videoUrl));

  return (
    <View style={styles.row}>
      <Pressable onPress={playable ? onToggleOpen : undefined} disabled={!playable} style={styles.rowHeader}>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, !playable && styles.rowNameDisabled]}>{video.name}</Text>
          <Text style={styles.rowMeta}>
            {isDownloaded ? "Descargado" : playable ? "Disponible" : "(necesita conexión)"}
          </Text>
        </View>
        {playable && <Text style={styles.rowPlay}>{isOpen ? "▼" : "▶"}</Text>}
      </Pressable>

      <View style={styles.rowActions}>
        {isDownloaded ? (
          <Pressable onPress={onRemove} hitSlop={8}>
            <Text style={styles.rowActionText}>Quitar descarga</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onDownload} disabled={isBusy || !online || !video.videoUrl} hitSlop={8}>
            {isBusy ? (
              <ActivityIndicator color={colors.paloRosa} size="small" />
            ) : (
              <Text style={[styles.rowActionText, (!online || !video.videoUrl) && styles.rowActionDisabled]}>
                Descargar
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {isOpen && playable && (
        <VideoPlayer uri={isDownloaded ? localVideoFile(video.videoPath).uri : (video.videoUrl as string)} />
      )}
    </View>
  );
}

function VideoPlayer({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });

  return (
    <VideoView
      style={styles.videoView}
      player={player}
      nativeControls
      contentFit="contain"
    />
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  disciplinaIntro: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    marginBottom: spacing.sm,
  },
  fichaLinea: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
  fichaEtiqueta: { fontFamily: fonts.sansSemiBold, color: colors.marfil },

  screen: { flex: 1, backgroundColor: colors.obsidiana },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.huge },
  title: { fontFamily: fonts.display, ...typeScale.title, color: colors.marfil },
  subtitle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
  offlineBadge: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  offlineBadgeText: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosaLight },
  groups: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.marfil },
  rowNameDisabled: { color: colors.paloRosaLight },
  rowMeta: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosaLight },
  rowPlay: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.champan },
  rowActions: { flexDirection: "row", justifyContent: "flex-end" },
  rowActionText: { fontFamily: fonts.sansSemiBold, ...typeScale.label, letterSpacing: 1.5, color: colors.paloRosa },
  rowActionDisabled: { color: colors.paloRosaLight, opacity: 0.6 },
  videoView: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: "#000",
  },
});
