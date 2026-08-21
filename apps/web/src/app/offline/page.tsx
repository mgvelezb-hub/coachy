export const metadata = { title: "Sin conexión" };

export default function OfflinePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Sin conexión</h1>
      <p className="text-muted-foreground">
        No hay internet ahorita. Si estabas llenando tu check-in, lo que escribiste quedó guardado
        en este teléfono: vuelve a abrir la pantalla cuando haya señal y sigue donde ibas.
      </p>
    </main>
  );
}
