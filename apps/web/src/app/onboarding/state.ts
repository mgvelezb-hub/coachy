/**
 * Estado del formulario. Vive fuera del archivo "use server": desde ahí
 * solo pueden exportarse funciones, y un objeto exportado llega vacío al cliente.
 */
export type OnboardingState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

export const EMPTY_ONBOARDING_STATE: OnboardingState = { error: null, fieldErrors: {} };
