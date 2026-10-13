import type { OccasionMenuCopy } from "@/components/features/local/planning/occasion-menu-editor"
import type { OccasionMenuType } from "@/lib/occasion-menu"

/** Derivações puras da criação de evento ou apoio (`OccasionMenuForm`). */

/** Chave do rascunho do formulário de criação no `sessionStorage`, por tipo e por cozinha. */
export function newOccasionDraftKey(templateType: OccasionMenuType, kitchenId: number | null): string {
	return `${templateType === "event" ? "events" : "support-menus"}-new-draft-${kitchenId ?? "global"}`
}

export function occasionFormTitle({ isFork, isGlobal, copy }: { isFork: boolean; isGlobal: boolean; copy: OccasionMenuCopy }): string {
	return isFork ? `Adaptar ${copy.singular} Global` : isGlobal ? `${copy.newLabel} Modelo` : copy.newLabel
}

/** A cópia precisa de ao menos uma refeição (quando o modelo tem refeições). */
export function isNoMealChosen(isFork: boolean, sourceMealCount: number, chosenMealCount: number): boolean {
	return isFork && sourceMealCount > 0 && chosenMealCount === 0
}

/** O que a cópia leva: do modelo global, só a quantidade relativa; de uma cozinha, tudo. */
export function forkSourceSummary(isSourceGlobal: boolean, isSupportMenu: boolean): string {
	return isSourceGlobal
		? "A cópia leva as preparações, os grupos e as proporções. O efetivo e as ocorrências por mês você define aqui."
		: `A cópia leva tudo: preparações, grupos, proporções e o efetivo de cada refeição${isSupportMenu ? ", e as ocorrências por mês" : ""}.`
}

/** Complemento do texto de orientação da criação do zero. */
export function newOccasionExplainerTail({
	isGlobal,
	templateType,
	copy,
}: {
	isGlobal: boolean
	templateType: OccasionMenuType
	copy: OccasionMenuCopy
}): string {
	return isGlobal
		? templateType === "event"
			? "No catálogo global, cada modelo de evento é UMA opção de um formato (o café da manhã do Padrão B, o coquetel do Padrão A): uma refeição só. A cozinha junta os modelos ao montar o evento dela."
			: "Modelos do catálogo global ficam disponíveis para todas as cozinhas adaptarem."
		: `${copy.article === "o" ? "O" : "A"} ${copy.noun} poderá ser ${copy.article === "o" ? "selecionado" : "selecionada"} na composição dos anexos quantitativos do TR.`
}

/** Exemplo do campo Nome: na adaptação, o nome do modelo e o ano corrente. */
export function occasionNamePlaceholder(isFork: boolean, baseName: string | null | undefined, copy: OccasionMenuCopy): string {
	return isFork ? `Ex.: ${baseName ?? "Cópia"} — ${new Date().getFullYear()}` : copy.namePlaceholder
}

export function afterCreateHint(isFork: boolean, copy: OccasionMenuCopy): string {
	return isFork
		? `Após criar, você poderá editar ${copy.article} ${copy.noun} livremente.`
		: `Após criar, você será redirecionado para montar as preparações d${copy.article} ${copy.noun}.`
}

export function createdOccasionMessage(copy: OccasionMenuCopy, name: string | null): string {
	return `${copy.singular} "${name}" ${copy.article === "o" ? "criado" : "criada"}!`
}
