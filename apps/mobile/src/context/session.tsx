import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";
import { purgeTrainingData } from "@/lib/training-db";
import { purgeVideoDownloads } from "@/lib/video-downloads";

type SessionContextValue = {
  session: Session | null;
  /** true mientras se resuelve la sesión inicial guardada en AsyncStorage. */
  loading: boolean;
};

const SessionContext = createContext<SessionContextValue>({ session: null, loading: true });

/**
 * Provee la sesión de Supabase a toda la app y la mantiene sincronizada con
 * `onAuthStateChange` (login, logout, refresh de token). El guard de rutas en
 * `_layout.tsx` decide qué mostrar según `session`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      // Cubre tanto el botón de "cerrar sesión" como el signOut forzado por un
      // 401 en `apiFetch` (apps/mobile/src/lib/api.ts): ambos pasan por
      // `supabase.auth.signOut()`, que dispara este mismo evento. Lo del
      // gimnasio y los videos descargados de una atleta no pueden seguir en
      // el teléfono para la siguiente sesión que abra.
      if (event === "SIGNED_OUT") {
        void purgeTrainingData();
        purgeVideoDownloads();
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
