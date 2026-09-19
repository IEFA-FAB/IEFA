/**
 * O vínculo da Ordem de Fornecimento com o empenho, conferido contra a LINHA do
 * empenho — nunca contra o corpo da requisição.
 *
 * `createSupplyOrderFn` lia `empenho.unit_id` e não comparava com nada: quem
 * operava o almoxarifado de uma cozinha emitia OF contra o empenho de outra OM
 * (consumindo o saldo dela) e ainda podia citar um item de ARP que o empenho
 * não cobre. A regra é pura para ser testável; a server fn só lê do banco.
 */

export interface EmpenhoForSupplyOrder {
	unitId: number | null
	status: string
	arpItemId: string | null
}

export interface SupplyOrderLinkInput {
	/** Unidade COMPRADORA da cozinha (`purchase_unit_id ?? unit_id`, ver `resolvePurchaseUnitId`). */
	kitchenPurchaseUnitId: number | null
	empenho: EmpenhoForSupplyOrder
	/** `arpItemId` de cada item da OF, na ordem em que chegaram (`undefined` = sem item de ARP). */
	itemArpItemIds: ReadonlyArray<string | null | undefined>
}

/** Problemas do vínculo da OF. Lista vazia = pode emitir. */
export function supplyOrderLinkProblems(input: SupplyOrderLinkInput): string[] {
	const problems: string[] = []
	const { empenho } = input

	// Mesmo critério de `listEmpenhosForKitchenFn`, que é de onde a tela tira o
	// empenho: só o que aparece ali pode ser usado aqui.
	if (input.kitchenPurchaseUnitId == null || empenho.unitId == null || empenho.unitId !== input.kitchenPurchaseUnitId) {
		problems.push("O empenho não é da unidade compradora desta cozinha")
	}
	if (empenho.status !== "ativo") problems.push("Empenho anulado não sustenta Ordem de Fornecimento")

	// O item da OF tem de ser o item que o empenho empenhou: outro item de ARP
	// seria entregar (e depois liquidar) o que ninguém empenhou.
	const foreign = input.itemArpItemIds.filter((id) => id != null && id !== empenho.arpItemId)
	if (foreign.length > 0) problems.push("Item de ARP que o empenho não cobre")

	return problems
}
