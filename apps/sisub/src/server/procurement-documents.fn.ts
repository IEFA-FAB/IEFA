/**
 * @module procurement-documents.fn
 * Documentos do anexo quantitativo para o processo (change `sisub-procurement-planning-flows`, D6/D7):
 * memória de cálculo das quantidades, relatório de pesquisa de preços (emissão registrada) e o
 * orçamento sigiloso. Wrappers finos das operações de `@iefa/sisub-domain`.
 * @domain core
 */

import {
	emitPriceResearchReport,
	explainQuantityEstimateNeeds,
	fetchPriceResearchReport,
	type PriceResearchReport,
	type QuantityMemory,
	UpdateQuantityEstimateDocumentSettingsSchema,
	updateQuantityEstimateDocumentSettings,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchQuantityMemoryFn = createServerFn({ method: "GET" })
	.validator(z.object({ quantityEstimateId: z.uuid() }))
	.handler(async ({ data }): Promise<QuantityMemory> => {
		const ctx = await requireAuth()
		return explainQuantityEstimateNeeds(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchPriceResearchReportFn = createServerFn({ method: "GET" })
	.validator(z.object({ quantityEstimateId: z.uuid(), emissionId: z.uuid().nullable().optional() }))
	.handler(async ({ data }): Promise<PriceResearchReport | null> => {
		const ctx = await requireAuth()
		return fetchPriceResearchReport(getDb(), ctx, data).catch(handleDomainError)
	})

export const emitPriceResearchReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ quantityEstimateId: z.uuid() }))
	.handler(async ({ data }): Promise<{ id: string; sequence: number }> => {
		const ctx = await requireAuth()
		return emitPriceResearchReport(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateQuantityEstimateDocumentSettingsFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateDocumentSettingsSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return updateQuantityEstimateDocumentSettings(getDb(), ctx, data).catch(handleDomainError)
	})
