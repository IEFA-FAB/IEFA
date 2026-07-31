/**
 * @module arp-balance
 * Cálculos puros do painel ARP × empenho — duas grandezas de origens distintas
 * que NUNCA se somam:
 *   - saldo oficial: snapshot da API Compras.gov (procurement_arp_item),
 *     inclui consumo de outras UASGs (caronas) e só muda em sincronização;
 *   - comprometimento local: soma dos finance.empenho ATIVOS da unidade,
 *     calculado em tempo real.
 */

export interface EmpenhoLike {
	arp_item_id: string
	status: string
	quantidade_empenhada: number | string | null
	valor_total: number | string | null
}

export interface LocalCommitment {
	quantidade: number
	valorTotal: number
	count: number
}

/** Soma quantidade/valor dos empenhos ATIVOS, agrupados por item de ARP. Anulados ficam de fora. */
export function aggregateLocalCommitments(empenhos: readonly EmpenhoLike[]): Map<string, LocalCommitment> {
	const byItem = new Map<string, LocalCommitment>()
	for (const e of empenhos) {
		if (e.status !== "ativo") continue
		const acc = byItem.get(e.arp_item_id) ?? { quantidade: 0, valorTotal: 0, count: 0 }
		acc.quantidade += Number(e.quantidade_empenhada ?? 0)
		acc.valorTotal += Number(e.valor_total ?? 0)
		acc.count += 1
		byItem.set(e.arp_item_id, acc)
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
