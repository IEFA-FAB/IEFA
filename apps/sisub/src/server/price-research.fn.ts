/**
 * @module price-research.fn
 * Price research against Compras.gov.br material price data with retry/backoff fetch.
 * A consulta externa fica aqui (é HTTP, não banco); a persistência da memória de cálculo
 * delega a `savePriceResearchAudit` de @iefa/sisub-domain (Drizzle).
 * @domain external
 * @migration done
 */

import { savePriceResearchAudit } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission, requireUserId } from "@/lib/auth.server"
import { parseComprasJson } from "@/lib/compras-json"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { ComprasMaterialPricePage } from "@/types/domain/price-research"

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
/** A API responde 400 ("Informe um número de paginação no intervalo de 10 a 500") fora desta faixa. */
const MIN_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 500

async function fetchCompras(url: string): Promise<Response> {
	let lastErr: unknown
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
			}
			const res = await fetch(url, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: "application/json" },
			})
			if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar Compras.gov.br`)
			return res
		} catch (err) {
			lastErr = err
		}
	}
	throw lastErr
}

export const searchMaterialPricesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			codigoItemCatalogo: z.number().int().positive(),
			pagina: z.number().int().min(1).default(1),
			tamanhoPagina: z.number().int().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
			estado: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ComprasMaterialPricePage> => {
		await requireUserId()
		// Contrato atual da API: o item consultado vai no par `tipo`/`codigo`.
		// O antigo `codigoItemCatalogo=<n>` responde 404 (Resource not found).
		const params = new URLSearchParams({
			tipo: "codigoItemCatalogo",
			codigo: String(data.codigoItemCatalogo),
			pagina: String(data.pagina),
			tamanhoPagina: String(data.tamanhoPagina),
		})
		if (data.estado) params.set("estado", data.estado)

		const url = `${COMPRAS_BASE}/modulo-pesquisa-preco/1_consultarMaterial?${params}`
		const res = await fetchCompras(url)
		return parseComprasJson<ComprasMaterialPricePage>(await res.text())
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
