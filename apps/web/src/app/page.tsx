import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { hasSupabaseCredentials } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";

export default async function LandingPage(): Promise<React.JSX.Element> {
  // Sin credenciales (build o repo recién clonado) mostramos la portada seca.
  if (hasSupabaseCredentials()) {
    const user = await getSessionUser();
    if (user) redirect(user.role === "ADMIN" ? "/admin" : "/app");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Coachy</p>
        <h1 className="text-3xl font-bold leading-tight">
          Tu coach, cada domingo, con números que sí explican por qué.
        </h1>
        <p className="text-muted-foreground">
          Registra medidas y fotos en menos de tres minutos. Coachy compara la semana contra la
          anterior y contra el día 1, y decide si el plan sigue igual o cambia.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button asChild size="lg">
          <Link href="/signup">Crear cuenta</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Ya tengo cuenta</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tus medidas y fotos son privadas. Las fotos viven en un bucket cifrado y solo se analizan
        con IA si tú lo autorizas explícitamente.
      </p>
    </main>
  );
}
