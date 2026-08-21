import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Empecemos" };

export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const user = await requireUser();

  if (user.profile?.onboardingCompletedAt) redirect("/app");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <header className="mb-6 space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Coachy</p>
        <h1 className="text-2xl font-bold leading-tight">Cuéntame de ti</h1>
        <p className="text-sm text-muted-foreground">
          Son dos minutos. Con esto armo tu punto de partida y la primera versión de tu plan.
        </p>
      </header>

      <OnboardingForm email={user.email} />
    </main>
  );
}
