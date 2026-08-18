'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase-client';
import { migrateLocalDataToSupabase, type MigrationResult } from './migrate-from-local';

export type MigrationStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'success'; result: MigrationResult }
  | { state: 'error'; error: string };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  migration: MigrationStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryMigration: () => Promise<void>;
  dismissMigration: () => void;
}

// How long to wait for the initial getSession() before giving up and treating
// the visitor as signed out. auth-js retries a token refresh internally, so an
// unreachable Supabase host leaves the promise pending far longer than any
// user will wait staring at a spinner.
const AUTH_INIT_TIMEOUT_MS = 8000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [migration, setMigration] = useState<MigrationStatus>({ state: 'idle' });

  const runMigration = useCallback(async (userId: string) => {
    setMigration({ state: 'running' });
    try {
      const result = await migrateLocalDataToSupabase(userId);
      if (result.skipped) {
        setMigration({ state: 'idle' });
      } else {
        setMigration({ state: 'success', result });
      }
    } catch (err) {
      const supabaseErr = err as { message?: string; details?: string; hint?: string; code?: string };
      console.error('Migration failed:', {
        message: supabaseErr?.message,
        details: supabaseErr?.details,
        hint: supabaseErr?.hint,
        code: supabaseErr?.code,
        raw: err,
      });
      setMigration({
        state: 'error',
        error: supabaseErr?.message ?? (err instanceof Error ? err.message : String(err)),
      });
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let settled = false;

    // Resolve the initial auth check exactly once, however it turns out. If this
    // is skipped, `loading` never flips and every page renders a spinner with no
    // way out: a paused Supabase project drops its DNS record, so the token
    // refresh that getSession() kicks off neither resolves nor rejects promptly.
    // Declared as a hoisted function so it can reference initTimeout below.
    function settle(nextSession: Session | null) {
      if (cancelled || settled) return;
      settled = true;
      clearTimeout(initTimeout);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    }

    const initTimeout = setTimeout(() => {
      if (cancelled || settled) return;
      console.error(
        `Auth: getSession() did not respond within ${AUTH_INIT_TIMEOUT_MS}ms; ` +
          'treating the visitor as signed out. Check that the Supabase project ' +
          'is reachable — a paused project stops resolving in DNS.'
      );
      settle(null);
    }, AUTH_INIT_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.error('Auth: getSession() returned an error:', error);
        settle(data.session);
      })
      .catch((err) => {
        console.error('Auth: getSession() failed:', err);
        settle(null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
      if (event === 'SIGNED_IN' && newSession?.user) {
        void runMigration(newSession.user.id);
      }
      if (event === 'SIGNED_OUT') {
        setMigration({ state: 'idle' });
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(initTimeout);
      sub.subscription.unsubscribe();
    };
  }, [runMigration]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    // The confirmation email link must land back on the app's base path.
    // Without emailRedirectTo, Supabase uses its project-level Site URL
    // (e.g. http://localhost:3000/) and the user hits a 404 because the app
    // is mounted at /sallary-people via next.config.ts basePath.
    const emailRedirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/sallary-people/`
        : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const retryMigration = useCallback(async () => {
    if (user) await runMigration(user.id);
  }, [user, runMigration]);

  const dismissMigration = useCallback(() => {
    setMigration({ state: 'idle' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        migration,
        signIn,
        signUp,
        signOut,
        retryMigration,
        dismissMigration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
