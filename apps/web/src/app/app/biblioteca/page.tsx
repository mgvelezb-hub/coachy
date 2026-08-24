import { ExerciseLibraryView } from "@/app/app/biblioteca/exercise-library-view";
import { requireOnboardedUser } from "@/lib/auth";
import { exerciseLibrary } from "@/lib/exercise-library";

export const metadata = { title: "Biblioteca" };

/**
 * Repositorio de ejercicios por zona del cuerpo.
 *
 * El servidor firma los videos y mide el bucket; el cliente decide qué bajar y
 * lo guarda en Cache Storage bajo la ruta del ejercicio. Como las firmas
 * caducan, esta página no se puede cachear: `force-dynamic`. La copia que el
 * service worker guarda sirve para abrirla sin señal, y ahí los videos salen
 * del teléfono, no de las URLs viejas.
 */
export const dynamic = "force-dynamic";

export default async function BibliotecaPage(): Promise<React.JSX.Element> {
  await requireOnboardedUser();

  const library = await exerciseLibrary();

  return (
    <ExerciseLibraryView
      groups={library.groups}
      totalVideos={library.totalVideos}
      totalBytes={library.totalBytes}
      sizesKnown={library.sizesKnown}
    />
  );
}
