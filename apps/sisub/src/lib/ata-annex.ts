import {
	computeAtaItemLimits,
	type DeliveryCycle,
	type DeliveryCycleSource,
	isDeliveryCycle,
	type MinOrderSource,
	type QuantityLimitWarning,
} from "@iefa/sisub-domain"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { csvCell } from "@/lib/csv"
import type { AtaSnapshotComponent } from "@/types/domain/ata"

/** Padrões da ATA que os itens herdam. */
export interface AtaAnnexSettings {
	validityMonths: number | null
	maxMarginPercent: number
	marginJustification: string | null
}

/**
 * Uma linha do anexo de quantitativos, já resolvida. Vem de duas fontes com o mesmo formato:
 * do rascunho (limites calculados agora, editáveis) e do snapshot da publicação (números
 * congelados, sem as escolhas que os produziram).
 */
export interface AtaAnnexRow {
	key: string
	ataItemId: string | null
	folder: string
	catmat: number | null
	catmatDescription: string | null
	description: string
	itemDescription: string | null
	unit: string
	targetQuantity: number
	marginPercent: number | null
	maxQuantity: number | null
	/** Folga da máxima sobre o alvo depois do arredondamento, em %. */
	effectiveMarginPercent: number | null
	deliveryCycle: DeliveryCycle | null
	deliveryCycleSource: DeliveryCycleSource | null
	/** Padrão do insumo, para mostrar quando a ata escolheu diferente. */
	ingredientDeliveryCycle: DeliveryCycle | null
	deliveriesInValidity: number | null
	cycleConsumption: number | null
	suggestedMinOrderQuantity: number | null
	minOrderQuantity: number | null
	minOrderSource: MinOrderSource | null
	unitPrice: number | null
	warnings: QuantityLimitWarning[]
	/** Escolhas gravadas no item (null = herda). Só existem no rascunho. */
	choices: { maxMarginPercent: number | null; minOrderQuantity: number | null } | null
}

/**
 * Unidade do anexo — a MESMA que a lista de itens mostra ao lado da quantidade de compra.
 *
 * Item de compra sem unidade própria (418 vínculos padrão no catálogo) tem a quantidade de
 * compra na unidade do insumo (fator 1). O anexo caía direto em "UN" nesse caso: a lista
 * dizia 17.540 LT de água e o anexo, documento da ata, registrava 17.540 UN.
 */
function annexUnit(purchaseQuantity: number | null | undefined, purchaseUnit: string | null | undefined, measureUnit: string | null | undefined): string {
	if (purchaseQuantity != null) return purchaseUnit ?? measureUnit ?? "UN"
	return measureUnit ?? "UN"
}

/**
 * Unidade em que o anexo conta o item. É também a unidade-alvo da pesquisa de preços: preço e
 * quantidade têm de estar na mesma unidade, senão o valor estimado multiplica coisas diferentes.
 */
export function annexItemUnit(item: { purchase_quantity?: number | null; purchase_measure_unit?: string | null; measure_unit?: string | null }): string {
	return annexUnit(item.purchase_quantity, item.purchase_measure_unit, item.measure_unit)
}

export function buildDraftAnnexRows(items: ProcurementNeed[], settings: AtaAnnexSettings): AtaAnnexRow[] {
	return items.map((item) => {
		const limits = computeAtaItemLimits(
			{
				purchaseQuantity: item.purchase_quantity,
				totalQuantity: item.total_quantity,
				deliveryCycle: item.delivery_cycle,
				ingredientDeliveryCycle: item.ingredient_delivery_cycle,
				conservationClass: item.conservation_class,
				maxMarginPercent: item.max_margin_percent,
				minOrderQuantity: item.min_order_quantity,
			},
			settings
		)
		return {
			key: item.ata_item_id ?? item.ingredient_id,
			ataItemId: item.ata_item_id ?? null,
			folder: item.folder_description || "Sem categoria",
			catmat: item.catmat_item_codigo,
			catmatDescription: item.catmat_item_descricao,
			description: item.purchase_item_description ?? item.catmat_item_descricao ?? item.ingredient_name,
			itemDescription: item.item_description,
			unit: annexUnit(item.purchase_quantity, item.purchase_measure_unit, item.measure_unit),
			targetQuantity: limits.targetQuantity,
			marginPercent: limits.marginPercent,
			maxQuantity: limits.maxQuantity,
			effectiveMarginPercent: limits.effectiveMarginPercent,
			deliveryCycle: limits.deliveryCycle,
			deliveryCycleSource: limits.deliveryCycleSource,
			ingredientDeliveryCycle: isDeliveryCycle(item.ingredient_delivery_cycle) ? item.ingredient_delivery_cycle : null,
			deliveriesInValidity: limits.deliveriesInValidity,
			cycleConsumption: limits.cycleConsumption,
			suggestedMinOrderQuantity: limits.suggestedMinOrderQuantity,
			minOrderQuantity: limits.minOrderQuantity,
			minOrderSource: limits.minOrderSource,
			unitPrice: item.unit_price,
			warnings: limits.warnings,
			choices: {
				maxMarginPercent: item.max_margin_percent ?? null,
				minOrderQuantity: item.min_order_quantity ?? null,
			},
		}
	})
}

/**
 * Linhas da ata publicada. Quantidades, margem, ciclo e mínimo vêm do snapshot (congelados na
 * publicação). Descrição adicional, descrição CATMAT e PREÇO vêm do item vivo: nenhum dos três é
 * congelado, e o preço continua mudando depois de publicar (`updateAtaItemPrices` e a pesquisa de
 * preço seguem valendo). Ler o preço do snapshot fazia o CSV e o valor máximo divergirem da tabela
 * de itens da própria tela. O preço do snapshot fica só como reserva, para item sem linha viva.
 */
export function buildSnapshotAnnexRows(
	components: AtaSnapshotComponent[],
	liveItems: Array<{
		ingredient_id: string | null
		item_description: string | null
		catmat_item_descricao: string | null
		unit_price?: number | null
	}> = []
): AtaAnnexRow[] {
	const liveByIngredient = new Map(liveItems.filter((i) => i.ingredient_id).map((i) => [i.ingredient_id as string, i]))
	return components.map((c, index) => {
		const live = c.ingredient_id ? liveByIngredient.get(c.ingredient_id) : undefined
		const purchaseQuantity = c.purchase_quantity
		const targetQuantity = purchaseQuantity ?? c.total_quantity
		const maxQuantity = c.max_quantity
		return {
			key: `snapshot-${index}`,
			ataItemId: null,
			folder: c.folder_description || "Sem categoria",
			catmat: c.catmat_item_codigo,
			catmatDescription: live?.catmat_item_descricao ?? null,
			description: c.purchase_item_description ?? c.ingredient_name,
			itemDescription: live?.item_description ?? null,
			unit: annexUnit(purchaseQuantity, c.purchase_measure_unit, c.measure_unit),
			targetQuantity,
			marginPercent: c.max_margin_percent,
			maxQuantity,
			effectiveMarginPercent: maxQuantity != null && targetQuantity > 0 ? ((maxQuantity - targetQuantity) / targetQuantity) * 100 : null,
			deliveryCycle: isDeliveryCycle(c.delivery_cycle) ? c.delivery_cycle : null,
			deliveryCycleSource: null,
			ingredientDeliveryCycle: null,
			deliveriesInValidity: null,
			cycleConsumption: null,
			suggestedMinOrderQuantity: null,
			minOrderQuantity: c.min_order_quantity,
			minOrderSource: null,
			unitPrice: live?.unit_price ?? c.unit_price,
			warnings: [],
			choices: null,
		}
	})
}

/** Valor da ata sobre a quantidade MÁXIMA — é o valor que a ata registra, não o do alvo. */
export function annexMaxValue(rows: AtaAnnexRow[]): number {
	return rows.reduce((sum, r) => (r.unitPrice != null && r.maxQuantity != null ? sum + r.maxQuantity * r.unitPrice : sum), 0)
}

const CYCLE_CSV: Record<DeliveryCycle, string> = { weekly: "Semanal", monthly: "Mensal" }
const csvNumber = (value: number | null, digits: number): string => (value == null ? "" : value.toFixed(digits))

/** Anexo de quantitativos em CSV: uma linha por item, na ordem da tela; justificativa ao final. */
export function buildAnnexCsv(rows: AtaAnnexRow[], marginJustification?: string | null): string {
	const headers = [
		"Item",
		"Categoria",
		"CATMAT",
		"Descrição CATMAT",
		"Descrição",
		"Descrição Adicional",
		"Unidade",
		"Qtd Alvo",
		"Margem (%)",
		"Qtd Máxima",
		"Ciclo de Entrega",
		"Qtd Mínima por Pedido",
		"Preço Un. Estimado",
		"Valor Máximo Estimado",
	]
	const lines: Array<Array<string | number | null>> = rows.map((r, index) => [
		index + 1,
		r.folder,
		r.catmat,
		r.catmatDescription,
		r.description,
		r.itemDescription,
		r.unit,
		csvNumber(r.targetQuantity, 4),
		r.marginPercent,
		csvNumber(r.maxQuantity, 0),
		r.deliveryCycle ? CYCLE_CSV[r.deliveryCycle] : "",
		csvNumber(r.minOrderQuantity, r.minOrderQuantity != null && Number.isInteger(r.minOrderQuantity) ? 0 : 4),
		csvNumber(r.unitPrice, 4),
		r.unitPrice != null && r.maxQuantity != null ? (r.maxQuantity * r.unitPrice).toFixed(2) : "",
	])
	if (marginJustification?.trim()) lines.push([], ["Justificativa da margem", marginJustification.trim()])
	return [headers, ...lines].map((line) => line.map(csvCell).join(",")).join("\n")
}

export function downloadCsv(filename: string, csv: string): void {
	// BOM: sem ele o Excel abre o UTF-8 como Latin-1 e estraga todo acento da descrição.
	const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" })
	const link = document.createElement("a")
	link.href = URL.createObjectURL(blob)
	link.download = filename
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 0)
}
