/**
 * @module arp-commitments.server
 * Comprometimento LOCAL por item de ARP: a soma dos itens de NE ativos da unidade
 * (`finance.empenho_item`), calculada na leitura. É grandeza diferente do retrato oficial do
 * Compras.gov.br (`procurement_arp_item.quantidade_empenhada`), que inclui outros órgãos e caronas
 * e só muda na sincronização — as telas mostram os dois lado a lado, sem somar.
 *
 * Lido pelos itens da NE, não por `empenho.arp_item_id`: NE com vários itens tem o cabeçalho nulo.
 * Paginado: um item de ARP popular passa de mil itens de NE num exercício.
 */

import { aggregateLocalCommitments, type LocalCommitment } from "@/lib/arp-balance"
import { readAllPagesIn } from "@/lib/read-all-pages"
import { getFinanceClient } from "@/lib/supabase.server"

export async function loadLocalCommitments(arpItemIds: readonly string[]): Promise<Map<string, LocalCommitment>> {
	if (arpItemIds.length === 0) return new Map()
	const fin = getFinanceClient()
	const rows = await readAllPagesIn("itens de empenho", arpItemIds, (chunk, from, to) =>
		fin.from("empenho_item").select("empenho_id, arp_item_id, quantity, value").in("arp_item_id", chunk).order("id").range(from, to)
	)
	const empenhos = await readAllPagesIn("empenhos", [...new Set(rows.map((row) => row.empenho_id))], (chunk, from, to) =>
		fin.from("empenho").select("id, status").in("id", chunk).order("id").range(from, to)
	)
	const statusById = new Map(empenhos.map((e) => [e.id, e.status]))
	return aggregateLocalCommitments(
		// `arp_item_id` nunca vem nulo: a consulta filtra por ele.
		rows.flatMap(({ arp_item_id, empenho_id, quantity, value }) =>
			arp_item_id == null
				? []
				: [
						{
							arp_item_id,
							// Item de NE cujo cabeçalho não voltou não conta: sem status, não é "ativo".
							status: statusById.get(empenho_id) ?? "anulado",
							quantidade_empenhada: quantity,
							valor_total: value,
						},
					]
		)
	)
}
