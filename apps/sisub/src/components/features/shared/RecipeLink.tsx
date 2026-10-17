import type { EditScope } from "@iefa/sisub-domain"
import { Link } from "@tanstack/react-router"
import { ChefHat, Globe, Loader2 } from "lucide-react"
import { createContext, type ReactNode, useContext } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { useRecipe } from "@/hooks/data/useRecipe"
import { cn } from "@/lib/cn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

function formatQty(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/** O que a listagem já tem em mãos: o cabeçalho aparece antes de a ficha carregar. */
type RecipePreviewSummary = { name: string; kitchen_id: number | null; portion_yield: number | null }

/**
 * Prévia da preparação no hover card: nome, origem e os primeiros ingredientes.
 * A ficha só é buscada quando o cartão abre (o conteúdo do hover card monta ao abrir).
 */
export function RecipeHoverContent({
	recipeId,
	summary,
	fallbackName,
	hint,
}: {
	recipeId: string
	summary?: RecipePreviewSummary
	/** Nome já exibido por quem abriu a prévia: o cabeçalho não espera a ficha carregar. */
	fallbackName?: string
	hint?: string
}) {
	const { data, isLoading, isError } = useRecipe(recipeId)
	const detail = data as RecipeWithIngredients | undefined
	const name = summary?.name ?? detail?.name ?? fallbackName
	const kitchenId = summary ? summary.kitchen_id : detail?.kitchen_id
	const portionYield = summary ? summary.portion_yield : detail?.portion_yield
	// `undefined` = origem ainda desconhecida (ficha carregando): nem globo nem chapéu até saber.
	const isGlobal = kitchenId === null
	const isOriginKnown = kitchenId !== undefined

	// Ingredientes ordenados por prioridade; obrigatórios primeiro.
	const ingredients = (detail?.ingredients ?? [])
		.filter((ri) => !ri.deleted_at)
		.sort((a, b) => Number(a.is_optional ?? false) - Number(b.is_optional ?? false) || (a.priority_order ?? 999) - (b.priority_order ?? 999))

	const preview = ingredients.slice(0, 7)
	const extra = ingredients.length - preview.length

	return (
		<>
			<div className="flex items-start gap-2">
				<div
					className={`flex size-7 shrink-0 items-center justify-center rounded-(--radius) border ${
						isGlobal ? "border-primary/20 bg-primary/10" : "border-border/30 bg-muted/50"
					}`}
				>
					{isOriginKnown && (isGlobal ? <Globe className="size-3.5 text-primary" /> : <ChefHat className="size-3.5 text-muted-foreground" />)}
				</div>
				<div className="min-w-0">
					<p className="text-sm font-semibold leading-tight">{name ?? "Preparação"}</p>
					<p className="text-xs text-muted-foreground">Ingredientes{portionYield != null ? ` · ${portionYield} porções` : ""}</p>
				</div>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					Carregando ingredientes…
				</div>
			) : isError || !detail ? (
				// Falha de rede ou ficha que não existe mais não é "sem ingredientes".
				<p className="py-1 text-xs text-muted-foreground">Não foi possível carregar a ficha.</p>
			) : preview.length === 0 ? (
				<p className="py-1 text-xs text-muted-foreground">Sem ingredientes cadastrados.</p>
			) : (
				<div className="flex flex-col gap-1 text-xs">
					{preview.map((ri) => (
						<div key={ri.id} className="flex items-baseline justify-between gap-3">
							<span className="truncate text-muted-foreground">
								{ri.ingredient?.description ?? "Ingrediente"}
								{ri.is_optional && <span className="text-[10px] uppercase tracking-wide"> · opc</span>}
							</span>
							{ri.net_quantity != null && (
								<span className="shrink-0 font-mono tabular-nums">
									{formatQty(ri.net_quantity)}
									{ri.ingredient?.measure_unit ? ` ${ri.ingredient.measure_unit}` : ""}
								</span>
							)}
						</div>
					))}
					{extra > 0 && <p className="pt-0.5 text-hint text-muted-foreground">+{extra} outros ingredientes</p>}
				</div>
			)}
			{hint && <p className="mt-2 border-t pt-1.5 text-hint text-muted-foreground">{hint}</p>}
		</>
	)
}

const RecipeLinkScopeContext = createContext<EditScope | null>(null)

/**
 * De onde a preparação é aberta: no editor global a ficha global, no da cozinha a ficha pela
 * tela da cozinha (que mostra a global como somente leitura, ou a cópia local). É o mesmo
 * contexto de edição da rota — nunca a permissão do usuário, que abriria a tela global para
 * quem está planejando a cozinha e também tem `global:2`.
 */
export function RecipeLinkScope({ scope, children }: { scope: EditScope; children: ReactNode }) {
	return <RecipeLinkScopeContext.Provider value={scope}>{children}</RecipeLinkScopeContext.Provider>
}

/**
 * Nome da preparação que abre a ficha dela e mostra a prévia ao repousar o mouse.
 *
 * Abre em outra aba: os editores de cardápio gravam com atraso (auto-save de 1,5 s) ou só no
 * Salvar explícito (modelo global aberto na cozinha), e sair da tela no meio descartava a
 * edição. Fora de um `RecipeLinkScope` é texto puro.
 */
export function RecipeLink({ recipeId, children, className }: { recipeId: string; children: string; className?: string }) {
	const scope = useContext(RecipeLinkScopeContext)
	if (!scope) return <span className={className}>{children}</span>

	const linkClassName = cn("underline-offset-2 hover:underline focus-visible:underline", className)
	const link =
		scope.scope === "kitchen" ? (
			<Link
				to="/kitchen/$kitchenId/recipes/$recipeId"
				params={{ kitchenId: String(scope.kitchenId), recipeId }}
				target="_blank"
				rel="noopener"
				className={linkClassName}
			/>
		) : (
			<Link to="/global/recipes/$recipeId" params={{ recipeId }} target="_blank" rel="noopener" className={linkClassName} />
		)

	return (
		<HoverCard>
			<HoverCardTrigger render={link}>{children}</HoverCardTrigger>
			<HoverCardContent side="right" align="start">
				<RecipeHoverContent recipeId={recipeId} fallbackName={children} hint="Clique para abrir a preparação em outra aba." />
			</HoverCardContent>
		</HoverCard>
	)
}
