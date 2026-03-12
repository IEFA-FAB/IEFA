import { Badge } from "@iefa/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, GitCompare, Loader2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * GLOBAL-02 — Comparar Versões de uma Preparação Global (Diff Viewer)
 * URL: /global/recipes/:recipeId/versions
 * Acesso: módulo "global" nível 1+
 */
export const Route = createFileRoute("/_protected/_modules/global/recipes/$recipeId/versions")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	component: GlobalRecipeVersionsPage,
	head: () => ({
		meta: [{ title: "Histórico de Versões - SISUB" }],
	}),
})

function GlobalRecipeVersionsPage() {
	const { recipeId } = Route.useParams()
	const { data: recipe, isLoading, error } = useRecipe(recipeId)

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !recipe) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				Preparação não encontrada ou erro ao carregar.
			</div>
		)
	}

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
			<PageHeader title="Histórico de Versões" description={`Preparação: ${recipe.name}`}>
				<Link
					to="/global/recipes/$recipeId"
					params={{ recipeId }}
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Voltar à preparação
				</Link>
			</PageHeader>

			{/* Versão atual */}
			<div className="rounded-lg border bg-card p-5 space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<GitCompare className="h-4 w-4 text-muted-foreground" />
						<span className="font-medium text-sm">Versão atual</span>
					</div>
					<Badge variant="default">v{recipe.version ?? 1}</Badge>
				</div>
				<p className="text-xs text-muted-foreground">Versão: {recipe.version ?? 1}</p>
			</div>

			{/* Placeholder — diff viewer será implementado quando houver histórico de versões */}
			<div className="rounded-md border border-dashed p-8 text-center space-y-2">
				<GitCompare className="h-8 w-8 mx-auto text-muted-foreground" />
				<p className="text-sm font-medium text-muted-foreground">Comparador de versões</p>
				<p className="text-xs text-muted-foreground">
					O histórico completo de versões e o diff visual serão exibidos aqui.
					<br />
					Qualquer edição na preparação gera uma nova versão (append-only).
				</p>
			</div>
		</div>
	)
}
