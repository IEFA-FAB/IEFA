"use client";

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getAuthErrorMessage, normalizeAuthError } from "./errors";

export interface AuthContextType {
	user: User | null;
	session: Session | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (
		email: string,
		password: string,
		redirectTo?: string,
	) => Promise<void>;
	signOut: (opts?: { redirectTo?: string; reload?: boolean }) => Promise<void>;
	resetPassword: (email: string, redirectTo?: string) => Promise<void>;
	refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps<
	DB = any,
	SN extends
		| (string & Exclude<keyof DB, "__InternalSupabase">)
		| { PostgrestVersion: string } = "public",
> {
	supabase: SupabaseClient<DB, SN>;
	children: ReactNode;
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

export function AuthProvider<
	DB = any,
	SN extends
		| (string & Exclude<keyof DB, "__InternalSupabase">)
		| { PostgrestVersion: string } = "public",
>({ supabase, children }: AuthProviderProps<DB, SN>) {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const mountedRef = useRef(true);

	const handleAuthChange = useCallback((s: Session | null) => {
		setSession(s);
		setUser(s?.user ?? null);
	}, []);

	useEffect(() => {
		mountedRef.current = true;

		(async () => {
			try {
				const { data, error } = await supabase.auth.getSession();
				if (error) {
					console.error("Error getting initial session:", error);
				}
				if (mountedRef.current) {
					handleAuthChange(data?.session ?? null);
				}
			} catch (e) {
				console.error("Error initializing auth:", e);
			} finally {
				if (mountedRef.current) setIsLoading(false);
			}
		})();

		const { data } = supabase.auth.onAuthStateChange((_event, s) => {
			if (!mountedRef.current) return;
			handleAuthChange(s ?? null);
			setIsLoading(false);
		});

		return () => {
			mountedRef.current = false;
			data.subscription.unsubscribe();
		};
	}, [supabase, handleAuthChange]);

	const signIn = useCallback(
		async (email: string, password: string) => {
			try {
				const { error } = await supabase.auth.signInWithPassword({
					email: normalizeEmail(email),
					password,
				});
				if (error) {
					const normalized = normalizeAuthError(error);
					const err: any = new Error(normalized.message);
					err.code = normalized.code;
					err.status = (error as any)?.status;
					throw err;
				}
			} catch (e: any) {
				// Garante mensagem amigável mesmo para erros inesperados
				if (e?.message) throw e;
				throw new Error("Não foi possível entrar. Tente novamente mais tarde.");
			}
		},
		[supabase],
	);

	const signUp = useCallback(
		async (email: string, password: string, redirectTo?: string) => {
			try {
				const { error } = await supabase.auth.signUp({
					email: normalizeEmail(email),
					password,
					options: {
						emailRedirectTo:
							redirectTo ??
							(typeof window !== "undefined"
								? `${window.location.origin}/auth/callback`
								: undefined),
					},
				});
				if (error) throw new Error(getAuthErrorMessage(error));
			} catch (e: any) {
				if (e?.message) throw e;
				throw new Error(
					"Não foi possível cadastrar. Tente novamente mais tarde.",
				);
			}
		},
		[supabase],
	);

	const signOut = useCallback(
		async (opts?: { redirectTo?: string; reload?: boolean }) => {
			try {
				// Otimista: já limpa o estado local
				handleAuthChange(null);
				const { error } = await supabase.auth.signOut();
				if (error) {
					console.error("Sign out error:", error);
				}
			} catch (e) {
				console.error("Sign out error:", e);
			} finally {
				if (opts?.reload && typeof window !== "undefined") {
					window.location.assign(opts.redirectTo ?? "/login");
				}
			}
		},
		[supabase, handleAuthChange],
	);

	const resetPassword = useCallback(
		async (email: string, redirectTo?: string) => {
			try {
				const { error } = await supabase.auth.resetPasswordForEmail(
					normalizeEmail(email),
					{
						redirectTo:
							redirectTo ??
							(typeof window !== "undefined"
								? `${window.location.origin}/auth/reset-password`
								: undefined),
					},
				);
				if (error) throw new Error(getAuthErrorMessage(error));
			} catch (e: any) {
				if (e?.message) throw e;
				throw new Error("Não foi possível iniciar a recuperação de senha.");
			}
		},
		[supabase],
	);

	const refreshSession = useCallback(async () => {
		const { data, error } = await supabase.auth.refreshSession();
		if (error) throw new Error(getAuthErrorMessage(error));
		// Atualiza o estado com a sessão renovada (se houver)
		handleAuthChange(data?.session ?? null);
	}, [supabase, handleAuthChange]);

	const value = useMemo<AuthContextType>(
		() => ({
			user,
			session,
			isLoading,
			isAuthenticated: !!session?.user,
			signIn,
			signUp,
			signOut,
			resetPassword,
			refreshSession,
		}),
		[
			user,
			session,
			isLoading,
			signIn,
			signUp,
			signOut,
			resetPassword,
			refreshSession,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
	return ctx;
};
