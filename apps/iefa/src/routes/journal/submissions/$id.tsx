// Article Detail Page - Author's view of their submission

import { Button } from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Download, Edit, FileText, Users } from "lucide-react";
import { authQueryOptions } from "@/auth/service";
import { StatusBadge } from "@/components/journal/StatusBadge";
import { getArticleFileUrl } from "@/lib/journal/client";
import {
	articleAuthorsQueryOptions,
	articleVersionsQueryOptions,
	articleWithDetailsQueryOptions,
} from "@/lib/journal/hooks";

export const Route = createFileRoute("/journal/submissions/$id")({
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions());
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth" });
		}
		return { auth };
	},
	loader: async ({ params, context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				articleWithDetailsQueryOptions(params.id),
			),
			context.queryClient.ensureQueryData(
				articleAuthorsQueryOptions(params.id),
			),
			context.queryClient.ensureQueryData(
				articleVersionsQueryOptions(params.id),
			),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();

	const { data: article } = useSuspenseQuery(
		articleWithDetailsQueryOptions(id),
	);
	const { data: authors } = useSuspenseQuery(articleAuthorsQueryOptions(id));
	const { data: versions } = useSuspenseQuery(articleVersionsQueryOptions(id));

	const articleData = article.article;
	const canEdit =
		articleData.submitter_id === auth.user?.id &&
		(articleData.status === "draft" ||
			articleData.status === "revision_requested");

	return (
		<div className="container mx-auto max-w-5xl px-4 py-8">
			{/* Header */}
			<div className="mb-8">
				<div className="flex items-center gap-3 mb-4">
					<StatusBadge status={articleData.status} />
					<span className="text-sm text-muted-foreground">
						#{articleData.submission_number}
					</span>
				</div>

				<h1 className="text-3xl font-bold tracking-tight mb-2">
					{articleData.title_en || articleData.title_pt}
				</h1>

				<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
					<div className="flex items-center gap-1">
						<Calendar className="size-4" />
						{articleData.submitted_at
							? `Submetido em ${format(new Date(articleData.submitted_at), "dd MMMM yyyy", { locale: ptBR })}`
							: "Rascunho"}
					</div>
					<div className="flex items-center gap-1">
						<FileText className="size-4" />
						<span className="capitalize">{articleData.article_type}</span>
					</div>
				</div>

				{canEdit && (
					<div className="mt-4">
						<Link to="/journal/submit" search={{ articleId: articleData.id }}>
							<Button variant="outline">
								<Edit className="size-4 mr-2" />
								Editar Submissão
							</Button>
						</Link>
					</div>
				)}
			</div>

			{/* Metadata */}
			<div className="space-y-6">
				<div className="p-6 border rounded-lg">
					<h2 className="font-semibold text-lg mb-4">Metadados</h2>

					<div className="space-y-4">
						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">
								Título (PT)
							</h3>
							<p>{articleData.title_pt}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">
								Title (EN)
							</h3>
							<p>{articleData.title_en}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">
								Resumo (PT)
							</h3>
							<p className="text-sm">{articleData.abstract_pt}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">
								Palavras-chave
							</h3>
							<div className="flex flex-wrap gap-2">
								{articleData.keywords_pt?.map((kw, i) => (
									<span
										key={i}
										className="px-2 py-1 bg-primary/10 text-primary rounded text-sm"
									>
										{kw}
									</span>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Authors */}
				<div className="p-6 border rounded-lg">
					<h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
						<Users className="size-5" />
						Autores ({authors.length})
					</h2>

					<div className="space-y-3">
						{authors.map((author) => (
							<div
								key={author.id}
								className="flex items-start gap-3 p-3 bg-muted rounded"
							>
								<div className="font-medium">{author.author_order}.</div>
								<div className="flex-1">
									<div className="font-medium">
										{author.full_name}
										{author.is_corresponding && (
											<span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
												Correspondente
											</span>
										)}
									</div>
									{author.affiliation && (
										<div className="text-sm text-muted-foreground">
											{author.affiliation}
										</div>
									)}
									{author.email && (
										<div className="text-xs text-muted-foreground">
											{author.email}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Files */}
				{versions.length > 0 && (
					<div className="p-6 border rounded-lg">
						<h2 className="font-semibold text-lg mb-4">
							Arquivos (Versão {versions[0].version_number})
						</h2>

						<div className="space-y-2">
							{versions[0].pdf_path && (
								<a
									href={getArticleFileUrl(
										"journal-submissions",
										versions[0].pdf_path,
									)}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 p-3 border rounded hover:bg-accent"
								>
									<Download className="size-4" />
									<span>Manuscrito (PDF)</span>
								</a>
							)}

							{versions[0].source_path && (
								<a
									href={getArticleFileUrl(
										"journal-submissions",
										versions[0].source_path,
									)}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 p-3 border rounded hover:bg-accent"
								>
									<Download className="size-4" />
									<span>Arquivo Fonte</span>
								</a>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
