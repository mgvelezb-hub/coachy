"use client";

import type * as React from "react";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster(): React.JSX.Element {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border bg-card text-card-foreground shadow-lg",
          success: "border-pr/45 [&_[data-icon]]:text-pr",
          error: "border-destructive/50 [&_[data-icon]]:text-destructive",
          title: "font-medium",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
