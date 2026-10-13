import type { EditScope } from "@iefa/sisub-domain"

// Tabs do formulário — estado persistido na URL (?tab=) para navegação e links compartilháveis.
/**
 * "substituicoes" saiu daqui: substituição não é faceta da preparação (como rendimento,
 * modo de preparo ou nutrição), é atributo de UMA linha da ficha. Como aba, ela precisava
 * reconstruir a tabela de ingredientes só para o usuário reescolher a linha, e a
 * quantidade original — metade da decisão — ficava do outro lado da navegação. Agora vive
 * na expansão da linha, em `RecipeIngredientsTable`.
 */
export const RECIPE_FORM_TABS = ["detalhes", "ingredientes", "preparo", "nutricao", "fluxo", "equipamentos"] as const
export type RecipeFormTab = (typeof RECIPE_FORM_TABS)[number]

export type RecipeFormMode = "create" | "edit" | "fork"

/** O que estas derivações leem da versão carregada. */
interface LoadedRecipe {
	id: string
	name: string
	version: number | null
	kitchen_id: number | null
}

/** Aba ativa a partir do `?tab=` da URL; valores fora do enum caem em "detalhes". */
export function resolveRecipeFormTab(tab: unknown): RecipeFormTab {
	return RECIPE_FORM_TABS.includes(tab as RecipeFormTab) ? (tab as RecipeFormTab) : "detalhes"
}

/**
 * Fluxo e Equipamentos salvam por conta própria: a barra da preparação só aparece nelas se
 * houver alteração da preparação pendente — senão seriam dois "Salvar" na mesma tela.
 */
export function isRecipeFieldsTab(tab: RecipeFormTab): boolean {
	return tab !== "fluxo" && tab !== "equipamentos"
}

/**
 * Contexto da edição = a ROTA em que o formulário está montado, não o `kitchen_id` do
 * dado carregado. Editar uma preparação global pela tela de uma cozinha forka; pela
 * tela global, versiona o global. Derivar do dado fazia a edição na cozinha alterar o
 * catálogo global (válido para toda a FAB).
 */
export function resolveEditContext(kitchenId: string | undefined): EditScope {
	return kitchenId ? { scope: "kitchen", kitchenId: Number(kitchenId) } : { scope: "global" }
}

/** Preparação global aberta no contexto de uma cozinha: salvar vai criar cópia local. */
export function isForkingGlobalRecipe(mode: RecipeFormMode, initialData: LoadedRecipe | null | undefined, editContext: EditScope): boolean {
	return mode !== "create" && !!initialData && initialData.kitchen_id == null && editContext.scope === "kitchen"
}

/** Id cuja linhagem é consultada para saber se a versão aberta é a vigente (criar não tem). */
export function getLineageRecipeId(mode: RecipeFormMode, initialData: LoadedRecipe | null | undefined): string | undefined {
	return mode === "create" ? undefined : initialData?.id
}

/**
 * Versão vigente que superou a aberta, ou `null`. Só uma vigente com id conta: resposta sem
 * id (erro que chegou como dado) não bloqueia o Salvar com um "versão vundefined".
 */
export function findSupersedingHead<THead extends { id?: unknown }>(
	mode: RecipeFormMode,
	initialData: LoadedRecipe | null | undefined,
	head: THead | null | undefined
): THead | null {
	return mode !== "create" && initialData && typeof head?.id === "string" && head.id !== initialData.id ? head : null
}

/** Revisão (conferência) só existe para preparação persistida aberta em edição. */
export function getReviewRecipeId(mode: RecipeFormMode, initialData: LoadedRecipe | null | undefined): string | null {
	return mode === "edit" ? (initialData?.id ?? null) : null
}

/** Editor de fluxo e equipamentos opera sobre a versão PERSISTIDA: só em edição. */
export function isFlowEnabled(mode: RecipeFormMode, initialData: LoadedRecipe | null | undefined): boolean {
	return mode === "edit" && !!initialData?.id
}

/** O que o Salvar faz, dito na barra quando ela está nas abas da preparação. */
export function getRecipeSaveCaption(mode: RecipeFormMode, willFork: boolean): string {
	return mode === "create"
		? "Salvar cria a preparação."
		: willFork
			? "Salvar cria uma cópia local desta cozinha. A preparação global não é alterada."
			: "Salvar gera automaticamente uma nova versão desta preparação."
}

/** Legenda da barra de salvar: bloqueio por versão superada vence; fora das abas da preparação, só o aviso de pendência. */
export function getRecipeDraftBarCaption(supersededBy: { version: number | null } | null, isRecipeTab: boolean, saveCaption: string): string {
	return supersededBy
		? `Salvar está bloqueado: abra a versão vigente (v${supersededBy.version}) para levar suas alterações.`
		: isRecipeTab
			? saveCaption
			: "Há alterações na preparação ainda não salvas."
}

/** Título do rascunho na lista de rascunhos abertos. */
export function getRecipeDraftTitle(mode: RecipeFormMode, initialData: LoadedRecipe | null | undefined): string {
	return mode === "create" ? "Nova preparação" : `Preparação: ${initialData?.name ?? ""}`
}

/** Data e hora curtas da gravação de uma versão ("28/09, 14:29"). */
export function formatDateTime(iso: string) {
	return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/** Primeira frase do aviso de versão superada: fork da cozinha que já existe, ou versão mais nova da mesma linhagem. */
export function describeSupersedingVersion(
	supersededBy: { version: number | null; created_at: string; kitchen_id: number | null },
	initialData: LoadedRecipe | null | undefined
): string {
	return supersededBy.kitchen_id != null && initialData?.kitchen_id == null
		? `Esta cozinha já tem a própria versão desta preparação (v${supersededBy.version}, de ${formatDateTime(supersededBy.created_at)}).`
		: `A v${supersededBy.version} foi gravada em ${formatDateTime(supersededBy.created_at)}, depois da versão que você abriu (v${initialData?.version}).`
}
