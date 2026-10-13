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
	UpdateQuantityEstimateDocumentSettingsSchema,
	updateQuantityEstimateDocumentSettings,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchQuantityMemoryFn = createServerFn({ method: "GET" })
	.validator(z.object({ quantityEstimateId: z.uuid() }))
	.handler(requireAuthThenRun(explainQuantityEstimateNeeds))

export const fetchPriceResearchReportFn = createServerFn({ method: "GET" })
	.validator(z.object({ quantityEstimateId: z.uuid(), emissionId: z.uuid().nullable().optional() }))
	.handler(requireAuthThenRun(fetchPriceResearchReport))

export const emitPriceResearchReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ quantityEstimateId: z.uuid() }))
	.handler(requireAuthThenRun(emitPriceResearchReport))

export const updateQuantityEstimateDocumentSettingsFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateDocumentSettingsSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateDocumentSettings))
