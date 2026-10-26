import { useEffect, useState } from "react";

// Preserve the small auth surface the app currently consumes while its UI is
// moved from Better Auth to Supabase Auth.
export function createSupabaseAuthClient(supabase) {
  return {
    useSession() {
      const [session, setSession] = useState(null);
      const [isPending, setIsPending] = useState(true);
      useEffect(() => {
        let active = true;
        supabase.auth.getSession().then(({ data }) => {
          if (active) {
            setSession(data.session);
            setIsPending(false);
          }
        });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
          if (active) {
            setSession(next);
            setIsPending(false);
          }
        });
        return () => {
          active = false;
          listener.subscription.unsubscribe();
        };
      }, []);
      const user = session?.user;
      return {
        data: user ? { user: { ...user, name: user.user_metadata?.name || user.email || "Member" } } : null,
        isPending,
      };
    },
    signUp: {
      email: async ({ name, email, password }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: window.location.origin },
        });
        return { data, error };
      },
    },
    signIn: {
      email: async ({ email, password }) => {
        const firstAttempt = await supabase.auth.signInWithPassword({ email, password });
        if (!firstAttempt.error) return firstAttempt;
        if (
          firstAttempt.error.code !== "invalid_credentials" &&
          !/invalid login credentials/i.test(firstAttempt.error.message || "")
        ) return firstAttempt;

        // Existing Better Auth passwords are checked server-side against the
        // imported scrypt hash, then upgraded into Supabase Auth on first login.
        const { data: migration, error: migrationError } = await supabase.functions
          .invoke("migrate-legacy-password", { body: { email, password } });
        if (migrationError) {
          const details = await migrationError.context?.json?.().catch(() => null);
          if (details?.error && !/invalid email or password/i.test(details.error)) {
            return { data: null, error: new Error(details.error) };
          }
          return firstAttempt;
        }
        if (!migration?.migrated) return firstAttempt;
        return await supabase.auth.signInWithPassword({ email, password });
      },
      social: async ({ provider, callbackURL }) => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackURL },
        });
        return { data, error };
      },
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      return { error };
    },
    requestPasswordReset: async ({ email, redirectTo }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      return { error };
    },
    resetPassword: async ({ newPassword }) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error };
    },
    convex: {
      token: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.access_token || null;
      },
    },
  };
}
