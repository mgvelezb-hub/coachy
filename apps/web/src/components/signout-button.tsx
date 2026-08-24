"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Salir de la sesión, borrando antes lo que el modo gimnasio dejó en el
 * teléfono: el caché del service worker con la rutina y la base local con la
 * semana y la cola de sincronización.
 *
 * Si algo de eso falla igual se cierra la sesión — nunca se atora a alguien
 * dentro de la app por un caché.
 */
export function SignOutButton(): React.JSX.Element {
  const form = useRef<HTMLFormElement>(null);

  async function purgeLocalData(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker?.ready;
      registration?.active?.postMessage({ type: "purge-training" });
    } catch {
      // Sin service worker no hay nada que purgar.
    }
    try {
      indexedDB?.deleteDatabase("coachy-training");
    } catch {
      // Idem.
    }
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("coachy:training")) window.localStorage.removeItem(key);
      }
    } catch {
      // Idem.
    }
  }

  return (
    <form
      ref={form}
      action="/auth/signout"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        void purgeLocalData().finally(() => form.current?.submit());
      }}
    >
      <Button type="submit" variant="ghost" size="icon" aria-label="Salir">
        <LogOut />
      </Button>
    </form>
  );
}
