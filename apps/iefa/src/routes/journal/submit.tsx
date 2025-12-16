import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { authQueryOptions } from "@/auth/service";
import { SubmissionForm } from "@/components/journal/SubmissionForm";
import { userProfileQueryOptions } from "@/lib/journal/hooks";
import { submitArticle } from "@/lib/journal/submission";

export const Route = createFileRoute("/journal/submit")({
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions());
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth" });
		}
		return { auth };
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions());
		if (auth.user) {
			// Pre-load user profile
			await context.queryClient.ensureQueryData(
				userProfileQueryOptions(auth.user.id),
			);
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: profile } = useSuspenseQuery(
		userProfileQueryOptions(auth.user?.id || ""),
	);

	if (!auth.user) {
		return null;
	}

	const handleSubmit = async (formData: any) => {
		setIsSubmitting(true);
		setError(null);

		try {
			const result = await submitArticle(formData, auth.user!.id);

			if (!result.success) {
				setError(result.error || "Erro ao submeter artigo");
				setIsSubmitting(false);
				return;
			}

			// Success - navigate to submission detail
			await navigate({
				to: "/journal/submissions/$id",
				params: { id: result.article!.id },
			});
		} catch (err) {
			console.error("Submission error:", err);
			setError("Erro inesperado ao submeter artigo");
			setIsSubmitting(false);
		}
	};

	// Initial data pre-filled from profile
	const initialData = {
		authors: [
			{
				full_name: profile?.full_name || "",
				email: auth.user.email || "",
				affiliation: profile?.affiliation || "",
				orcid: profile?.orcid || "",
				is_corresponding: true,
			},
		],
	};

	return (
		<div className="container mx-auto max-w-5xl px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold tracking-tight">
					Nova Submissão de Artigo
				</h1>
				<p className="mt-2 text-muted-foreground">
					Preen all as informações solicitadas para submeter seu artigo para
					revisão por pares.
				</p>
			</div>

			{error && (
				<div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
					<p className="text-destructive font-medium">{error}</p>
				</div>
			)}

			{isSubmitting ? (
				<div className="flex flex-col items-center justify-center py-12">
					<Loader2 className="size-12 animate-spin text-primary mb-4" />
					<p className="text-lg font-medium">Submetendo artigo...</p>
					<p className="text-sm text-muted-foreground mt-2">
						Fazendo upload de arquivos e criando registro
					</p>
				</div>
			) : (
				<SubmissionForm
					userId={auth.user.id}
					initialData={initialData}
					onSubmit={handleSubmit}
				/>
			)}
		</div>
	);
}
