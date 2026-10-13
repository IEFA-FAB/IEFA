/**
 * Decisões puras do registro da NE com itens (`prepareEmpenhoRegistration`): fatos dos itens de ARP
 * para a conferência NE × ARP, contratação herdada da ARP e favorecido.
 *
 * Fora de `empenho-registration.server.ts` para ser testável sem banco; a função de lá fica só com
 * as leituras, na mesma ordem.
 */

import { type ArpItemFacts, type EmpenhoItemDraft, type EmpenhoType, resolveItemValue } from "@iefa/sisub-domain"
import { resolveSaldoOficial } from "@/lib/arp-balance"
import { normalizeDocument } from "@/lib/expense-execution"

export interface EmpenhoArpItemRow {
	id: string
	arp_id: string
	numero_item: number | null
	descricao_item: string | null
	ni_fornecedor: string | null
	nome_fornecedor: string | null
	valor_unitario: number | null
	quantidade_homologada: number | null
	quantidade_empenhada: number | null
	saldo_empenho: number | null
	medida_catmat: string | null
}

export interface EmpenhoArpHeaderRow {
	unit_id: number | string
	acquisition_id: string | null
	data_vigencia_inicio: string | null
	data_vigencia_fim: string | null
	last_synced_at: string | null
}

/** Itens de ARP citados pela NE, sem repetição e sem vazios. */
export function collectArpItemIds(items: ReadonlyArray<{ arpItemId?: string | null }>): string[] {
	return [...new Set(items.map((item) => item.arpItemId).filter((id): id is string => Boolean(id)))]
}

/** Fatos de um item de ARP para `checkEmpenhoAgainstArp`. */
export function toArpItemFacts(row: EmpenhoArpItemRow, arp: EmpenhoArpHeaderRow, localCommitted: number): ArpItemFacts {
	return {
		id: row.id,
		numeroItem: row.numero_item,
		description: row.descricao_item,
		unitPrice: row.valor_unitario == null ? null : Number(row.valor_unitario),
		officialBalance: row.quantidade_homologada == null && row.saldo_empenho == null ? null : resolveSaldoOficial(row),
		homologatedQuantity: row.quantidade_homologada == null ? null : Number(row.quantidade_homologada),
		localCommitted,
		validFrom: arp.data_vigencia_inicio,
		validTo: arp.data_vigencia_fim,
	}
}

export interface ArpItemsSummary {
	arpItems: Map<string, ArpItemFacts>
	arpUnitByItem: Map<string, string | null>
	/** CNPJ/CPF normalizados dos fornecedores dos itens. */
	suppliers: Set<string>
	/** Nome do primeiro fornecedor com nome, na ordem dos itens. */
	supplierName: string | null
	/** Falso quando alguma ARP dos itens nunca sincronizou (cadastrada à mão). */
	arpSynced: boolean
}

export function emptyArpItemsSummary(): ArpItemsSummary {
	return { arpItems: new Map(), arpUnitByItem: new Map(), suppliers: new Set(), supplierName: null, arpSynced: true }
}

/**
 * Resume os itens de ARP da NE. Item de ARP de outra unidade (ou de ARP não achada) recusa, na
 * ordem dos itens.
 *
 * @throws {Error} "O item da ARP informado não pertence a esta unidade".
 */
export function summarizeArpItems<A extends EmpenhoArpHeaderRow>(
	rows: readonly EmpenhoArpItemRow[],
	arpById: ReadonlyMap<string, A>,
	committed: ReadonlyMap<string, { quantidade: number }>,
	unitId: number
): ArpItemsSummary {
	const summary = emptyArpItemsSummary()
	for (const row of rows) {
		const arp = arpById.get(row.arp_id)
		// Mesmo motivo do import: o item de ARP tem que ser da unidade empenhada. Sem isto, a
		// unidade A empenha contra o saldo da unidade B — e B não consegue anular, porque a
		// anulação resolve a unidade pela linha do empenho, que diria "A".
		if (!arp || Number(arp.unit_id) !== unitId) throw new Error("O item da ARP informado não pertence a esta unidade")
		if (arp.last_synced_at == null) summary.arpSynced = false
		summary.arpItems.set(row.id, toArpItemFacts(row, arp, committed.get(row.id)?.quantidade ?? 0))
		summary.arpUnitByItem.set(row.id, row.medida_catmat)
		const cnpj = normalizeDocument(row.ni_fornecedor)
		if (cnpj) summary.suppliers.add(cnpj)
		summary.supplierName = summary.supplierName ?? row.nome_fornecedor
	}
	return summary
}

/** Contratações distintas das ARPs dos itens. */
export function collectArpAcquisitions(arps: Iterable<{ acquisition_id: string | null }>): string[] {
	return [...new Set([...arps].map((arp) => arp.acquisition_id).filter(Boolean))] as string[]
}

/** A contratação da ARP vira a da NE quando ela não veio e as ARPs apontam para uma só. */
export function pickArpAcquisition(current: string | null, arpAcquisitions: readonly string[]): string | null {
	if (!current && arpAcquisitions.length === 1) return arpAcquisitions[0] as string
	return current
}

/**
 * Favorecido: o informado; senão o da contratação; senão o fornecedor único dos itens da ARP.
 * `empenho.favorecido_cnpj` aceita só CNPJ (14 dígitos): CPF de pessoa física fica no nome.
 */
export function resolveFavorecido(input: {
	informedCnpj: string | null | undefined
	informedNome: string | null | undefined
	acquisitionSupplier: { cnpj: string | null; name: string | null } | null
	suppliers: ReadonlySet<string>
	supplierName: string | null
}): { favorecidoCnpj14: string | null; favorecidoNome: string | null } {
	const { acquisitionSupplier, suppliers } = input
	const favorecidoCnpj =
		normalizeDocument(input.informedCnpj) ?? normalizeDocument(acquisitionSupplier?.cnpj) ?? (suppliers.size === 1 ? ([...suppliers][0] as string) : null)
	const favorecidoCnpj14 = favorecidoCnpj?.length === 14 ? favorecidoCnpj : null
	const favorecidoNome = input.informedNome?.trim() || acquisitionSupplier?.name || (suppliers.size <= 1 ? input.supplierName : null)
	return { favorecidoCnpj14, favorecidoNome: favorecidoNome ?? null }
}

// ─── Valores gravados ────────────────────────────────────────────────────────

/** Campos opcionais do cabeçalho da NE como vão ao insert: textos aparados, vazio vira null. */
export function resolveEmpenhoHeaderFields(data: {
	dataEmpenho: string
	tipo?: EmpenhoType | null
	nd?: string | null
	ptres?: string | null
	fonte?: string | null
	issuerUg?: string | null
	notaLancamento?: string | null
}) {
	return {
		tipo: data.tipo ?? null,
		nd: data.nd ?? null,
		ptres: data.ptres?.trim() || null,
		fonte: data.fonte?.trim() || null,
		issuerUg: data.issuerUg?.trim() || null,
		exercicio: Number(data.dataEmpenho.slice(0, 4)),
		notaLancamento: data.notaLancamento?.trim() || null,
	}
}

/** Item da NE como vai ao insert: descrição e unidade vêm do item da ARP quando não foram informadas. */
export function resolveEmpenhoItemFields(
	item: EmpenhoItemDraft,
	arpItems: ReadonlyMap<string, ArpItemFacts>,
	arpUnitByItem: ReadonlyMap<string, string | null>
) {
	const arp = item.arpItemId ? arpItems.get(item.arpItemId) : undefined
	const arpUnit = item.arpItemId ? (arpUnitByItem.get(item.arpItemId) ?? null) : null
	return {
		arpItemId: item.arpItemId ?? null,
		purchaseItemId: item.purchaseItemId ?? null,
		description: item.description?.trim() || arp?.description || null,
		quantity: item.quantity ?? null,
		unit: item.unit?.trim() || arpUnit,
		unitPrice: item.unitPrice ?? null,
		value: resolveItemValue(item),
	}
}
