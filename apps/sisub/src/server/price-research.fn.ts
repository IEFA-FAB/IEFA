/**
 * @module price-research.fn
 * Price research against Compras.gov.br material price data with retry/backoff fetch.
 * A consulta externa fica aqui (é HTTP, não banco); a persistência da memória de cálculo
 * delega a `savePriceResearchAudit` de @iefa/sisub-domain (Drizzle).
 * @domain external
 * @migration done
 */

import { COMPRAS_MAX_PAGE_SIZE, COMPRAS_MIN_PAGE_SIZE } from "@iefa/compras-api"
import { savePriceResearchAudit } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission, requireUserId } from "@/lib/auth.server"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"
import { parseComprasJson } from "@/lib/compras-json"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { ComprasMaterialPricePage } from "@/types/domain/price-research"

export const searchMaterialPricesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			codigoItemCatalogo: z.number().int().positive(),
			pagina: z.number().int().min(1).default(1),
			tamanhoPagina: z.number().int().min(COMPRAS_MIN_PAGE_SIZE).max(COMPRAS_MAX_PAGE_SIZE).default(COMPRAS_MAX_PAGE_SIZE),
			estado: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ComprasMaterialPricePage> => {
		await requireUserId()
		// `parseAs: "text"` de propósito: `idCompra` é um inteiro de 17 dígitos e o
		// JSON.parse do openapi-fetch corromperia os últimos dígitos antes de nós
		// vermos o valor. Ver parseComprasJson.
		const raw = unwrapCompras(
			await comprasApi.GET("/modulo-pesquisa-preco/1_consultarMaterial", {
				params: {
					query: {
						// O item consultado vai no par `tipo`/`codigo` — os dois obrigatórios.
						tipo: "codigoItemCatalogo",
						codigo: String(data.codigoItemCatalogo),
						pagina: data.pagina,
						tamanhoPagina: data.tamanhoPagina,
						...(data.estado ? { estado: data.estado } : {}),
					},
				},
				parseAs: "text",
			})
		)
		return parseComprasJson<ComprasMaterialPricePage>(raw)
	})

// ─── Schema de amostra (subconjunto de ComprasMaterialPriceResult) ────────────

const SampleSchema = z.object({
	// A API passou a devolver `idCompra` como inteiro; searchMaterialPricesFn já
	// normaliza para string (ver parseComprasJson), mas aceitamos number para não
	// derrubar a gravação de auditoria caso um payload cru chegue aqui.
	idCompra: z.union([z.string(), z.number()]).transform(String),
	idItemCompra: z.number(),
	descricaoItem: z.string().nullable().optional(),
	precoUnitario: z.number().nullable().optional(),
	capacidadeUnidadeFornecimento: z.number().nullable().optional(),
	siglaUnidadeFornecimento: z.string().nullable().optional(),
	siglaUnidadeMedida: z.string().nullable().optional(),
	quantidade: z.number().nullable().optional(),
	codigoUasg: z.string().nullable().optional(),
	nomeUasg: z.string().nullable().optional(),
	municipio: z.string().nullable().optional(),
	estado: z.string().nullable().optional(),
	marca: z.string().nullable().optional(),
	dataCompra: z.string().nullable().optional(),
	dataResultado: z.string().nullable().optional(),
})

// ─── Salvar memória de cálculo para auditoria (Lei 14.133/2021) ───────────────

export const savePrecoAuditFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			catmatCodigo: z.number().int().positive(),
			catmatDescricao: z.string().nullable().optional(),
			method: z.enum(["mean", "median"]),
			referencePrice: z.number(),
			stats: z.object({
				mean: z.number(),
				median: z.number(),
				stdDev: z.number(),
				cv: z.number(),
				min: z.number(),
				max: z.number(),
				uniqueSources: z.number().int(),
			}),
			rawCount: z.number().int(),
			// Amostras restantes após a janela de recência (Art. 5º da IN SEGES 65/2021).
			// Ausente ⇒ nenhuma janela aplicada, o funil registra o bruto.
			dateFilteredCount: z.number().int().optional(),
			/** Janela de recência em meses; null/ausente quando a pesquisa considerou todo o histórico. */
			periodMonths: z.number().int().min(1).nullable().optional(),
			validCount: z.number().int(),
			outlierCount: z.number().int(),
			validSamples: z.array(SampleSchema),
			outlierSamples: z.array(SampleSchema),
			// Se fornecidos, linka imediatamente (caso ATA já existente)
			ataId: z.uuid().optional(),
			ataItemId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ researchId: string; researchItemId: string }> => {
		// WRITE numa trilha de auditoria de preço (Lei 14.133/2021). Sessão sozinha deixava
		// qualquer autenticado forjar memória de cálculo. Postura: membro do módulo `unit` (L1)
		// para pesquisa avulsa; quando o registro é ligado a ataId/ataItemId, a operação de
		// domínio escala para `unit` L2 na unidade DONA da ATA — alvo resolvido no banco, nunca
		// confiado do payload (ver price-research.authz.test.ts).
		const ctx = await requireAuthWithPermission("unit", 1)
		return savePriceResearchAudit(getDb(), ctx, data).catch(handleDomainError)
	})
