"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import supabase from "../utils/supabase.client";
import { normalizeAuthError, getAuthErrorMessage } from "./errors";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    redirectTo?: string
  ) => Promise<void>;
  signOut: (opts?: { redirectTo?: string; reload?: boolean }) => Promise<void>;
  resetPassword: (email: string, redirectTo?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleAuthChange = useCallback(async (s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Error getting initial session:", error);
        if (mounted) await handleAuthChange(data?.session ?? null);
      } catch (e) {
        console.error("Error initializing auth:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      handleAuthChange(s ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const normalized = normalizeAuthError(error);
      const err: any = new Error(normalized.message);
      err.code = normalized.code;
      err.status = (error as any)?.status;
      throw err;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, redirectTo?: string) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo:
            redirectTo ?? `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw new Error(getAuthErrorMessage(error));
    },
    []
  );

  const signOut = useCallback(
    async (opts?: { redirectTo?: string; reload?: boolean }) => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Sign out error:", e);
      } finally {
        if (opts?.reload) {
          window.location.assign(opts.redirectTo ?? "/login");
        }
      }
    },
    []
  );

  const resetPassword = useCallback(
    async (email: string, redirectTo?: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo:
            redirectTo ?? `${window.location.origin}/auth/reset-password`,
        }
      );
      if (error) throw new Error(getAuthErrorMessage(error));
    },
    []
  );

  const refreshSession = useCallback(async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw new Error(getAuthErrorMessage(error));
  }, []);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    resetPassword,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
