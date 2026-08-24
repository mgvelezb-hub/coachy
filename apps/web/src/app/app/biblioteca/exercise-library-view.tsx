"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CloudDownload,
  Search,
  Trash2,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ExerciseVideo } from "@/components/exercise-video";
import type { LibraryExercise, LibraryGroup } from "@/lib/exercise-groups";
import {
  cachedVideoIndex,
  downloadVideos,
  estimateStorage,
  formatBytes,
  pendingVideos,
  purgeVideoCache,
  removeVideos,
  signVideoUrls,
  supportsVideoCache,
  totalBytes,
  type BatchProgress,
  type LibraryVideo,
  type StorageEstimate,
} from "@/lib/video-cache";

/** Los acentos no deben estorbar al buscar "biceps" o "gluteo". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function videosOf(exercises: LibraryExercise[]): LibraryVideo[] {
  return exercises
    .filter((exercise) => exercise.videoPath !== null)
    .map((exercise) => ({ path: exercise.videoPath as string, bytes: exercise.bytes }));
}

type Job = { label: string; progress: BatchProgress };

/**
 * Biblioteca de ejercicios con descarga local.
 *
 * Todo se decide contra el índice del caché (ruta → bytes), que se relee cada
 * vez que algo cambia. Así el ✓ de cada ejercicio, los MB del grupo y el total
 * del teléfono cuentan lo mismo, y "Liberar espacio" se refleja de inmediato.
 */
export function ExerciseLibraryView({
  groups,
  totalVideos,
  totalBytes: libraryBytes,
  sizesKnown,
}: {
  groups: LibraryGroup[];
  totalVideos: number;
  totalBytes: number;
  sizesKnown: boolean;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<Record<string, number>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastPaint = useRef(0);

  const supported = supportsVideoCache();

  const refresh = useCallback(async (): Promise<void> => {
    const [next, storage] = await Promise.all([cachedVideoIndex(), estimateStorage()]);
    setIndex(next);
    setEstimate(storage);
  }, []);

  useEffect(() => {
    void refresh();
    return () => abort.current?.abort();
  }, [refresh]);

  const allVideos = useMemo(
    () => groups.flatMap((group) => videosOf(group.exercises)),
    [groups],
  );

  const cachedPaths = Object.keys(index);
  const cachedBytes = Object.values(index).reduce((sum, bytes) => sum + bytes, 0);
  const missing = pendingVideos(allVideos, index);

  const term = normalize(query.trim());
  const visible = useMemo(() => {
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        exercises: group.exercises.filter(
          (exercise) =>
            normalize(exercise.name).includes(term) ||
            exercise.substitutes.some((substitute) => normalize(substitute).includes(term)),
        ),
      }))
      .filter((group) => group.exercises.length > 0);
  }, [groups, term]);

  function isOpen(key: string): boolean {
    if (term) return true;
    return openGroups[key] === true;
  }

  async function run(label: string, videos: LibraryVideo[]): Promise<void> {
    if (job) return;

    const pending = pendingVideos(videos, index);
    if (pending.length === 0) {
      toast.info("Ya están todos en el teléfono.");
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setJob({
      label,
      progress: {
        done: 0,
        total: pending.length,
        loadedBytes: 0,
        totalBytes: totalBytes(pending),
        current: null,
      },
    });

    const result = await downloadVideos(pending, signVideoUrls, {
      signal: controller.signal,
      onProgress: (progress) => {
        // Cada chunk dispararía un render: se pinta a lo mucho 5 veces por segundo.
        const now = Date.now();
        const finished = progress.done === progress.total || progress.current === null;
        if (!finished && now - lastPaint.current < 200) return;
        lastPaint.current = now;
        setJob((current) => (current ? { ...current, progress } : current));
      },
    });

    abort.current = null;
    setJob(null);
    await refresh();

    if (result.aborted) {
      toast.info(`Descarga detenida. ${result.downloaded} videos quedaron guardados.`);
      return;
    }
    if (result.quotaExceeded) {
      toast.error("El teléfono se quedó sin espacio. Libera algo y vuelve a intentar.");
      return;
    }
    if (result.failed.length > 0) {
      toast.warning(
        `${result.downloaded} descargados, ${result.failed.length} fallaron. Reintenta con mejor señal.`,
      );
      return;
    }
    // El navegador puede negar el almacenamiento persistente. Los videos se
    // guardan igual, pero son desalojables si el teléfono se llena: mejor
    // decirlo que fingir que quedaron para siempre.
    toast.success(
      `${result.downloaded} videos listos para el gimnasio sin señal.`,
      result.persistence === "denied"
        ? { description: "Si el teléfono se queda sin espacio, el navegador puede borrarlos." }
        : undefined,
    );
  }

  async function free(label: string, videos: LibraryVideo[]): Promise<void> {
    const removed = await removeVideos(videos.map((video) => video.path));
    await refresh();
    toast.success(removed > 0 ? `${label}: espacio liberado.` : "No había nada que liberar.");
  }

  async function freeAll(): Promise<void> {
    if (cachedPaths.length === 0) {
      toast.info("No hay videos descargados.");
      return;
    }
    if (!window.confirm("¿Borrar todos los videos del teléfono? Se pueden volver a descargar.")) {
      return;
    }
    await purgeVideoCache();
    await refresh();
    toast.success("Espacio liberado.");
  }

  const percent =
    job && job.progress.totalBytes > 0
      ? Math.min(100, Math.round((job.progress.loadedBytes / job.progress.totalBytes) * 100))
      : job
        ? Math.round((job.progress.done / Math.max(1, job.progress.total)) * 100)
        : 0;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold leading-tight">Biblioteca</h1>
        <p className="text-sm text-muted-foreground">
          Todos los ejercicios por zona del cuerpo. Descarga los videos con señal y quedan en el
          teléfono para el gimnasio.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">En el teléfono</CardTitle>
          <CardDescription>
            {supported
              ? `${cachedPaths.length} de ${totalVideos} videos${
                  sizesKnown && cachedBytes > 0 ? ` · ${formatBytes(cachedBytes)}` : ""
                }`
              : "Este navegador no puede guardar videos para usarlos sin señal."}
          </CardDescription>
        </CardHeader>

        {supported ? (
          <CardContent className="space-y-3">
            {job ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{job.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {job.progress.done}/{job.progress.total}
                  </span>
                </div>
                <Progress value={percent} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {sizesKnown
                      ? `${formatBytes(job.progress.loadedBytes)} de ${formatBytes(job.progress.totalBytes)}`
                      : `${percent}%`}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => abort.current?.abort()}
                  >
                    <X className="size-4" /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={missing.length === 0}
                  onClick={() => void run("Descargando todo", allVideos)}
                >
                  <CloudDownload className="size-4" />
                  {missing.length === 0
                    ? "Todo descargado"
                    : `Descargar todo (${missing.length} videos${
                        sizesKnown ? ` · ${formatBytes(totalBytes(missing))}` : ""
                      })`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  disabled={cachedPaths.length === 0}
                  onClick={() => void freeAll()}
                >
                  <Trash2 className="size-4" /> Liberar espacio
                </Button>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {sizesKnown ? `La biblioteca completa pesa ${formatBytes(libraryBytes)}. ` : ""}
              {estimate
                ? `El navegador tiene ${formatBytes(Math.max(0, estimate.quota - estimate.usage))} libres.`
                : "Descarga con wifi: son varios videos."}
            </p>
          </CardContent>
        ) : null}
      </Card>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar ejercicio o sustituto"
          className="pl-9"
          aria-label="Buscar ejercicio"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Ningún ejercicio con ese nombre.
        </p>
      ) : null}

      <div className="space-y-3">
        {visible.map((group) => {
          const groupVideos = videosOf(group.exercises);
          const groupPending = pendingVideos(groupVideos, index);
          const groupCached = groupVideos.length - groupPending.length;
          const open = isOpen(group.key);

          return (
            <section key={group.key} className="rounded-lg border">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))
                }
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="space-y-0.5">
                  <span className="block text-base font-semibold">{group.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {group.exercises.length} ejercicios · {groupCached}/{groupVideos.length} videos
                    en el teléfono
                  </span>
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {open ? (
                <div className="space-y-3 border-t px-4 py-3">
                  {supported && groupVideos.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={job !== null || groupPending.length === 0}
                        onClick={() => void run(`Descargando ${group.label}`, groupVideos)}
                      >
                        <CloudDownload className="size-4" />
                        {groupPending.length === 0
                          ? "Descargado"
                          : `Descargar (${groupPending.length} videos${
                              sizesKnown ? ` · ${formatBytes(totalBytes(groupPending))}` : ""
                            })`}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Liberar el espacio de ${group.label}`}
                        disabled={groupCached === 0}
                        onClick={() => void free(group.label, groupVideos)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ) : null}

                  <ul className="space-y-2">
                    {group.exercises.map((exercise) => {
                      const cached =
                        exercise.videoPath !== null && exercise.videoPath in index
                          ? (index[exercise.videoPath] ?? 0)
                          : null;
                      const expanded = openExercise === exercise.id;

                      return (
                        <li key={exercise.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium leading-tight">{exercise.name}</p>
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge variant="secondary">{exercise.groupLabel}</Badge>
                                {exercise.videoPath === null ? (
                                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <VideoOff className="size-3" /> sin video
                                  </span>
                                ) : cached !== null ? (
                                  <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                                    <Check className="size-3" />
                                    {cached > 0 ? formatBytes(cached) : "descargado"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    {sizesKnown && exercise.bytes > 0
                                      ? `${formatBytes(exercise.bytes)} sin descargar`
                                      : "sin descargar"}
                                  </span>
                                )}
                              </div>
                              {exercise.substitutes.length > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Si no hay máquina: {exercise.substitutes.join(" · ")}
                                </p>
                              ) : null}
                            </div>

                            {exercise.videoPath !== null ? (
                              <Button
                                type="button"
                                variant={expanded ? "secondary" : "outline"}
                                size="sm"
                                className="shrink-0"
                                onClick={() => setOpenExercise(expanded ? null : exercise.id)}
                              >
                                {expanded ? "Cerrar" : "Ver"}
                              </Button>
                            ) : null}
                          </div>

                          {expanded ? (
                            <div className="pt-3">
                              <ExerciseVideo
                                path={exercise.videoPath}
                                signedUrl={exercise.videoUrl}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
