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
import { getServerClient } from "@/lib/supabase.server"

// TODO: regenerar tipos após aplicar 20260926214000 — `finance.empenho_item` ainda não está em `generated.ts`.
// biome-ignore lint/suspicious/noExplicitAny: tabela nova fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any }

export async function loadLocalCommitments(arpItemIds: readonly string[]): Promise<Map<string, LocalCommitment>> {
	if (arpItemIds.length === 0) return new Map()
	const fin = getServerClient("finance") as unknown as LooseClient
	const rows = await readAllPagesIn<{ empenho_id: string; arp_item_id: string; quantity: number | string | null; value: number | string }>(
		"itens de empenho",
		arpItemIds,
		(chunk, from, to) => fin.from("empenho_item").select("empenho_id, arp_item_id, quantity, value").in("arp_item_id", chunk).order("id").range(from, to)
	)
	const empenhos = await readAllPagesIn<{ id: string; status: string }>("empenhos", [...new Set(rows.map((row) => row.empenho_id))], (chunk, from, to) =>
		fin.from("empenho").select("id, status").in("id", chunk).order("id").range(from, to)
	)
	const statusById = new Map(empenhos.map((e) => [e.id, e.status]))
	return aggregateLocalCommitments(
		rows.map((row) => ({
			arp_item_id: row.arp_item_id,
			// Item de NE cujo cabeçalho não voltou não conta: sem status, não é "ativo".
			status: statusById.get(row.empenho_id) ?? "anulado",
			quantidade_empenhada: row.quantity,
			valor_total: row.value,
		}))
	)
}
