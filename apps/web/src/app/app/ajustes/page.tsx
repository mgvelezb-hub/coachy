import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Ajustes" };

export default function AjustesPage(): React.JSX.Element {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Personaliza cómo se ve Coachy en tu teléfono.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apariencia</CardTitle>
          <CardDescription>
            "Sistema" sigue el modo de tu teléfono. "Ejecutivo" es un tema negro con acentos en oro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
