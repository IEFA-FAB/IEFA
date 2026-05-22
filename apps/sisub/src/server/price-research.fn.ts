import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import type { ComprasMaterialPricePage } from "@/types/domain/price-research"

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

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
	.inputValidator(
		z.object({
			codigoItemCatalogo: z.number().int().positive(),
			pagina: z.number().int().min(1).default(1),
			tamanhoPagina: z.number().int().min(1).max(500).default(20),
			estado: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ComprasMaterialPricePage> => {
		const params = new URLSearchParams({
			pagina: String(data.pagina),
			tamanhoPagina: String(data.tamanhoPagina),
			codigoItemCatalogo: String(data.codigoItemCatalogo),
		})
		if (data.estado) params.set("estado", data.estado)

		const url = `${COMPRAS_BASE}/modulo-pesquisa-preco/1_consultarMaterial?${params}`
		const res = await fetchCompras(url)
		return (await res.json()) as ComprasMaterialPricePage
	})
