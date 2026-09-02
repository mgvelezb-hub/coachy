import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getMe } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { purgeTrainingData } from "@/lib/training-db";
import { purgeVideoDownloads } from "@/lib/video-downloads";

type SessionContextValue = {
  session: Session | null;
  /** true mientras se resuelve la sesión inicial guardada en AsyncStorage. */
  loading: boolean;
  /**
   * `null` mientras no se sabe con certeza (sin sesión, o el primer `GET
   * /me` todavía no vuelve). El guard de rutas en `_layout.tsx` no manda a
   * nadie a `/onboarding` hasta que esto sea `false` de verdad — mandar a
   * medio mundo ahí solo porque la consulta no ha vuelto sería peor que
   * esperar un instante de más.
   */
  onboarded: boolean | null;
  /**
   * Vuelve a consultar `GET /me`. La pantalla de `app/onboarding/index.tsx`
   * la llama al terminar el cuestionario: sin esto, el guard seguiría
   * creyendo que falta el perfil hasta el siguiente evento de auth, que
   * puede tardar en llegar (o no llegar nunca, si la sesión ya estaba
   * abierta desde antes).
   */
  refreshOnboarded: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  onboarded: null,
  refreshOnboarded: async () => undefined,
});

/**
 * Provee la sesión de Supabase a toda la app y la mantiene sincronizada con
 * `onAuthStateChange` (login, logout, refresh de token). El guard de rutas en
 * `_layout.tsx` decide qué mostrar según `session`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const refreshOnboarded = useCallback(async () => {
    try {
      const me = await getMe();
      setOnboarded(me.onboarded);
    } catch {
      // Un `GET /me` caído no debe dejar a nadie atorado en /onboarding: se
      // asume completo, y si de verdad falta, el próximo endpoint que sí lo
      // exija regresa su 403 de siempre — eso ya lo manejan las pantallas.
      setOnboarded(true);
    }
  }, []);

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
        setOnboarded(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Un `userId` distinto (login → logout → login con otra cuenta) también
  // debe recalcular esto; comparar por `session?.user.id` y no por el
  // objeto `session` evita repetir la consulta en cada refresh de token.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setOnboarded(null);
      return;
    }
    void refreshOnboarded();
  }, [userId, refreshOnboarded]);

  return (
    <SessionContext.Provider value={{ session, loading, onboarded, refreshOnboarded }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
