import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedVideoIndex,
  cachedVideoUrl,
  downloadVideo,
  downloadVideos,
  formatBytes,
  isVideoCached,
  pendingVideos,
  purgeVideoCache,
  removeVideos,
  totalBytes,
  videoCacheKey,
  videoPathFromKey,
  VIDEO_CACHE,
} from "@/lib/video-cache";

/**
 * Cache Storage no existe en Node, así que aquí va la versión mínima que la
 * API necesita. Lo que se prueba es la mecánica que sostiene el modo offline:
 * la llave es la ruta del ejercicio (no la URL firmada, que caduca), el índice
 * cuenta bytes reales, y liberar espacio borra de verdad.
 */
class FakeCache {
  entries = new Map<string, Response>();

  private static url(request: Request | string): string {
    return typeof request === "string" ? request : request.url;
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(FakeCache.url(request), response);
  }

  async match(request: Request | string): Promise<Response | undefined> {
    const found = this.entries.get(FakeCache.url(request));
    return found ? found.clone() : undefined;
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async delete(request: Request | string): Promise<boolean> {
    return this.entries.delete(FakeCache.url(request));
  }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    const existing = this.stores.get(name);
    if (existing) return existing;
    const created = new FakeCache();
    this.stores.set(name, created);
    return created;
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

const PATH_A = "exercise-videos/library/prensa-de-pierna.mp4";
const PATH_B = "exercise-videos/library/curl-de-biceps.mp4";

function videoResponse(bytes: number): Response {
  return new Response(new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), {
    headers: { "content-type": "video/mp4", "content-length": String(bytes) },
  });
}

let storage: FakeCacheStorage;

beforeEach(() => {
  storage = new FakeCacheStorage();
  vi.stubGlobal("caches", storage);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:fake" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("llaves del caché de videos", () => {
  it("no dependen de la URL firmada", () => {
    expect(videoCacheKey(PATH_A)).toBe(videoCacheKey(`/${PATH_A}`));
    expect(videoCacheKey(PATH_A)).not.toContain("token");
  });

  it("se pueden leer de vuelta desde una llave absoluta", () => {
    const absolute = `http://localhost${videoCacheKey(PATH_A)}`;
    expect(videoPathFromKey(absolute)).toBe(PATH_A);
    expect(videoPathFromKey("http://localhost/_next/static/chunk.js")).toBeNull();
  });
});

describe("descarga", () => {
  it("guarda el blob bajo la ruta del ejercicio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(2048)),
    );

    const outcome = await downloadVideo(PATH_A, "https://firma/uno?token=abc");

    expect(outcome).toEqual({ ok: true, bytes: 2048 });
    expect(await isVideoCached(PATH_A)).toBe(true);
    expect(await cachedVideoIndex()).toEqual({ [PATH_A]: 2048 });
  });

  it("la misma ruta con otra firma no duplica la entrada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(1024)),
    );

    await downloadVideo(PATH_A, "https://firma/uno?token=viejo");
    await downloadVideo(PATH_A, "https://firma/uno?token=nuevo");

    expect(storage.stores.get(VIDEO_CACHE)?.entries.size).toBe(1);
  });

  it("reporta el avance por bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(4096)),
    );

    const seen: number[] = [];
    await downloadVideo(PATH_A, "https://firma/uno", {
      onBytes: (_delta, loaded) => seen.push(loaded),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(4096);
  });

  it("una respuesta con error no ensucia el caché", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 })),
    );

    expect(await downloadVideo(PATH_A, "https://firma/vencida")).toEqual({
      ok: false,
      reason: "network",
    });
    expect(await cachedVideoIndex()).toEqual({});
  });
});

describe("lote", () => {
  it("solo baja lo que falta y pide firmas frescas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(512)),
    );
    await downloadVideo(PATH_A, "https://firma/uno");

    const index = await cachedVideoIndex();
    const videos = [
      { path: PATH_A, bytes: 512 },
      { path: PATH_B, bytes: 512 },
    ];
    const pending = pendingVideos(videos, index);
    expect(pending).toEqual([{ path: PATH_B, bytes: 512 }]);

    const resolveUrls = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((path) => [path, `https://firma/${path}?token=fresco`])),
    );

    const progress: number[] = [];
    const result = await downloadVideos(pending, resolveUrls, {
      onProgress: (value) => progress.push(value.loadedBytes),
    });

    expect(resolveUrls).toHaveBeenCalledWith([PATH_B]);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toEqual([]);
    expect(progress.at(-1)).toBe(512);
    expect(Object.keys(await cachedVideoIndex()).sort()).toEqual([PATH_B, PATH_A].sort());
  });

  it("lo que no se pudo firmar se reporta y no detiene al resto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(256)),
    );

    const result = await downloadVideos(
      [
        { path: PATH_A, bytes: 256 },
        { path: PATH_B, bytes: 256 },
      ],
      async () => ({ [PATH_B]: "https://firma/dos" }),
    );

    expect(result.downloaded).toBe(1);
    expect(result.failed).toEqual([PATH_A]);
  });

  it("se puede cancelar a media descarga", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(256)),
    );

    const controller = new AbortController();
    controller.abort();

    const result = await downloadVideos(
      [{ path: PATH_A, bytes: 256 }],
      async (paths) => Object.fromEntries(paths.map((path) => [path, "https://firma/uno"])),
      { signal: controller.signal },
    );

    expect(result.aborted).toBe(true);
    expect(result.downloaded).toBe(0);
  });
});

describe("liberar espacio", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(1024)),
    );
  });

  it("borra por grupo", async () => {
    await downloadVideo(PATH_A, "https://firma/uno");
    await downloadVideo(PATH_B, "https://firma/dos");

    expect(await removeVideos([PATH_A])).toBe(1);
    expect(Object.keys(await cachedVideoIndex())).toEqual([PATH_B]);
  });

  it("borra todo", async () => {
    await downloadVideo(PATH_A, "https://firma/uno");
    await purgeVideoCache();
    expect(await cachedVideoIndex()).toEqual({});
  });
});

describe("reproducción", () => {
  it("devuelve un object URL cuando el video está en el teléfono", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => videoResponse(64)),
    );
    await downloadVideo(PATH_A, "https://firma/uno");

    expect(await cachedVideoUrl(PATH_A)).toBe("blob:fake");
    expect(await cachedVideoUrl(PATH_B)).toBeNull();
  });
});

describe("números para la UI", () => {
  it("suma el peso de una lista", () => {
    expect(totalBytes([{ path: PATH_A, bytes: 10 }, { path: PATH_B, bytes: 5 }])).toBe(15);
  });

  it("formatea en la unidad en que la gente piensa", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(4.5 * 1024 * 1024)).toBe("4.5 MB");
    expect(formatBytes(189 * 1024 * 1024)).toBe("189 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
