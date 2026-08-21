import Link from "next/link";
import { LogOut, Upload, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const admin = await requireAdmin();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <Link href="/admin" className="text-sm font-semibold uppercase tracking-widest text-primary">
          Coachy · Admin
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <Users /> Atletas
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
