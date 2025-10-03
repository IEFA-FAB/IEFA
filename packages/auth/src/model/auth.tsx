// app/auth/auth.tsx
import { normalizeAuthError, getAuthErrorMessage } from "./errors";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import supabase from "../utils/supabase";
import { type User, type Session } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle authentication state changes
  const handleAuthChange = useCallback(async (session: Session | null) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting initial session:", error);
        }
        if (mounted) {
          await handleAuthChange(session ?? null);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Alguns ambientes disparam 'INITIAL_SESSION' ao assinar
      // Outros disparam 'SIGNED_IN'/'TOKEN_REFRESHED' etc.
      if (!mounted) return;
      await handleAuthChange(session ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  // Sign in with enhanced error handling
  const signIn = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      console.debug("Supabase signIn error:", {
        name: (error as any)?.name,
        status: (error as any)?.status,
        message: error.message,
      });
      const normalized = normalizeAuthError(error);
      const err: any = new Error(normalized.message);
      err.code = normalized.code;
      err.status = (error as any)?.status;
      throw err;
    }
  };

  // Sign up with enhanced error handling
  const signUp = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw new Error(getAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out with cleanup
  const signOut = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) console.error("Sign out error:", error);
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Limpa estado local do app
      setUser(null);
      setSession(null);
      // Limpa apenas o que seu app criou
      localStorage.removeItem("fab_remember_email");
      sessionStorage.removeItem("auth:redirectTo");
      setIsLoading(false);
      window.location.href = "/login";
    }
  };

  // Reset password
  const resetPassword = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }
    );

    if (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  // Refresh session
  const refreshSession = async (): Promise<void> => {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

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
};

// Custom hook with additional utilities
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Additional utility hooks
export const useRequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectTo = encodeURIComponent(
        `${location.pathname}${location.search}`
      );
      navigate(`/login?redirectTo=${redirectTo}`, { replace: true });
    }
  }, [
    isAuthenticated,
    isLoading,
    location.pathname,
    location.search,
    navigate,
  ]);

  return { isAuthenticated, isLoading };
};

export const useUserInfo = () => {
  const { user, isLoading } = useAuth();
  return {
    user,
    isLoading,
    email: user?.email,
    id: user?.id,
  };
};
