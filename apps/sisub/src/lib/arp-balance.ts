/**
 * @module arp-balance
 * Cálculos puros do painel ARP × empenho — duas grandezas de origens distintas
 * que NUNCA se somam:
 *   - saldo oficial: snapshot da API Compras.gov (procurement_arp_item),
 *     inclui consumo de outras UASGs (caronas) e só muda em sincronização;
 *   - comprometimento local: soma dos itens (finance.empenho_item) das NEs
 *     ATIVAS da unidade, calculada em tempo real.
 */

/** Item de NE com o status da NE a que pertence. */
export interface EmpenhoItemLike {
	empenho_id: string
	arp_item_id: string
	/** Status da NE (`finance.empenho.status`). */
	status: string
	quantity: number | string | null
	value: number | string | null
}

export interface LocalCommitment {
	quantidade: number
	valorTotal: number
	/** Quantas NEs ativas cobrem o item (a NE com dois itens do mesmo item de ARP conta uma vez). */
	count: number
}

/** Soma quantidade/valor dos itens das NEs ATIVAS, agrupados por item de ARP. Anuladas ficam de fora. */
export function aggregateLocalCommitments(items: readonly EmpenhoItemLike[]): Map<string, LocalCommitment> {
	const byItem = new Map<string, LocalCommitment>()
	const empenhosByItem = new Map<string, Set<string>>()
	for (const item of items) {
		if (item.status !== "ativo") continue
		const acc = byItem.get(item.arp_item_id) ?? { quantidade: 0, valorTotal: 0, count: 0 }
		const empenhos = empenhosByItem.get(item.arp_item_id) ?? new Set<string>()
		empenhos.add(item.empenho_id)
		acc.quantidade += Number(item.quantity ?? 0)
		acc.valorTotal += Number(item.value ?? 0)
		acc.count = empenhos.size
		byItem.set(item.arp_item_id, acc)
		empenhosByItem.set(item.arp_item_id, empenhos)
	}
	return byItem
}

export interface ArpItemBalanceLike {
	quantidade_homologada: number | string | null
	quantidade_empenhada: number | string | null
	saldo_empenho: number | string | null
}

/**
 * Saldo oficial do snapshot. Usa saldo_empenho quando a API o forneceu;
 * senão deriva homologada − empenhada (ambos do snapshot — nunca mistura o local).
 */
export function resolveSaldoOficial(item: ArpItemBalanceLike): number {
	if (item.saldo_empenho != null) return Number(item.saldo_empenho)
	return Number(item.quantidade_homologada ?? 0) - Number(item.quantidade_empenhada ?? 0)
}
