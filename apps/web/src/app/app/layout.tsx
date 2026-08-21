import Link from "next/link";
import { CalendarCheck, LineChart, LogOut, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

const NAV = [
  { href: "/app", label: "Hoy", icon: CalendarCheck },
  { href: "/app/checkin", label: "Check-in", icon: CalendarCheck },
  { href: "/app/historial", label: "Historial", icon: LineChart },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const user = await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-5 py-3 backdrop-blur">
        <Link href="/app" className="text-sm font-semibold uppercase tracking-widest text-primary">
          Coachy
        </Link>
        <div className="flex items-center gap-1">
          {user.role === "ADMIN" ? (
            <Button asChild variant="ghost" size="icon" aria-label="Panel de admin">
              <Link href="/admin">
                <Shield />
              </Link>
            </Button>
          ) : null}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label="Salir">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-5 py-5">{children}</main>

      <nav className="sticky bottom-0 z-20 grid grid-cols-3 border-t bg-background/95 backdrop-blur safe-bottom">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
