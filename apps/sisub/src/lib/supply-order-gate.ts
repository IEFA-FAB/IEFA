/**
 * O vínculo da Ordem de Fornecimento com o empenho, conferido contra a LINHA do
 * empenho — nunca contra o corpo da requisição.
 *
 * `createSupplyOrderFn` lia `empenho.unit_id` e não comparava com nada: quem
 * operava o almoxarifado de uma cozinha emitia OF contra o empenho de outra OM
 * (consumindo o saldo dela) e ainda podia citar um item de ARP que o empenho
 * não cobre. A regra é pura para ser testável; a server fn só lê do banco.
 *
 * Desde 20260926214000 a NE tem itens (`finance.empenho_item`): o item da OF tem de
 * ser um dos itens de ARP que a NE cobre, e a OF pode ser emitida AGUARDANDO
 * empenho (a emergência acontece; fica a pendência "regularize a NE").
 */

export interface EmpenhoForSupplyOrder {
	unitId: number | null
	status: string
	/** Itens de ARP cobertos pela NE (os `arp_item_id` dos itens dela). Vazio = NE sem ata. */
	coveredArpItemIds: readonly string[]
}

export interface SupplyOrderLinkInput {
	/** Unidade COMPRADORA da cozinha (`purchase_unit_id ?? unit_id`, ver `resolvePurchaseUnitId`). */
	kitchenPurchaseUnitId: number | null
	/** null = OF aguardando empenho. */
	empenho: EmpenhoForSupplyOrder | null
	/** `arpItemId` de cada item da OF, na ordem em que chegaram (`undefined` = sem item de ARP). */
	itemArpItemIds: ReadonlyArray<string | null | undefined>
}

/** Problemas do vínculo da OF. Lista vazia = pode emitir. */
export function supplyOrderLinkProblems(input: SupplyOrderLinkInput): string[] {
	const problems: string[] = []
	const { empenho } = input

	if (input.kitchenPurchaseUnitId == null) {
		problems.push("A cozinha não tem unidade compradora: a OF não tem de quem ser")
		return problems
	}
	// OF aguardando empenho: não há vínculo a conferir agora; ele se confere quando a NE for
	// vinculada (`linkSupplyOrderEmpenhoFn` e o trigger do banco).
	if (empenho == null) return problems

	// Mesmo critério de `listEmpenhosForKitchenFn`, que é de onde a tela tira o
	// empenho: só o que aparece ali pode ser usado aqui.
	if (empenho.unitId == null || empenho.unitId !== input.kitchenPurchaseUnitId) {
		problems.push("O empenho não é da unidade compradora desta cozinha")
	}
	if (empenho.status !== "ativo") problems.push("Empenho anulado não sustenta Ordem de Fornecimento")

	// O item da OF tem de ser um item que a NE empenhou: outro item de ARP seria
	// entregar (e depois liquidar) o que ninguém empenhou.
	const covered = new Set(empenho.coveredArpItemIds)
	const foreign = input.itemArpItemIds.filter((id) => id != null && !covered.has(id))
	if (foreign.length > 0) problems.push("Item de ARP que o empenho não cobre")

	return problems
}
