import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Clock, GitBranch, GitCompare, Loader2 } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { useRecipe, useRecipeVersions } from "@/hooks/data/useRecipe"
import { cn } from "@/lib/cn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	})
}

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	preparation_method: "Modo de Preparo",
	portion_yield: "Rendimento (porções)",
	preparation_time_minutes: "Tempo de Preparo (min)",
	cooking_factor: "Fator de Cocção",
	rational_id: "Código Rational",
}

function formatFieldValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "—"
	return String(value)
}

// ─── Diff logic ──────────────────────────────────────────────────────────────

function computeDiff(from: RecipeWithIngredients, to: RecipeWithIngredients) {
	const changedFields: { key: string; label: string; from: unknown; to: unknown }[] = []

	for (const [key, label] of Object.entries(FIELD_LABELS)) {
		const fromVal = from[key as keyof RecipeWithIngredients]
		const toVal = to[key as keyof RecipeWithIngredients]
		if (fromVal !== toVal) {
			changedFields.push({ key, label, from: fromVal, to: toVal })
		}
	}

	const fromIngMap = new Map(from.ingredients.map((i) => [i.product_id, i]))
	const toIngMap = new Map(to.ingredients.map((i) => [i.product_id, i]))

	const addedIngredients = to.ingredients.filter((i) => !fromIngMap.has(i.product_id))
	const removedIngredients = from.ingredients.filter((i) => !toIngMap.has(i.product_id))
	const changedQuantities = to.ingredients.filter((i) => {
		const fromIng = fromIngMap.get(i.product_id)
		return fromIng && fromIng.net_quantity !== i.net_quantity
	})

	return { changedFields, addedIngredients, removedIngredients, changedQuantities }
}

// ─── DiffView component ───────────────────────────────────────────────────────

function DiffView({ from, to }: { from: RecipeWithIngredients; to: RecipeWithIngredients }) {
	const diff = computeDiff(from, to)
	const hasChanges =
		diff.changedFields.length > 0 || diff.addedIngredients.length > 0 || diff.removedIngredients.length > 0 || diff.changedQuantities.length > 0

	if (!hasChanges) {
		return (
			<div className="rounded-md border border-dashed p-8 text-center space-y-2">
				<GitCompare className="h-6 w-6 mx-auto text-muted-foreground" />
				<p className="text-sm text-muted-foreground">Nenhuma diferença encontrada entre as versões selecionadas.</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* Campos alterados */}
			{diff.changedFields.length > 0 && (
				<div className="rounded-lg border bg-card overflow-hidden">
					<div className="px-4 py-2.5 bg-muted/30 border-b">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campos alterados</span>
					</div>
					<div className="divide-y">
						{diff.changedFields.map((f) => (
							<div key={f.key} className="px-4 py-3 grid grid-cols-[130px_1fr_1fr] gap-3 items-start text-sm">
								<span className="text-xs font-medium text-muted-foreground pt-1">{f.label}</span>
								<div className="rounded bg-destructive/10 px-2.5 py-2 text-destructive text-xs whitespace-pre-wrap break-words">{formatFieldValue(f.from)}</div>
								<div className="rounded bg-success/10 px-2.5 py-2 text-success text-xs whitespace-pre-wrap break-words">{formatFieldValue(f.to)}</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Ingredientes */}
			{(diff.addedIngredients.length > 0 || diff.removedIngredients.length > 0 || diff.changedQuantities.length > 0) && (
				<div className="rounded-lg border bg-card overflow-hidden">
					<div className="px-4 py-2.5 bg-muted/30 border-b">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingredientes</span>
					</div>
					<div className="p-3 space-y-1.5">
						{diff.removedIngredients.map((i) => (
							<div key={i.product_id} className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-destructive/10 text-xs">
								<span className="font-mono font-bold text-destructive w-4 shrink-0">−</span>
								<span className="text-destructive flex-1">{i.product?.description ?? i.product_id}</span>
								<span className="text-destructive/70 shrink-0 font-mono">{i.net_quantity}g</span>
							</div>
						))}
						{diff.addedIngredients.map((i) => (
							<div key={i.product_id} className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-success/10 text-xs">
								<span className="font-mono font-bold text-success w-4 shrink-0">+</span>
								<span className="text-success flex-1">{i.product?.description ?? i.product_id}</span>
								<span className="text-success/70 shrink-0 font-mono">{i.net_quantity}g</span>
							</div>
						))}
						{diff.changedQuantities.map((i) => {
							const fromIng = from.ingredients.find((fi) => fi.product_id === i.product_id)
							return (
								<div key={i.product_id} className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/20 text-xs">
									<span className="font-mono font-bold text-amber-600 w-4 shrink-0">~</span>
									<span className="text-foreground flex-1">{i.product?.description ?? i.product_id}</span>
									<span className="shrink-0 font-mono space-x-1">
										<span className="line-through text-destructive/70">{fromIng?.net_quantity}g</span>
										<span className="text-muted-foreground">→</span>
										<span className="text-success">{i.net_quantity}g</span>
									</span>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function GlobalRecipeVersionsPage() {
	const { recipeId } = Route.useParams()
	const navigate = useNavigate()

	const { data: recipe, isLoading: recipeLoading, error: recipeError } = useRecipe(recipeId)
	const { data: versions, isLoading: versionsLoading } = useRecipeVersions(recipeId)

	// ID da versão base selecionada para comparação (padrão: penúltima)
	const [selectedFromId, setSelectedFromId] = useState<string | null>(null)

	const isLoading = recipeLoading || versionsLoading

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (recipeError || !recipe) {
		return <div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">Preparação não encontrada ou erro ao carregar.</div>
	}

	const sortedVersions = versions ?? []
	const hasMultipleVersions = sortedVersions.length > 1
	const latestVersion = sortedVersions[sortedVersions.length - 1]

	// Versão "de": selecionada pelo usuário ou penúltima por padrão
	const fromVersion = selectedFromId ? sortedVersions.find((v) => v.id === selectedFromId) : sortedVersions[sortedVersions.length - 2]
	// Versão "para": sempre a mais recente
	const toVersion = latestVersion

	return (
		<div className="space-y-6">
			<PageHeader
				title="Histórico de Versões"
				description={`Preparação: ${recipe.name}`}
				onBack={() =>
					navigate({
						to: "/global/recipes/$recipeId",
						params: { recipeId },
					})
				}
			/>

			<div className="mx-auto w-full max-w-4xl space-y-6">
				{/* Resumo */}
				<div className="flex items-center gap-3 px-1">
					<GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
					<span className="text-sm text-muted-foreground">
						{sortedVersions.length === 1 ? "1 versão registrada" : `${sortedVersions.length} versões registradas`}
					</span>
					<Badge variant="default" className="ml-auto">
						v{recipe.version ?? 1} atual
					</Badge>
				</div>

				{!hasMultipleVersions ? (
					/* Apenas uma versão — sem histórico ainda */
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<GitCompare className="h-8 w-8 mx-auto text-muted-foreground" />
						<p className="text-sm font-medium text-muted-foreground">Nenhuma versão anterior</p>
						<p className="text-xs text-muted-foreground">
							Esta preparação ainda tem apenas uma versão (v{recipe.version ?? 1}).
							<br />
							Toda edição salva como nova versão gera um registro aqui automaticamente.
						</p>
					</div>
				) : (
					/* Layout: timeline | diff */
					<div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
						{/* Timeline de versões */}
						<div className="space-y-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Versões</p>

							{sortedVersions.map((v, idx) => {
								const isLatest = idx === sortedVersions.length - 1
								const isSelected = selectedFromId === v.id || (!selectedFromId && idx === sortedVersions.length - 2)

								return (
									<button
										key={v.id}
										type="button"
										disabled={isLatest}
										onClick={() => setSelectedFromId(v.id)}
										className={cn(
											"w-full text-left rounded-lg border px-3.5 py-3 text-sm transition-colors",
											isLatest ? "cursor-default opacity-100 border-primary/40 bg-primary/5" : "hover:bg-muted/50 cursor-pointer",
											isSelected && !isLatest && "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<Badge variant={isLatest ? "default" : "outline"} className="text-xs">
												v{v.version}
											</Badge>
											<div className="flex gap-1 shrink-0">
												{isLatest && (
													<Badge variant="secondary" className="text-xs">
														atual
													</Badge>
												)}
												{isSelected && !isLatest && (
													<Badge variant="secondary" className="text-xs">
														comparando
													</Badge>
												)}
											</div>
										</div>
										<div className="flex items-center gap-1.5 mt-1.5">
											<Clock className="h-3 w-3 text-muted-foreground shrink-0" />
											<span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
										</div>
									</button>
								)
							})}

							<p className="text-xs text-muted-foreground/60 px-1 pt-1">Clique em uma versão anterior para compará-la com a atual.</p>
						</div>

						{/* Painel de diff */}
						<div className="space-y-3">
							{fromVersion && toVersion && fromVersion.id !== toVersion.id ? (
								<>
									<div className="flex items-center gap-2 px-1">
										<Badge variant="outline" className="text-xs">
											v{fromVersion.version}
										</Badge>
										<span className="text-muted-foreground text-xs">→</span>
										<Badge className="text-xs">v{toVersion.version}</Badge>
										<span className="text-xs text-muted-foreground ml-1">comparação</span>
									</div>
									<DiffView from={fromVersion} to={toVersion} />
								</>
							) : (
								<div className="rounded-md border border-dashed p-8 text-center space-y-2">
									<GitCompare className="h-6 w-6 mx-auto text-muted-foreground" />
									<p className="text-sm text-muted-foreground">Selecione uma versão anterior para comparar com a atual.</p>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
