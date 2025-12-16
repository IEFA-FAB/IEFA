// Author Dashboard - List all user's article submissions

import { Button, Input } from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { authQueryOptions } from "@/auth/service";
import { ArticleCard } from "@/components/journal/ArticleCard";
import { articlesQueryOptions } from "@/lib/journal/hooks";
import type { ArticleStatus } from "@/lib/journal/types";

const STATUS_FILTERS: { value: ArticleStatus | "all"; label: string }[] = [
	{ value: "all", label: "Todos" },
	{ value: "draft", label: "Rascunhos" },
	{ value: "submitted", label: "Submetidos" },
	{ value: "under_review", label: "Em Revisão" },
	{ value: "revision_requested", label: "Revisão Solicitada" },
	{ value: "accepted", label: "Aceitos" },
	{ value: "published", label: "Publicados" },
];

export const Route = createFileRoute("/journal/submissions/")({
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
			await context.queryClient.ensureQueryData(
				articlesQueryOptions({ submitter_id: auth.user.id }),
			);
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { auth } = Route.useRouteContext();
	const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">(
		"all",
	);
	const [searchQuery, setSearchQuery] = useState("");

	const { data: articles } = useSuspenseQuery(
		articlesQueryOptions({ submitter_id: auth.user?.id || "" }),
	);

	// Filter articles
	const filteredArticles = articles.filter((article) => {
		const matchesStatus =
			statusFilter === "all" || article.status === statusFilter;
		const matchesSearch =
			!searchQuery ||
			article.title_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			article.title_pt?.toLowerCase().includes(searchQuery.toLowerCase());
		return matchesStatus && matchesSearch;
	});

	return (
		<div className="container mx-auto max-w-6xl px-4 py-8">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">
						Minhas Submissões
					</h1>
					<p className="mt-2 text-muted-foreground">
						Acompanhe o status de todos os seus artigos submetidos
					</p>
				</div>
				<Link to="/journal/submit">
					<Button>
						<Plus className="size-4 mr-2" />
						Nova Submissão
					</Button>
				</Link>
			</div>

			{/* Filters */}
			<div className="mb-6 space-y-4">
				<div className="flex gap-2 overflow-x-auto pb-2">
					{STATUS_FILTERS.map((filter) => (
						<Button
							key={filter.value}
							variant={statusFilter === filter.value ? "default" : "outline"}
							size="sm"
							onClick={() => setStatusFilter(filter.value)}
						>
							{filter.label}
						</Button>
					))}
				</div>

				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder="Buscar por título..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>
			</div>

			{/* Articles List */}
			{filteredArticles.length === 0 ? (
				<div className="text-center py-12 border-2 border-dashed rounded-lg">
					<p className="text-muted-foreground mb-4">
						{searchQuery || statusFilter !== "all"
							? "Nenhum artigo encontrado com os filtros selecionados"
							: "Você ainda não possui submissões"}
					</p>
					<Link to="/journal/submit">
						<Button>
							<Plus className="size-4 mr-2" />
							Criar Nova Submissão
						</Button>
					</Link>
				</div>
			) : (
				<div className="space-y-4">
					{filteredArticles.map((article) => (
						<ArticleCard key={article.id} article={article} />
					))}
				</div>
			)}

			<div className="mt-6 text-sm text-muted-foreground text-center">
				{filteredArticles.length} artigo
				{filteredArticles.length !== 1 ? "s" : ""}{" "}
				{statusFilter !== "all" &&
					`(${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label})`}
			</div>
		</div>
	);
}
