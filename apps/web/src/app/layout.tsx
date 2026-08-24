import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/** Serif clásica romana de Holy Gains: títulos y logotipo. El cuerpo sigue en sans. */
const serifDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-serif-display",
});

export const metadata: Metadata = {
  title: {
    default: "Coachy",
    template: "%s · Coachy",
  },
  description: "Tu coach virtual: check-in semanal, medidas, fotos de progreso y plan de la semana.",
  applicationName: "Coachy",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Coachy",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0a14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="es-MX" className={serifDisplay.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
