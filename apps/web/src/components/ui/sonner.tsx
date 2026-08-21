"use client";

import type * as React from "react";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster(): React.JSX.Element {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-xl border bg-card text-card-foreground shadow-lg",
        },
      }}
    />
  );
}
