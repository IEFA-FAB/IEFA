/**
 * Documentos do anexo quantitativo (change `sisub-procurement-planning-flows`, D6/D7), no banco real:
 * memória de cálculo que fecha com o cálculo, emissão do relatório de pesquisa de preços
 * reproduzível depois de repesquisar, e mínima a ser cotada congelada na conclusão.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	calculateQuantityEstimateNeeds,
	createQuantityEstimateDraft,
	emitPriceResearchReport,
	explainQuantityEstimateNeeds,
	fetchPriceResearchReport,
	fetchQuantityEstimateDetails,
	savePriceResearchAudit,
	saveQuantityEstimateDraftItems,
	updateQuantityEstimateDocumentSettings,
	updateQuantityEstimateDraft,
	updateQuantityEstimateItemDescription,
	updateQuantityEstimateItemPrices,
	updateQuantityEstimateLimits,
	updateQuantityEstimateStatus,
} from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("documentos do anexo quantitativo", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("quantity_estimate")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("memória fecha com o cálculo; emissão reproduz depois de repesquisar; mínima cotada congela", async () => {
		if (!reachable || !seeder || !db) return
		const testDb = db
		const ctx = { ...fullAccessCtx(), userId: await seeder.seedAuthUser() }
		const tag = uid("TESTDOC-")
		// Amostras de teste no catálogo compartilhado: identificadas pelo prefixo e apagadas no fim.
		seeder.trackFn(async () => {
			await testDb.execute(sql`delete from procurement.price_sample where id_compra like ${`${tag}%`}`)
		}, "amostras de teste")

		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const ingredientId = await seeder.seedIngredient({ measureUnit: "KG" })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 1, ingredients: [{ ingredientId, netQuantity: 0.2 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId, templateType: "weekly" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 100 })
		const kitchenSelections = [
			{
				kitchenId,
				kitchenName: "K",
				deliveryNotes: "",
				templateSelections: [{ templateId, templateName: "T", repetitions: 4 }],
				eventSelections: [],
				exceptionSelections: [],
			},
		]

		const { id: quantityEstimateId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", quantityEstimateId)
		await updateQuantityEstimateDraft(db, ctx, { draftId: quantityEstimateId, title: "Anexo de teste", kitchenSelections })
		const needs = await calculateQuantityEstimateNeeds(db, ctx, { kitchenSelections })
		await saveQuantityEstimateDraftItems(db, ctx, { draftId: quantityEstimateId, items: needs.map((n) => ({ ...n, catmat_item_codigo: 447599 })) })

		// Memória: 100 comensais × 0,2 kg × 4 repetições = 80 kg, numa parcela.
		const memory = await explainQuantityEstimateNeeds(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(memory.contributions).toHaveLength(1)
		expect(memory.contributions[0]).toMatchObject({ headcount: 100, netQuantity: 0.2, repetitions: 4, quantity: 80, kitchenId })
		expect(memory.needs[0].estimated_quantity).toBe(80)

		const item = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimateId }))?.items[0]
		if (!item) throw new Error("item não persistido")
		const research = async (prices: number[]) => {
			const samples = prices.map((p, i) => ({
				idCompra: `${tag}-${p}-${i}`,
				idItemCompra: i + 1,
				precoUnitario: p,
				capacidadeUnidadeFornecimento: 0,
				siglaUnidadeFornecimento: "KG",
				codigoUasg: `9${i}`,
				dataResultado: "2026-08-01",
				niFornecedor: "00.000.000/0001-00",
				nomeFornecedor: "Fornecedor de teste",
			}))
			const median = [...prices].sort((a, b) => a - b)[1]
			const ids = await savePriceResearchAudit(testDb, ctx, {
				catmatCodigo: 447599,
				method: "median",
				referencePrice: median,
				stats: { mean: median, median, stdDev: 0, cv: 0, min: Math.min(...prices), max: Math.max(...prices), uniqueSources: 3 },
				rawCount: 3,
				validCount: 3,
				validSamples: samples,
				outlierSamples: [],
				measureUnit: "KG",
				quantityEstimateId: quantityEstimateId,
				quantityEstimateItemId: item.id,
			})
			await updateQuantityEstimateItemPrices(testDb, ctx, {
				quantityEstimateId: quantityEstimateId,
				updates: [{ quantityEstimateItemId: item.id, price: median }],
				researchLinks: [{ quantityEstimateItemId: item.id, ...ids }],
			})
			return median
		}

		await research([10, 11, 12])
		const first = await emitPriceResearchReport(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(first.sequence).toBe(1)
		let report = await fetchPriceResearchReport(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(report?.emission.verified).toBe(true)
		expect(report?.items[0].unitPrice).toBe(11)
		expect(report?.items[0].research?.createdByName).toBeTruthy()
		expect(report?.items[0].research?.samples[0]).toMatchObject({
			convertedPrice: expect.any(String),
			conversion: "KG = 1 KG",
			nomeFornecedor: "Fornecedor de teste",
		})
		expect(report?.csv.split("\n").filter(Boolean)).toHaveLength(4)

		// Editar o anexo depois da emissão não a invalida: ela congelou o que usou.
		await updateQuantityEstimateItemDescription(db, ctx, { quantityEstimateItemId: item.id, description: "descrição editada depois" })

		// Repesquisou e o preço mudou: a emissão nº 1 continua reproduzível, com o preço dela.
		await research([20, 21, 22])
		const second = await emitPriceResearchReport(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(second.sequence).toBe(2)
		const old = await fetchPriceResearchReport(db, ctx, { quantityEstimateId: quantityEstimateId, emissionId: first.id })
		expect(old?.emission.verified).toBe(true)
		expect(old?.items[0].unitPrice).toBe(11)
		report = await fetchPriceResearchReport(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(report?.emission.sequence).toBe(2)
		expect(report?.items[0].unitPrice).toBe(21)
		expect(report?.emissions.map((e) => e.sequence)).toEqual([2, 1])

		// Orçamento sigiloso e mínima a ser cotada (25% da máxima), congelada na conclusão.
		await updateQuantityEstimateDocumentSettings(db, ctx, { quantityEstimateId: quantityEstimateId, isBudgetConfidential: true })
		await updateQuantityEstimateLimits(db, ctx, { quantityEstimateId: quantityEstimateId, minQuotePercent: 25 })
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimateId, status: "completed" })
		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimateId })
		expect(details?.is_budget_confidential).toBe(true)
		const component = details?.meta.snapshot?.components[0]
		expect(component?.max_quantity).toBe(96) // 80 kg + 20% de acréscimo padrão
		expect(component?.min_quote_quantity).toBe(24)
	}, 120_000)
})
