import Link from "next/link";
import { ClipboardCheck, LogOut, Upload, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const admin = await requireAdmin();
  const pending = await prisma.decision.count({ where: { status: "PENDIENTE" } });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <Link
          href="/admin"
          aria-label="Holy Gains · Admin"
          className="flex items-baseline gap-2 text-primary"
        >
          <Wordmark className="text-base" />
          <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">· Admin</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <Users /> Atletas
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/decisiones">
              <ClipboardCheck /> Decisiones
              {pending > 0 ? <Badge variant="default">{pending}</Badge> : null}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/import">
              <Upload /> Importar
            </Link>
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label="Salir">
              <LogOut />
            </Button>
          </form>
        </nav>
      </header>

      <main className="flex-1 px-5 py-6">{children}</main>

      <footer className="px-5 py-4 text-xs text-muted-foreground">
        Sesión de {admin.email}
      </footer>
    </div>
  );
}
