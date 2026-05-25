import { useCallback, useMemo, useState } from "react"
import type { PriceResearchAuditIds } from "@/components/features/local/price-research/PriceResearchModal"
import { autoSelectPrice, fetchAllPagesForCatmat } from "@/lib/price-research-utils"
import { savePrecoAuditFn } from "@/server/price-research.fn"

export interface BulkResearchItem {
	catmat_item_codigo: number | null | undefined
	catmat_item_descricao?: string | null
	ingredient_id: string
	ingredient_name: string
	ata_item_id?: string | null
}

export interface BulkResearchResult {
	ingredientId: string
	ataItemId?: string | null
	price: number
	auditIds: PriceResearchAuditIds | null
}

export interface BulkPriceProgress {
	done: number
	total: number
	errors: number
	isRunning: boolean
}

export function useBulkPriceResearch(items: BulkResearchItem[], ataId?: string) {
	const [progress, setProgress] = useState<BulkPriceProgress>({ done: 0, total: 0, errors: 0, isRunning: false })

	const eligibleItems = useMemo(() => items.filter((i) => i.catmat_item_codigo != null), [items])

	const start = useCallback(async (): Promise<BulkResearchResult[]> => {
		if (eligibleItems.length === 0) return []

		setProgress({ done: 0, total: eligibleItems.length, errors: 0, isRunning: true })

		const results: BulkResearchResult[] = []

		for (const item of eligibleItems) {
			try {
				const allResults = await fetchAllPagesForCatmat(item.catmat_item_codigo as number)
				const selected = autoSelectPrice(allResults)

				if (!selected) {
					setProgress((prev) => ({ ...prev, done: prev.done + 1, errors: prev.errors + 1 }))
					continue
				}

				let auditIds: PriceResearchAuditIds | null = null
				try {
					auditIds = await savePrecoAuditFn({
						data: {
							catmatCodigo: item.catmat_item_codigo as number,
							catmatDescricao: item.catmat_item_descricao ?? null,
							method: selected.method,
							referencePrice: selected.price,
							stats: selected.stats,
							rawCount: selected.rawCount,
							validCount: selected.validCount,
							outlierCount: selected.outlierCount,
							validSamples: selected.validSamples,
							outlierSamples: selected.outlierSamples,
							ataId,
							ataItemId: item.ata_item_id ?? undefined,
						},
					})
				} catch {
					// audit save is non-fatal — price still applied
				}

				results.push({ ingredientId: item.ingredient_id, ataItemId: item.ata_item_id, price: selected.price, auditIds })
				setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
			} catch {
				setProgress((prev) => ({ ...prev, done: prev.done + 1, errors: prev.errors + 1 }))
			}
		}

		setProgress((prev) => ({ ...prev, isRunning: false }))
		return results
	}, [eligibleItems, ataId])

	return { start, progress, eligibleCount: eligibleItems.length }
}
