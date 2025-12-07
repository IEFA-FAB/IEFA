import type { AuthContextType } from "@/types/auth";
import supabase from "@/utils/supabase";

export type { AuthContextType };

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

// Error handling helpers (simplified from packages/auth)
function getAuthErrorMessage(error: unknown): string {
	const msg =
		error && typeof error === "object" && "message" in error
			? (error as { message: string }).message
			: "Erro desconhecido";

	if (/invalid login credentials/i.test(msg))
		return "Email ou senha incorretos";
	if (/email not confirmed/i.test(msg))
		return "Por favor, confirme seu email antes de fazer login";
	if (/user already registered/i.test(msg))
		return "Este email já está cadastrado";
	if (/password should be at least 6 characters/i.test(msg))
		return "A senha deve ter pelo menos 6 caracteres";
	if (/invalid format/i.test(msg)) return "Formato de email inválido";
	if (/signup is disabled/i.test(msg))
		return "Cadastro temporariamente desabilitado";
	return msg;
}

export const authActions = {
	signIn: async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({
			email: normalizeEmail(email),
			password,
		});
		if (error) throw new Error(getAuthErrorMessage(error));
	},

	signUp: async (email: string, password: string, redirectTo?: string) => {
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
	},

	signOut: async (opts?: { redirectTo?: string; reload?: boolean }) => {
		await supabase.auth.signOut();
		if (opts?.reload && typeof window !== "undefined") {
			window.location.assign(opts.redirectTo ?? "/login");
		}
	},

	resetPassword: async (email: string, redirectTo?: string) => {
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
	},

	refreshSession: async () => {
		const { error } = await supabase.auth.refreshSession();
		if (error) throw new Error(getAuthErrorMessage(error));
	},
};
