import type { OpenResearchFinding } from "@iefa/sisub-domain"
import { useCallback, useMemo, useRef, useState } from "react"
import type { PriceResearchAuditIds } from "@/components/features/local/price-research/PriceResearchModal"
import { annexItemUnit } from "@/lib/ata-annex"
import { autoSelectPrice, fetchAllPagesForCatmat } from "@/lib/price-research-utils"
import { savePrecoAuditFn } from "@/server/price-research.fn"

export interface BulkResearchItem {
	catmat_item_codigo: number | null | undefined
	catmat_item_descricao?: string | null
	ingredient_id: string
	ingredient_name: string
	ata_item_id?: string | null
	/** Unidade de compra do item: os preços das amostras são convertidos para ela. */
	purchase_measure_unit?: string | null
	/** Unidade do insumo: é a do anexo quando o item de compra não declara a própria. */
	measure_unit?: string | null
	purchase_quantity?: number | null
}

export interface BulkResearchResult {
	ingredientId: string
	ataItemId?: string | null
	price: number
	/** Memória de cálculo gravada. Sem ela o preço não é aplicado: preço sem pesquisa não se audita. */
	auditIds: PriceResearchAuditIds
	/**
	 * Não conformidades em aberto gravadas na pesquisa (ex.: menos de 3 preços). Não travam o
	 * preço; resolve-se abrindo a pesquisa do item e preenchendo a justificativa ali.
	 */
	openFindings: OpenResearchFinding[]
}

export interface BulkPriceProgress {
	done: number
	total: number
	errors: number
	isRunning: boolean
}

const CONCURRENCY = 4

/**
 * Aviso de fim do lote sobre as pesquisas não conformes: quantas e onde se resolve. null quando
 * todas estão conformes.
 */
export function bulkFindingsNotice(results: BulkResearchResult[]): string | null {
	const toJustify = results.filter((r) => r.openFindings.some((f) => f.justifiable)).length
	const toRedo = results.filter((r) => r.openFindings.some((f) => !f.justifiable)).length
	if (toJustify === 0 && toRedo === 0) return null
	const parts: string[] = []
	if (toJustify > 0)
		parts.push(
			`${toJustify} ${toJustify === 1 ? "pesquisa ficou" : "pesquisas ficaram"} com não conformidade que se resolve por justificativa (ex.: menos de 3 preços): abra a pesquisa do item e registre a justificativa.`
		)
	if (toRedo > 0)
		parts.push(
			`${toRedo} ${toRedo === 1 ? "pesquisa pede" : "pesquisas pedem"} correção antes de refazer (ex.: item de compra sem unidade declarada): o motivo está na pesquisa do item.`
		)
	return `O preço foi aplicado. ${parts.join(" ")}`
}

export function useBulkPriceResearch(items: BulkResearchItem[], ataId?: string, onItemResult?: (result: BulkResearchResult) => Promise<void> | void) {
	const [progress, setProgress] = useState<BulkPriceProgress>({ done: 0, total: 0, errors: 0, isRunning: false })

	// Ref keeps the callback current without forcing start() to rebuild on every render
	const onItemResultRef = useRef(onItemResult)
	onItemResultRef.current = onItemResult

	const eligibleItems = useMemo(() => items.filter((i) => i.catmat_item_codigo != null), [items])

	const start = useCallback(async (): Promise<BulkResearchResult[]> => {
		if (eligibleItems.length === 0) return []

		setProgress({ done: 0, total: eligibleItems.length, errors: 0, isRunning: true })

		const results: BulkResearchResult[] = []

		const processItem = async (item: BulkResearchItem) => {
			try {
				const { results: samples } = await fetchAllPagesForCatmat(item.catmat_item_codigo as number)
				const selected = autoSelectPrice(samples, { targetUnit: annexItemUnit(item) })

				if (!selected) {
					setProgress((prev) => ({ ...prev, done: prev.done + 1, errors: prev.errors + 1 }))
					return
				}

				// Sem memória de cálculo gravada o preço não entra no anexo: a falha conta como erro
				// do item, e a pesquisa pode ser refeita. Aplicar mesmo assim deixava preço sem suporte.
				const saved = await savePrecoAuditFn({
					data: {
						catmatCodigo: item.catmat_item_codigo as number,
						catmatDescricao: item.catmat_item_descricao ?? null,
						method: selected.method,
						referencePrice: selected.price,
						stats: selected.stats,
						rawCount: selected.rawCount,
						dateFilteredCount: selected.dateFilteredCount,
						periodMonths: selected.periodMonths,
						validCount: selected.validCount,
						outlierCount: selected.outlierCount,
						validSamples: selected.validSamples,
						outlierSamples: selected.outlierSamples,
						inconsistentSamples: selected.inconsistentSamples,
						measureUnit: selected.unit,
						unitInferred: selected.unitInferred,
						// O lote não escolhe amostra à mão; o servidor confere pela classificação recebida.
						manualSelection: false,
						ataId,
						ataItemId: item.ata_item_id ?? undefined,
					},
				})

				// Não conformidades como o servidor as calculou e gravou; o cliente não refaz a conta.
				const auditIds: PriceResearchAuditIds = { researchId: saved.researchId, researchItemId: saved.researchItemId }
				const result: BulkResearchResult = {
					ingredientId: item.ingredient_id,
					ataItemId: item.ata_item_id,
					price: selected.price,
					auditIds,
					openFindings: saved.openFindings,
				}
				// Se quem aplica o preço falhar (o servidor recusa preço sem pesquisa que o sustente), o
				// item conta como erro: engolir a falha fazia o toast anunciar preço que não foi gravado.
				await onItemResultRef.current?.(result)
				results.push(result)

				setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
			} catch {
				setProgress((prev) => ({ ...prev, done: prev.done + 1, errors: prev.errors + 1 }))
			}
		}

		// Stripe workers: worker i processes items i, i+CONCURRENCY, i+2*CONCURRENCY, …
		// Each worker runs its items sequentially; all workers run in parallel.
		const stripe = Math.min(CONCURRENCY, eligibleItems.length)
		await Promise.all(
			Array.from({ length: stripe }, (_, workerIdx) =>
				(async () => {
					for (let i = workerIdx; i < eligibleItems.length; i += stripe) {
						await processItem(eligibleItems[i])
					}
				})()
			)
		)

		setProgress((prev) => ({ ...prev, isRunning: false }))
		return results
	}, [eligibleItems, ataId])

	return { start, progress, eligibleCount: eligibleItems.length }
}
