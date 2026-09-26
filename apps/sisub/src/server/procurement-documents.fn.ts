/**
 * @module procurement-documents.fn
 * Documentos do anexo quantitativo para o processo (change `sisub-procurement-planning-flows`, D6/D7):
 * memória de cálculo das quantidades, relatório de pesquisa de preços (emissão registrada) e o
 * orçamento sigiloso. Wrappers finos das operações de `@iefa/sisub-domain`.
 * @domain core
 */

import {
	emitPriceResearchReport,
	explainAtaNeeds,
	fetchPriceResearchReport,
	type PriceResearchReport,
	type QuantityMemory,
	UpdateAtaDocumentSettingsSchema,
	updateAtaDocumentSettings,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchQuantityMemoryFn = createServerFn({ method: "GET" })
	.validator(z.object({ ataId: z.uuid() }))
	.handler(async ({ data }): Promise<QuantityMemory> => {
		const ctx = await requireAuth()
		return explainAtaNeeds(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchPriceResearchReportFn = createServerFn({ method: "GET" })
	.validator(z.object({ ataId: z.uuid(), emissionId: z.uuid().nullable().optional() }))
	.handler(async ({ data }): Promise<PriceResearchReport | null> => {
		const ctx = await requireAuth()
		return fetchPriceResearchReport(getDb(), ctx, data).catch(handleDomainError)
	})

export const emitPriceResearchReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ ataId: z.uuid() }))
	.handler(async ({ data }): Promise<{ id: string; sequence: number }> => {
		const ctx = await requireAuth()
		return emitPriceResearchReport(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateAtaDocumentSettingsFn = createServerFn({ method: "POST" })
	.validator(UpdateAtaDocumentSettingsSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return updateAtaDocumentSettings(getDb(), ctx, data).catch(handleDomainError)
	})
