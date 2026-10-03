/**
 * Descrição de insumo ou preparação para a tela. A coluna é nulável e há cadastro com texto em
 * branco: vazio e nulo viram o mesmo rótulo, em vez de `""` numa tela e `null` noutra.
 */
export const MISSING_ITEM_DESCRIPTION = "(sem descrição)"

export function itemDescription(description: string | null | undefined): string {
	return description?.trim() || MISSING_ITEM_DESCRIPTION
}
