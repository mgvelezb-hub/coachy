import Link from "next/link";

import { SignupForm } from "@/app/signup/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Crear cuenta" };

export default function SignupPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <Link href="/" aria-label="Coachy">
        <Wordmark rule className="text-lg text-primary" />
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Crea tu cuenta</CardTitle>
          <CardDescription>
            Después te hacemos unas preguntas rápidas para armar tu punto de partida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </main>
  );
}
