import { ImportForm } from "@/app/admin/import/import-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { IMPORT_EXAMPLE } from "@/lib/validation/import";

export const metadata = { title: "Importar historial" };

export default async function ImportPage(): Promise<React.JSX.Element> {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Importar historial</h1>
        <p className="text-sm text-muted-foreground">
          Carga los check-ins y decisiones previas de un atleta que ya tiene cuenta.
        </p>
      </header>

      <ImportForm />

      <Card>
        <CardHeader>
          <CardTitle>Formato</CardTitle>
          <CardDescription>
            `athleteEmail` debe corresponder a una cuenta existente. Los check-ins se identifican
            por fecha: reimportar el mismo archivo actualiza, no duplica.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
            {IMPORT_EXAMPLE}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
