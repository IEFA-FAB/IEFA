/**
 * Nota de empenho com itens (change `sisub-flexible-expense-execution`, D3): regras puras.
 *
 * A NE é o documento; cada item aponta, quando houver, para o item da ARP ou o item de compra. A
 * conferência NE × ARP (preço registrado, saldo e vigência da ata) produz AVISOS, não recusas: a
 * NE já foi emitida no SIAFI, e o sisub registra o fato e mostra o que precisa de justificativa ou
 * correção. O que a lei manda recusar (liquidar acima do vigente, anular abaixo do liquidado) é
 * conferido nos triggers do banco.
 */

export const EMPENHO_TYPES = ["ordinario", "estimativo", "global"] as const
export type EmpenhoType = (typeof EMPENHO_TYPES)[number]

export interface EmpenhoItemDraft {
	arpItemId?: string | null
	purchaseItemId?: string | null
	description?: string | null
	quantity?: number | null
	unit?: string | null
	unitPrice?: number | null
	value: number
}

export interface EmpenhoItemProblem {
	index: number
	message: string
}

const cents = (value: number) => Math.round(value * 100) / 100

/** Valor do item: o informado; com quantidade e preço e sem valor, o produto. */
export function resolveItemValue(item: Pick<EmpenhoItemDraft, "quantity" | "unitPrice" | "value">): number {
	if (item.value > 0) return cents(item.value)
	if (item.quantity != null && item.unitPrice != null) return cents(item.quantity * item.unitPrice)
	return cents(item.value)
}

/**
 * Problemas que impedem gravar os itens (dado incoerente, não irregularidade): sem item, valor
 * negativo, quantidade × preço que não fecha com o valor. NE estimativa ou global aceita item só
 * com valor.
 */
export function empenhoItemProblems(items: readonly EmpenhoItemDraft[]): EmpenhoItemProblem[] {
	const problems: EmpenhoItemProblem[] = []
	if (items.length === 0) return [{ index: -1, message: "A nota de empenho precisa de pelo menos um item (ou só o valor)" }]
	items.forEach((item, index) => {
		const value = resolveItemValue(item)
		if (!(value > 0)) problems.push({ index, message: `Item ${index + 1}: informe o valor` })
		if (item.quantity != null && !(item.quantity > 0)) problems.push({ index, message: `Item ${index + 1}: quantidade deve ser positiva` })
		if (item.unitPrice != null && item.unitPrice < 0) problems.push({ index, message: `Item ${index + 1}: preço não pode ser negativo` })
		if (item.quantity != null && item.unitPrice != null && item.value > 0) {
			const product = cents(item.quantity * item.unitPrice)
			// Tolerância de 1 centavo por arredondamento do preço unitário a 4 casas.
			if (Math.abs(product - cents(item.value)) > 0.01) {
				problems.push({ index, message: `Item ${index + 1}: quantidade × preço (${product.toFixed(2)}) não fecha com o valor (${item.value.toFixed(2)})` })
			}
		}
	})
	return problems
}

export function sumEmpenhoItems(items: readonly EmpenhoItemDraft[]): number {
	return cents(items.reduce((sum, item) => sum + resolveItemValue(item), 0))
}

// ─── Conferência NE × ARP ──────────────────────────────────────────────────────

export interface ArpItemFacts {
	id: string
	numeroItem: number | null
	description: string | null
	/** Preço registrado na ata. */
	unitPrice: number | null
	/** Saldo oficial (Compras.gov.br): homologada − empenhada, ou `saldo_empenho`. */
	officialBalance: number | null
	/** Quantidade registrada (homologada) do item na ata. */
	homologatedQuantity: number | null
	/** Já empenhado por ESTA unidade em NEs ativas (soma dos `empenho_item`). */
	localCommitted: number
	/** Vigência da ARP ("YYYY-MM-DD"). */
	validFrom: string | null
	validTo: string | null
}

export type ArpConformityCode = "price_differs" | "above_balance" | "outside_validity" | "arp_not_synced"

export interface ArpConformityWarning {
	arpItemId: string
	code: ArpConformityCode
	message: string
}

/**
 * Saldo que a NE pode usar: o MENOR entre o saldo oficial e o homologado menos o já empenhado por
 * esta unidade. O oficial só muda na sincronização — numa ARP cadastrada à mão ele é o homologado
 * cheio até a primeira importação —, então sem o local duas NEs seguidas empenhariam o dobro sem
 * aviso. Sem nenhum dos dois conhecido, null (não se confere).
 */
export function availableArpBalance(arp: Pick<ArpItemFacts, "officialBalance" | "homologatedQuantity" | "localCommitted">): number | null {
	const local = arp.homologatedQuantity != null ? arp.homologatedQuantity - arp.localCommitted : null
	if (arp.officialBalance == null) return local
	if (local == null) return arp.officialBalance
	return Math.min(arp.officialBalance, local)
}

/**
 * Avisos de uma NE de registro de preços contra a ata: preço diferente do registrado, quantidade
 * acima do saldo e data da NE fora da vigência. O saldo que vale é o menor entre o oficial e o
 * homologado menos o empenhado localmente — o oficial só muda na sincronização.
 */
export function checkEmpenhoAgainstArp(input: {
	empenhoDate: string
	items: ReadonlyArray<Pick<EmpenhoItemDraft, "arpItemId" | "quantity" | "unitPrice">>
	arpItems: ReadonlyMap<string, ArpItemFacts>
	/** ARP sem sincronização: o saldo oficial não é conhecido. */
	arpSynced?: boolean
}): ArpConformityWarning[] {
	const warnings: ArpConformityWarning[] = []
	const requestedByItem = new Map<string, number>()
	for (const item of input.items) {
		if (!item.arpItemId || item.quantity == null) continue
		requestedByItem.set(item.arpItemId, (requestedByItem.get(item.arpItemId) ?? 0) + item.quantity)
	}

	const seen = new Set<string>()
	for (const item of input.items) {
		if (!item.arpItemId || seen.has(item.arpItemId)) continue
		seen.add(item.arpItemId)
		const arp = input.arpItems.get(item.arpItemId)
		if (!arp) continue
		const label = `Item ${arp.numeroItem ?? "?"}${arp.description ? ` (${arp.description})` : ""}`

		if (item.unitPrice != null && arp.unitPrice != null && Math.abs(item.unitPrice - arp.unitPrice) > 0.00005) {
			warnings.push({
				arpItemId: arp.id,
				code: "price_differs",
				message: `${label}: preço da NE (${item.unitPrice.toFixed(4)}) diferente do registrado na ata (${arp.unitPrice.toFixed(4)}) — justifique ou corrija`,
			})
		}

		const requested = requestedByItem.get(arp.id) ?? 0
		const available = availableArpBalance(arp)
		if (requested > 0 && available != null) {
			if (requested > available + 0.00005) {
				warnings.push({
					arpItemId: arp.id,
					code: "above_balance",
					message: `${label}: a NE pede ${formatQty(requested)}, acima do saldo da ata (${formatQty(available)}) — confira o saldo no Compras.gov.br`,
				})
			}
		}

		const date = input.empenhoDate.slice(0, 10)
		if ((arp.validFrom && date < arp.validFrom) || (arp.validTo && date > arp.validTo)) {
			warnings.push({
				arpItemId: arp.id,
				code: "outside_validity",
				message: `${label}: NE de ${formatDate(date)} fora da vigência da ata (${formatDate(arp.validFrom)} a ${formatDate(arp.validTo)})`,
			})
		}
	}

	if (input.arpSynced === false && seen.size > 0) {
		warnings.push({
			arpItemId: [...seen][0] as string,
			code: "arp_not_synced",
			message: "ARP cadastrada à mão e ainda não sincronizada: o saldo oficial não foi conferido",
		})
	}
	return warnings
}

function formatQty(value: number): string {
	return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value)
}

function formatDate(iso: string | null): string {
	if (!iso) return "—"
	const [year, month, day] = iso.slice(0, 10).split("-")
	return `${day}/${month}/${year}`
}

// ─── Vínculo derivado ─────────────────────────────────────────────────────────

/**
 * "Sem contratação de origem" é derivado, não coluna: a NE sem `acquisition_id` e sem nenhum
 * item com ARP. Pendência "vincular a contratação de origem" — a NE continua usável.
 */
export function isEmpenhoWithoutOrigin(empenho: { acquisitionId: string | null; itemArpItemIds: ReadonlyArray<string | null> }): boolean {
	return empenho.acquisitionId == null && !empenho.itemArpItemIds.some((id) => id != null)
}

/** Número de NE normalizado como o banco guarda (trim + caixa alta). */
export function normalizeEmpenhoNumber(value: string): string {
	return value.trim().toUpperCase()
}
