import { AuthScreen } from "@iefa/auth";
import { Card, CardContent } from "@iefa/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/auth/useAuth";
import supabase from "@/lib/supabase";

// Schema for URL search params
const authSearchSchema = z.object({
	redirect: z.string().optional(),
	tab: z.enum(["login", "register"]).optional().default("login"),
	token_hash: z.string().optional(),
	type: z.string().optional(),
});

export const Route = createFileRoute("/auth/")({
	validateSearch: authSearchSchema,
	component: AuthPage,
});

function AuthPage() {
	const { signIn, signUp, resetPassword, isAuthenticated, isLoading } =
		useAuth();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	// Actions adapter
	const actions = {
		signIn: async (email: string, password: string) => {
			await signIn(email, password);
		},
		signUp: async (email: string, password: string, name: string) => {
			await signUp(email, password, name);
		},
		resetPassword: async (email: string) => {
			await resetPassword(email);
		},
		updateUserPassword: async (password: string) => {
			const { error } = await supabase.auth.updateUser({
				password: password,
			});
			return { error: error ? new Error(error.message) : null };
		},
		verifyOtp: async (token_hash: string, type: "email") => {
			const { error } = await supabase.auth.verifyOtp({
				token_hash,
				type,
			});
			return { error: error ? new Error(error.message) : null };
		},
	};

	// Navigation adapter
	const handleNavigate = async (options: {
		to?: string;
		search?: any;
		replace?: boolean;
	}) => {
		await router.navigate(options as any);
	};

	const handleTabChange = (tab: "login" | "register") => {
		navigate({
			search: (prev) => ({ ...prev, tab }),
			replace: true,
		});
	};

	// Common styles reuse or just hardcode for wrapper
	const cardClasses =
		"w-full max-w-2xl justify-self-center border shadow-2xl rounded-3xl overflow-hidden bg-card text-card-foreground";

	if (isLoading) {
		return (
			<Card className={cardClasses}>
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin mr-2" />
					<span>Verificando autenticação...</span>
				</CardContent>
			</Card>
		);
	}

	return (
		<AuthScreen
			isLoading={isLoading}
			isAuthenticated={isAuthenticated}
			searchParams={search}
			onNavigate={handleNavigate}
			onTabChange={handleTabChange}
			actions={actions}
		/>
	);
}
