import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Refresh } from "iconoir-react"
import { useState } from "react"
import { z } from "zod"
import { authQueryOptions } from "@/auth/service"
import type { SubmissionFormData } from "@/components/journal/SubmissionForm/SubmissionForm"
import { SubmissionForm } from "@/components/journal/SubmissionForm/SubmissionForm"
import { userActiveDraftQueryOptions, userProfileQueryOptions } from "@/lib/journal/hooks"
import { submitArticleFn } from "@/server/journal.fn"

const searchSchema = z.object({
	step: z.coerce.number().int().min(1).max(6).catch(1),
})

export const Route = createFileRoute("/journal/submit")({
	validateSearch: searchSchema,
	staticData: {
		nav: {
			title: "Nova submissão",
			section: "Minha área",
			subtitle: "Enviar um novo artigo para avaliação",
			keywords: ["submeter", "artigo", "envio", "nova submissao"],
			access: "authenticated",
			order: 80,
		},
	},
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated || !auth.user) {
			throw redirect({ to: "/auth" })
		}
		// Type assertion: after the guard, we know user is non-null
		return { auth: auth as typeof auth & { user: NonNullable<typeof auth.user> } }
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (auth.user) {
			// Pre-load user profile and active draft in parallel
			await Promise.all([
				context.queryClient.ensureQueryData(userProfileQueryOptions(auth.user.id)),
				context.queryClient.ensureQueryData(userActiveDraftQueryOptions(auth.user.id)),
			])
		}
	},
	component: RouteComponent,
})

function RouteComponent() {
	const { auth } = Route.useRouteContext()
	const { step } = Route.useSearch()
	const navigate = useNavigate()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleStepChange = (next: number) => {
		navigate({ to: "/journal/submit", search: { step: next } })
	}

	const { data: profile } = useSuspenseQuery(userProfileQueryOptions(auth.user.id))
	const { data: draft } = useSuspenseQuery(userActiveDraftQueryOptions(auth.user.id))

	const handleSubmit = async (formData: SubmissionFormData, articleId: string) => {
		setIsSubmitting(true)
		setError(null)

		const { article_type, subject_area, title_pt, title_en, abstract_pt, abstract_en, keywords_pt, keywords_en, authors, conflict_of_interest } = formData
		if (
			!article_type ||
			!subject_area ||
			!title_pt ||
			!title_en ||
			!abstract_pt ||
			!abstract_en ||
			!keywords_pt ||
			!keywords_en ||
			!authors ||
			!conflict_of_interest
		) {
			setError("Preencha todos os campos obrigatórios antes de submeter")
			setIsSubmitting(false)
			return
		}

		try {
			const result = await submitArticleFn({
				data: {
					articleId,
					userId: auth.user.id,
					article_type,
					subject_area,
					title_pt,
					title_en,
					abstract_pt,
					abstract_en,
					keywords_pt,
					keywords_en,
					authors,
					conflict_of_interest,
					funding_info: formData.funding_info,
					data_availability: formData.data_availability,
					has_ethics_approval: formData.has_ethics_approval ?? false,
					ethics_approval: formData.ethics_approval,
				},
			})

			await navigate({
				to: "/journal/submissions/$id",
				params: { id: result.articleId },
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro inesperado ao submeter artigo")
			setIsSubmitting(false)
		}
	}

	// Seed initial data: draft takes priority over profile defaults
	const defaultAuthor = {
		full_name: profile?.full_name || "",
		email: auth.user.email || "",
		affiliation: profile?.affiliation || "",
		orcid: profile?.orcid || "",
		is_corresponding: true,
	}

	const initialData: SubmissionFormData = draft
		? {
				article_type: draft.article.article_type,
				subject_area: draft.article.subject_area || undefined,
				title_pt: draft.article.title_pt || undefined,
				title_en: draft.article.title_en || undefined,
				abstract_pt: draft.article.abstract_pt || undefined,
				abstract_en: draft.article.abstract_en || undefined,
				keywords_pt: draft.article.keywords_pt?.length ? draft.article.keywords_pt : undefined,
				keywords_en: draft.article.keywords_en?.length ? draft.article.keywords_en : undefined,
				conflict_of_interest: draft.article.conflict_of_interest || undefined,
				funding_info: draft.article.funding_info || undefined,
				data_availability: draft.article.data_availability || undefined,
				has_ethics_approval: !!draft.article.ethics_approval,
				ethics_approval: draft.article.ethics_approval || undefined,
				authors:
					draft.authors.length > 0
						? draft.authors.map((a) => ({
								full_name: a.full_name,
								email: a.email || undefined,
								affiliation: a.affiliation || undefined,
								orcid: a.orcid || undefined,
								is_corresponding: a.is_corresponding,
							}))
						: [defaultAuthor],
				// Restore file paths from the saved version record
				pdf_path: draft.version?.pdf_path || undefined,
				source_path: draft.version?.source_path || undefined,
				supplementary_paths: draft.version?.supplementary_paths ?? undefined,
			}
		: { authors: [defaultAuthor] }

	return (
		<div className="container mx-auto max-w-5xl px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold tracking-tight">Nova Submissão de Artigo</h1>
				<p className="mt-2 text-muted-foreground">Preen all as informações solicitadas para submeter seu artigo para revisão por pares.</p>
			</div>

			{error && (
				<div className="mb-6 p-4 bg-destructive/10 border border-destructive">
					<p className="text-destructive font-medium">{error}</p>
				</div>
			)}

			{isSubmitting ? (
				<div className="flex flex-col items-center justify-center py-12">
					<Refresh className="size-12 animate-spin text-primary mb-4" />
					<p className="text-lg font-medium">Submetendo artigo...</p>
					<p className="text-sm text-muted-foreground mt-2">Fazendo upload de arquivos e criando registro</p>
				</div>
			) : (
				<SubmissionForm
					userId={auth.user.id}
					initialData={initialData}
					articleId={draft?.article.id}
					step={step}
					onStepChange={handleStepChange}
					onSubmit={handleSubmit}
				/>
			)}
		</div>
	)
}
