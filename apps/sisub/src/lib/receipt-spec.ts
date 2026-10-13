/**
 * Especificação de compra na conferência do recebimento (`receiving.fn.ts`): qual especificação
 * vale para a linha (a do item de compra, senão a padrão do insumo), a faixa e a validade que ela
 * sugere, e a montagem das linhas que a tela de conferência lê.
 *
 * As leituras ficam na fn; aqui mora só a decisão com os dados na mão. Fica fora de
 * `receiving.fn.ts` porque teste unitário não importa `@/server/*`.
 */

import type { ConservationClass, PackageType, TransportRequirement } from "@iefa/sisub-domain/operations"

/** Linha de especificação lida de `purchase_item` (colunas de acondicionamento). */
export type SpecRow = Record<string, unknown>

export interface RequiredRange {
	minC: number | null
	maxC: number | null
	conservationClass: ConservationClass | null
	minShelfLifeDays: number | null
}

/**
 * A especificação padrão do insumo só é lida quando a da linha não decide a classe: não há
 * especificação da linha, ou ela não tem classe.
 */
export function needsDefaultSpec(lineSpec: SpecRow | null): boolean {
	return !lineSpec || lineSpec.conservation_class == null
}

/** A especificação padrão que veio do embed `purchase_item:purchase_item_id (...)`, desde que não excluída. */
export function activeDefaultSpec(data: unknown): SpecRow | null {
	const candidate = (data as { purchase_item?: SpecRow | null } | null)?.purchase_item ?? null
	return candidate && candidate.deleted_at == null ? candidate : null
}

function numberOrNull(value: unknown): number | null {
	return value != null ? Number(value) : null
}

/**
 * Faixa e validade vêm da especificação da linha quando ela existe, senão da padrão. A classe é
 * a da linha; nula, a da padrão — a mesma resolução de `finalize_goods_receipt`.
 */
export function resolveRequiredRange(lineSpec: SpecRow | null, defaultSpec: SpecRow | null): RequiredRange {
	const spec = lineSpec ?? defaultSpec
	return {
		minC: numberOrNull(spec?.storage_temp_min_c),
		maxC: numberOrNull(spec?.storage_temp_max_c),
		conservationClass: ((lineSpec?.conservation_class ?? defaultSpec?.conservation_class) as ConservationClass | undefined) ?? null,
		minShelfLifeDays: numberOrNull(spec?.min_shelf_life_days_on_delivery),
	}
}

// ── Detalhe do recebimento (`fetchReceiptFn`) ──────────────────────────────

/** Estreita as colunas de CHECK da especificação (o tipo gerado as declara `string`). */
export function narrowSpec<T extends { conservation_class: string | null; package_type: string | null; transport_requirement: string | null }>(spec: T) {
	return {
		...spec,
		conservation_class: spec.conservation_class as ConservationClass | null,
		package_type: spec.package_type as PackageType | null,
		transport_requirement: spec.transport_requirement as TransportRequirement | null,
	}
}

/** Lotes por linha do recebimento, na ordem em que vieram, com a classe estreitada. */
export function groupLotsByItem<L extends { receipt_item_id: string; conservation_class: string | null }>(lots: readonly L[] | null) {
	const narrowedLots = (lots ?? []).map((lot) => ({ ...lot, conservation_class: lot.conservation_class as ConservationClass | null }))
	const lotsByItem = new Map<string, typeof narrowedLots>()
	for (const lot of narrowedLots) {
		const bucket = lotsByItem.get(lot.receipt_item_id)
		if (bucket) bucket.push(lot)
		else lotsByItem.set(lot.receipt_item_id, [lot])
	}
	return lotsByItem
}

/** Mapa por `id` de uma leitura que pode vir nula. */
export function indexById<T extends { id: string }, V>(rows: readonly T[] | null, value: (row: T) => V): Map<string, V> {
	return new Map((rows ?? []).map((row) => [row.id, value(row)]))
}

interface ReceiptItemKeys {
	id: string
	ingredient_id: string | null
	purchase_item_id: string | null
	ingredient_item_id: string | null
}

interface SpecLike {
	conservation_class: ConservationClass | null
}

/** Linha com insumo cuja especificação de compra não existe ou não tem classe: cai na padrão do insumo. */
export function needsDefaultSpecForItem(item: Omit<ReceiptItemKeys, "id" | "ingredient_item_id">, specById: ReadonlyMap<string, SpecLike>): boolean {
	return !!item.ingredient_id && (!item.purchase_item_id || specById.get(item.purchase_item_id)?.conservation_class == null)
}

/** Insumos cuja especificação padrão precisa ser lida, sem repetição. */
export function fallbackIngredientIds(
	items: ReadonlyArray<Omit<ReceiptItemKeys, "id" | "ingredient_item_id">>,
	specById: ReadonlyMap<string, SpecLike>
): string[] {
	return [
		...new Set(
			items
				.filter((item) => needsDefaultSpecForItem(item, specById))
				.map((item) => item.ingredient_id)
				.filter((id) => id != null)
		),
	]
}

/** Especificação padrão por insumo; a excluída não vale. */
export function defaultSpecsByIngredient<
	P extends { conservation_class: string | null; package_type: string | null; transport_requirement: string | null; deleted_at: string | null },
>(links: ReadonlyArray<{ ingredient_id: string; purchase_item: P | null }> | null) {
	return new Map(
		(links ?? []).flatMap((link) =>
			link.purchase_item && link.purchase_item.deleted_at == null ? [[link.ingredient_id, narrowSpec(link.purchase_item)] as const] : []
		)
	)
}

export interface ReceiptItemLookup<LineSpec extends SpecLike, DefaultSpec extends SpecLike, Lot> {
	specById: ReadonlyMap<string, LineSpec>
	defaultSpecByIngredient: ReadonlyMap<string, DefaultSpec>
	names: ReadonlyMap<string, { description: string | null; measure_unit: string | null }>
	gtinByItemId: ReadonlyMap<string, string | null>
	lotsByItem: ReadonlyMap<string, Lot[]>
}

/** O que a conferência mostra da linha além das colunas dela. */
export function receiptItemDetails<LineSpec extends SpecLike, DefaultSpec extends SpecLike, Lot>(
	item: ReceiptItemKeys,
	lookup: ReceiptItemLookup<LineSpec, DefaultSpec, Lot>
) {
	const lineSpec = item.purchase_item_id ? lookup.specById.get(item.purchase_item_id) : undefined
	const defaultSpec = item.ingredient_id ? lookup.defaultSpecByIngredient.get(item.ingredient_id) : undefined
	const name = item.ingredient_id ? lookup.names.get(item.ingredient_id) : undefined
	return {
		description: name?.description ?? "—",
		measure_unit: name?.measure_unit ?? null,
		gtin: item.ingredient_item_id ? (lookup.gtinByItemId.get(item.ingredient_item_id) ?? null) : null,
		conditioning: lineSpec ?? defaultSpec ?? null,
		// A classe que a conferência sugere: a da linha, ou a da padrão quando a da linha é nula.
		suggested_conservation_class:
			lineSpec?.conservation_class ?? (needsDefaultSpecForItem(item, lookup.specById) ? defaultSpec?.conservation_class : null) ?? null,
		lots: lookup.lotsByItem.get(item.id) ?? [],
	}
}
