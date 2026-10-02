/**
 * De quem é a NF-e: a regra que decide se uma cozinha pode assumir a nota, ou receber
 * mercadoria por ela.
 *
 * A nota chega no CNPJ da OM compradora, não da cozinha. Enquanto nenhuma cozinha a assumiu
 * (`kitchen_id` nulo), ela é da UNIDADE (`unit_id`), e só uma cozinha cuja unidade de compra é
 * aquela pode tomá-la. Nota sem unidade (`unit_id` nulo e sem cozinha) está na triagem global:
 * o destinatário não foi reconhecido, e quem atribui a unidade é o nível 3 global.
 *
 * Fica fora de `nfe.fn.ts`/`receiving.fn.ts` porque teste unitário não importa `@/server/*`.
 */

export interface NfeOwnershipInput {
	/** Cozinha dona da nota (`nfe_document.kitchen_id`). */
	docKitchenId: number | null
	/** Unidade destinatária da nota (`nfe_document.unit_id`). */
	docUnitId: number | null
	/** Cozinha que quer assumir a nota ou receber por ela. */
	kitchenId: number
	/** Unidade de compra dessa cozinha (`purchase_unit_id`, senão `unit_id`). */
	kitchenPurchaseUnitId: number | null
}

/**
 * `null` quando a cozinha pode usar a nota (já é dela, ou é da unidade de compra dela e
 * ninguém a assumiu); senão, a frase que diz por que não e o que fazer.
 */
export function nfeOwnershipProblem(input: NfeOwnershipInput): string | null {
	if (input.docKitchenId != null && input.docKitchenId !== input.kitchenId) return "NF-e já pertence a outra cozinha"
	if (input.docKitchenId === input.kitchenId) {
		// Já é desta cozinha — desde que o destinatário conhecido seja a unidade dela. Nota que ficou
		// com a cozinha e depois teve outra unidade atribuída (ou gravada antes desta regra) não
		// sustenta recebimento aqui.
		const isOtherUnit = input.docUnitId != null && input.kitchenPurchaseUnitId != null && input.docUnitId !== input.kitchenPurchaseUnitId
		return isOtherUnit ? "NF-e endereçada a outra unidade" : null
	}
	if (input.docUnitId == null) {
		return "NF-e em triagem: o destinatário da nota não foi reconhecido. Peça a quem faz a triagem das notas (estoque, nível 3 global) para atribuir a unidade; depois a nota aparece aqui para ser assumida"
	}
	if (input.kitchenPurchaseUnitId == null) return "Cozinha sem unidade de compra vinculada — não há como conferir o destinatário da nota"
	if (input.docUnitId !== input.kitchenPurchaseUnitId) return "NF-e endereçada a outra unidade"
	return null
}
