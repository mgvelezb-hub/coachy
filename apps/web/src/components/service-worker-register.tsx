"use client";

import { useEffect } from "react";

/** Registra el service worker una vez que la página cargó. */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = (): void => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
