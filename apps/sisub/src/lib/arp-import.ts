/**
 * Decisões puras da importação e do cadastro manual de ARP (`importArpItemsFn`, `createManualArpFn`)
 * e da execução por item (`fetchArpExecutionFn`).
 *
 * Ficam fora de `arp.fn.ts` porque teste unitário não pode importar `@/server/*`; o handler fica só
 * com o I/O, na mesma ordem.
 */

import type { ArpSaldo } from "@/lib/arp-compras"
import { anoFromNumeroAta, formatNumeroAta, parseBrDate, parseNumeroItem } from "@/lib/arp-compras"
import { IN_CHUNK_SIZE, readAllPagesByKey } from "@/lib/read-all-pages"
import type { ComprasArpItemResult } from "@/types/domain/arp"

// ─── Vínculos da ARP já existente ────────────────────────────────────────────

/** Vínculo pedido × vínculo já gravado: o existente vence quando os dois diferem. */
function resolveKeptLink(requested: string | null | undefined, existing: string | null | undefined): { id: string | null; isConflict: boolean } {
	if (existing && requested && existing !== requested) return { id: existing, isConflict: true }
	return { id: requested ?? existing ?? null, isConflict: false }
}

/**
 * O upsert pela chave (unidade, número, UASG) trocava o anexo da ARP em silêncio quando ela era
 * reimportada de outro anexo. O vínculo existente (anexo e contratação) é mantido e a tela avisa.
 */
export function resolveArpLinks(input: {
	numeroAta: string
	requestedQuantityEstimateId: string | null | undefined
	requestedAcquisitionId: string | null | undefined
	existing: { quantity_estimate_id: string | null; acquisition_id: string | null } | null
}): { quantityEstimateId: string | null; acquisitionId: string | null; warnings: string[] } {
	const warnings: string[] = []
	const quantityEstimate = resolveKeptLink(input.requestedQuantityEstimateId, input.existing?.quantity_estimate_id)
	if (quantityEstimate.isConflict) {
		warnings.push(`A ARP ${input.numeroAta} já está vinculada a outro anexo quantitativo; o vínculo existente foi mantido`)
	}
	const acquisition = resolveKeptLink(input.requestedAcquisitionId, input.existing?.acquisition_id)
	if (acquisition.isConflict) {
		warnings.push(`A ARP ${input.numeroAta} já está vinculada a outra contratação de origem; o vínculo existente foi mantido`)
	}
	return { quantityEstimateId: quantityEstimate.id, acquisitionId: acquisition.id, warnings }
}

// ─── Casamento com o anexo quantitativo pelo CATMAT ──────────────────────────

export interface CatmatIndex {
	catmatToQuantityEstimateItemId: Map<number, string>
	/** `2_consultarARPItem` não traz unidade de fornecimento; a medida vem do item do anexo, casado pelo mesmo catmat. */
	catmatToMeasureUnit: Map<number, string>
}

export function indexQuantityEstimateItemsByCatmat(
	items: ReadonlyArray<{ id: string; catmat_item_codigo: number | null; measure_unit: string | null }>
): CatmatIndex {
	const catmatToQuantityEstimateItemId = new Map<number, string>()
	const catmatToMeasureUnit = new Map<number, string>()
	for (const item of items) {
		if (item.catmat_item_codigo != null) {
			catmatToQuantityEstimateItemId.set(item.catmat_item_codigo, item.id)
			if (item.measure_unit) catmatToMeasureUnit.set(item.catmat_item_codigo, item.measure_unit)
		}
	}
	return { catmatToQuantityEstimateItemId, catmatToMeasureUnit }
}

function lookupByCatmat(map: ReadonlyMap<number, string>, codigo: number | null | undefined): string | null {
	return codigo != null ? (map.get(codigo) ?? null) : null
}

// ─── Linhas gravadas ─────────────────────────────────────────────────────────

export interface ImportedArpHeader {
	numeroAtaRegistroPreco: string
	codigoUnidadeGerenciadora: string
	nomeUnidadeGerenciadora: string | null
	objeto: string | null
	dataVigenciaFinal: string | null
	statusAta: string | null
}

/** Cabeçalho do upsert da importação: só o que veio da API, gravado como `source: "compras_gov"`. */
export function buildImportedArpRow(
	arpData: ImportedArpHeader,
	ctx: { unitId: number; quantityEstimateId: string | null; acquisitionId: string | null; dataVigenciaInicial: string; lastSyncedAt: string }
) {
	return {
		unit_id: ctx.unitId,
		quantity_estimate_id: ctx.quantityEstimateId,
		acquisition_id: ctx.acquisitionId,
		// Cadastrada à mão antes (API fora do ar): a primeira importação bem-sucedida a
		// torna sincronizada, e os itens são atualizados pelo número, sem duplicar.
		source: "compras_gov" as const,
		numero_ata: arpData.numeroAtaRegistroPreco,
		ano_ata: anoFromNumeroAta(arpData.numeroAtaRegistroPreco),
		uasg_gerenciadora: arpData.codigoUnidadeGerenciadora,
		nome_uasg_gerenciadora: arpData.nomeUnidadeGerenciadora ?? null,
		objeto: arpData.objeto ?? null,
		data_vigencia_inicio: ctx.dataVigenciaInicial,
		data_vigencia_fim: parseBrDate(arpData.dataVigenciaFinal),
		status_ata: arpData.statusAta ?? null,
		last_synced_at: ctx.lastSyncedAt,
	}
}

/**
 * Linha AUSENTE em `4_consultarEmpenhosSaldoItem` = item sem empenho: saldo cheio, e não null (que
 * apareceria na tela como "—"). Linha PRESENTE manda no valor, inclusive quando o saldo dela é zero —
 * o `??` sobre o saldo resolvido conflataria os dois casos.
 */
export function resolveImportedSaldo(
	saldo: ArpSaldo | undefined,
	quantidadeHomologada: number | null | undefined
): { quantidade_empenhada: number; saldo_empenho: number | null } {
	if (saldo) return { quantidade_empenhada: saldo.quantidadeEmpenhada, saldo_empenho: saldo.saldoEmpenho }
	return { quantidade_empenhada: 0, saldo_empenho: quantidadeHomologada ?? null }
}

/** Linha de `arp_item` a partir do item da API, casada com o anexo e com o saldo do endpoint 4. */
export function buildImportedArpItemRow(
	item: ComprasArpItemResult,
	ctx: { arpId: string; saldos: ReadonlyMap<number, ArpSaldo>; catmat: CatmatIndex; syncedAt: string }
) {
	const numero = parseNumeroItem(item.numeroItem)
	const saldo = numero != null ? ctx.saldos.get(numero) : undefined
	const { quantidade_empenhada, saldo_empenho } = resolveImportedSaldo(saldo, item.quantidadeHomologadaItem)
	return {
		arp_id: ctx.arpId,
		quantity_estimate_item_id: lookupByCatmat(ctx.catmat.catmatToQuantityEstimateItemId, item.codigoItem),
		numero_item: numero,
		catmat_item_codigo: item.codigoItem ?? null,
		descricao_item: item.descricaoItem ?? null,
		ni_fornecedor: item.niFornecedor ?? null,
		nome_fornecedor: item.nomeRazaoSocialFornecedor ?? null,
		valor_unitario: item.valorUnitario ?? null,
		quantidade_homologada: item.quantidadeHomologadaItem ?? null,
		medida_catmat: lookupByCatmat(ctx.catmat.catmatToMeasureUnit, item.codigoItem),
		quantidade_empenhada,
		saldo_empenho,
		source: "compras_gov" as const,
		synced_at: ctx.syncedAt,
	}
}

// ─── Reconciliação por número do item ────────────────────────────────────────

/** Indexa os itens já gravados pelo número; item sem número não casa com nada. */
export function indexArpItemsByNumero(items: ReadonlyArray<{ id: string; numero_item: number | null }>): Map<number, string> {
	const byNumeroItem = new Map<number, string>()
	for (const item of items) {
		if (item.numero_item != null) byNumeroItem.set(item.numero_item, item.id)
	}
	return byNumeroItem
}

/**
 * Separa os itens da API em atualizações (casam pelo número com um item gravado) e inserções. A
 * ordem das atualizações é a da API; dois itens da API com o mesmo número atualizam o mesmo id duas
 * vezes, como antes.
 */
export function planArpItemReconciliation<T extends { numeroItem?: string | null }>(
	apiItems: readonly T[],
	byNumeroItem: ReadonlyMap<number, string>
): { updates: Array<{ id: string; item: T }>; newItems: T[]; matchedIds: Set<string> } {
	const updates: Array<{ id: string; item: T }> = []
	const matchedIds = new Set<string>()
	for (const item of apiItems) {
		const numero = parseNumeroItem(item.numeroItem)
		const existingId = numero != null ? byNumeroItem.get(numero) : undefined
		if (existingId) {
			matchedIds.add(existingId)
			updates.push({ id: existingId, item })
		}
	}
	const newItems = apiItems.filter((item) => {
		const numero = parseNumeroItem(item.numeroItem)
		return numero == null || !byNumeroItem.has(numero)
	})
	return { updates, newItems, matchedIds }
}

/** Itens locais que a API não retornou, na ordem da leitura. */
export function listStaleArpItemIds(existingItems: ReadonlyArray<{ id: string }>, matchedIds: ReadonlySet<string>): string[] {
	return existingItems.map((item) => item.id).filter((id) => !matchedIds.has(id))
}

/** Dos itens que saíram da API, só os sem empenho local podem ser apagados. */
export function splitDeletableArpItems(staleIds: readonly string[], referencedIds: ReadonlySet<string | null>): { deletableIds: string[]; kept: number } {
	const deletableIds = staleIds.filter((id) => !referencedIds.has(id))
	return { deletableIds, kept: staleIds.length - deletableIds.length }
}

export function describeKeptStaleItems(kept: number): string | null {
	return kept > 0 ? `${kept} item(ns) que saíram da ARP no Compras.gov.br continuam aqui porque têm empenho` : null
}

// ─── Cadastro manual ─────────────────────────────────────────────────────────

export interface ManualArpInput {
	unitId: number
	acquisitionId?: string | null
	quantityEstimateId?: string | null
	numeroAta: string
	anoAta: string
	uasgGerenciadora: string
	nomeUasgGerenciadora?: string | null
	objeto?: string | null
	vigenciaInicio?: string | null
	vigenciaFim?: string | null
}

export interface ManualArpItemInput {
	numeroItem: number
	descricaoItem: string
	catmatItemCodigo?: number | null
	niFornecedor?: string | null
	nomeFornecedor?: string | null
	valorUnitario: number
	quantidadeHomologada: number
	medida?: string | null
}

export function hasDuplicateItemNumbers(items: ReadonlyArray<{ numeroItem: number }>): boolean {
	const numeros = items.map((item) => item.numeroItem)
	return new Set(numeros).size !== numeros.length
}

/** "2/2025" ou "2" + ano → "00002/2025". */
export function formatNumeroAtaFromInput(numeroAta: string, anoAta: string): string {
	return formatNumeroAta(numeroAta.split("/")[0] ?? numeroAta, anoAta)
}

/** Cabeçalho da ARP cadastrada à mão: `source = 'manual'` e não sincronizada. */
export function buildManualArpRow(data: ManualArpInput, numeroAta: string) {
	return {
		unit_id: data.unitId,
		quantity_estimate_id: data.quantityEstimateId ?? null,
		acquisition_id: data.acquisitionId ?? null,
		numero_ata: numeroAta,
		ano_ata: data.anoAta,
		uasg_gerenciadora: data.uasgGerenciadora,
		nome_uasg_gerenciadora: data.nomeUasgGerenciadora?.trim() || null,
		objeto: data.objeto?.trim() || null,
		data_vigencia_inicio: data.vigenciaInicio ?? null,
		data_vigencia_fim: data.vigenciaFim ?? null,
		source: "manual" as const,
		last_synced_at: null,
	}
}

export function buildManualArpItemRow(arpId: string, item: ManualArpItemInput) {
	return {
		arp_id: arpId,
		numero_item: item.numeroItem,
		descricao_item: item.descricaoItem,
		catmat_item_codigo: item.catmatItemCodigo ?? null,
		ni_fornecedor: item.niFornecedor ?? null,
		nome_fornecedor: item.nomeFornecedor?.trim() || null,
		valor_unitario: item.valorUnitario,
		quantidade_homologada: item.quantidadeHomologada,
		quantidade_empenhada: 0,
		saldo_empenho: item.quantidadeHomologada,
		medida_catmat: item.medida?.trim() || null,
		source: "manual" as const,
	}
}

// ─── Execução orçamentária por item ──────────────────────────────────────────

export interface ArpItemExecution {
	liquidado: number
	pago: number
	aLiquidar: number
}

type NumericLike = number | string | null

/** Soma do valor dos itens de cada NE — a base da proporção que reparte a execução da NE. */
export function sumItemValuesByEmpenho(items: ReadonlyArray<{ empenho_id: string; value: NumericLike }>): Map<string, number> {
	const totalByEmpenho = new Map<string, number>()
	for (const row of items) totalByEmpenho.set(row.empenho_id, (totalByEmpenho.get(row.empenho_id) ?? 0) + Number(row.value))
	return totalByEmpenho
}

type ItemValueRow = { id: string; empenho_id: string; value: NumericLike }

/**
 * Soma dos itens de cada NE, lida por inteiro: os ids do `.in()` em fatias e cada fatia por keyset
 * (`id`; é soma de dinheiro). Sem paginar, o PostgREST cortava em 1000 linhas calado, e a NE que
 * ficava sem nenhuma linha lida saía como "Dado incompleto" sem motivo.
 *
 * `page(chunk, after, pageSize)` aplica `.in("empenho_id", chunk)`, `.gt("id", after)` quando
 * `after` não é nulo, `.order("id")` e `.limit(pageSize)`.
 */
export async function readItemTotalsByEmpenho(
	empenhoIds: readonly string[],
	page: (chunk: string[], after: string | null, pageSize: number) => PromiseLike<{ data: ItemValueRow[] | null; error: { message: string } | null }>
): Promise<Map<string, number>> {
	const unique = [...new Set(empenhoIds)]
	const rows: ItemValueRow[] = []
	for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
		const chunk = unique.slice(i, i + IN_CHUNK_SIZE)
		rows.push(
			...(await readAllPagesByKey(
				"os itens dos empenhos",
				(after: string | null, pageSize) => page(chunk, after, pageSize),
				(row) => row.id
			))
		)
	}
	return sumItemValuesByEmpenho(rows)
}

/**
 * A NE tem proporção para repartir a execução entre os itens? Itens somando zero (NE registrada só
 * pelo total, ou sem o valor de cada item) não têm: a execução dela é dado incompleto por item.
 */
export function hasItemProportion(itemsTotal: number | undefined): boolean {
	return itemsTotal != null && itemsTotal > 0
}

export interface ArpExecution {
	/** Só itens com execução repartida; item cuja única NE não tem proporção fica sem entrada. */
	byItem: Record<string, ArpItemExecution>
	/** NEs ativas cujos itens somam zero: a execução delas não entra em `byItem`. */
	incompleteEmpenhoIds: string[]
}

/**
 * Reparte a execução de cada NE ATIVA entre os itens de ARP dela, na proporção do valor de cada
 * item — leitura de acompanhamento, não lançamento. NE sem linha na view de saldo fica de fora.
 *
 * NE com itens somando zero não tem proporção: fica FORA de `byItem` (nem zero, que se confundiria
 * com "nada liquidado") e sai em `incompleteEmpenhoIds`. Dar o saldo inteiro a cada item (o
 * comportamento antigo) multiplicava o liquidado, o pago e o a liquidar pelo número de itens.
 */
export function computeArpExecutionByItem(input: {
	arpNeItems: ReadonlyArray<{ empenho_id: string; arp_item_id: string | null; value: NumericLike }>
	activeIds: ReadonlySet<string>
	allItems: ReadonlyArray<{ empenho_id: string; value: NumericLike }>
	/** `empenho_id` sai nulável da view, que é filtrada por ele. */
	saldos: ReadonlyArray<{ empenho_id: string | null; valor_liquidado: NumericLike; valor_pago: NumericLike; saldo_a_liquidar: NumericLike }>
}): ArpExecution {
	const totalByEmpenho = sumItemValuesByEmpenho(input.allItems)
	const saldoByEmpenho = new Map(input.saldos.map((saldo) => [saldo.empenho_id, saldo]))

	const byItem: Record<string, ArpItemExecution> = {}
	const incomplete = new Set<string>()
	for (const row of input.arpNeItems) {
		// `arp_item_id` nunca vem nulo: a consulta filtra por ele.
		if (row.arp_item_id == null || !input.activeIds.has(row.empenho_id)) continue
		const saldo = saldoByEmpenho.get(row.empenho_id)
		if (!saldo) continue
		const total = totalByEmpenho.get(row.empenho_id) ?? 0
		if (!hasItemProportion(total)) {
			incomplete.add(row.empenho_id)
			continue
		}
		const share = Number(row.value) / total
		const acc = byItem[row.arp_item_id] ?? { liquidado: 0, pago: 0, aLiquidar: 0 }
		acc.liquidado += Number(saldo.valor_liquidado ?? 0) * share
		acc.pago += Number(saldo.valor_pago ?? 0) * share
		acc.aLiquidar += Number(saldo.saldo_a_liquidar ?? 0) * share
		byItem[row.arp_item_id] = acc
	}
	return { byItem, incompleteEmpenhoIds: [...incomplete].sort() }
}
