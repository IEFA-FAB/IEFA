import { ResetPasswordScreen } from "@iefa/auth";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import supabase from "@/utils/supabase";

const resetPasswordSearchSchema = z.object({
	token_hash: z.string().optional(),
	type: z.string().optional(),
});

export const Route = createFileRoute("/auth/reset-password")({
	validateSearch: resetPasswordSearchSchema,
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const router = useRouter();
	const search = Route.useSearch();

	const actions = {
		verifyOtp: async (token_hash: string, type: "recovery") => {
			const { error } = await supabase.auth.verifyOtp({
				token_hash,
				type,
			});
			return { error: error ? new Error(error.message) : null };
		},
		updatePassword: async (password: string) => {
			const { error } = await supabase.auth.updateUser({
				password,
			});
			return { error: error ? new Error(error.message) : null };
		},
	};

	const handleNavigate = (options: {
		to?: string;
		search?: Record<string, unknown>;
	}) => {
		router.navigate(options as Parameters<typeof router.navigate>[0]);
	};

	return (
		<ResetPasswordScreen
			searchParams={search}
			actions={actions}
			onNavigate={handleNavigate}
			forgotPasswordPath="/auth"
		/>
	);
}
