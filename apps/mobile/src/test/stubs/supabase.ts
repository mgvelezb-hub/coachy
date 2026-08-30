/** Stub del cliente de Supabase: las pruebas puras no salen a la red. */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    signInWithPassword: async () => ({ data: null, error: null }),
  },
};
