/**
 * @module uasg-lookup.fn
 * UASG (Unidade Administrativa de Serviços Gerais) lookup from Compras.gov.br. Read-only, no local persistence.
 * CLIENT: external only — no Supabase. External: dadosabertos.compras.gov.br via `comprasApi`
 * (@/lib/compras.server — 30 s timeout, 3 tentativas).
 * AUTH: apenas autenticação (qualquer sessão válida). Sem guard isto é um proxy aberto
 * para a API do Compras.gov usando o IP do nosso servidor — anônimos podiam enumerar UASGs
 * e consumir o rate limit da origem em nome da aplicação.
 * @domain external
 * @migration n-a
 */

import type { components } from "@iefa/compras-api"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireUserId } from "@/lib/auth.server"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"

// ─── Types ────────────────────────────────────────────────────────────────────

export type UasgInfo = components["schemas"]["DmCorpUasgDTO"]

// ─── Server Function ──────────────────────────────────────────────────────────

/**
 * Queries Compras.gov.br for UASG metadata by exact 6-digit code. Returns null if no result found.
 *
 * `statusUasg` é obrigatório no swagger; fixado em `true` porque a consulta
 * existe para preencher cadastro — UASG desativada não deve ser oferecida.
 *
 * @throws {Error} "Compras.gov.br retornou {status}" em resposta não-2xx ou timeout (30 s).
 */
export const fetchUasgInfoFn = createServerFn({ method: "GET" })
	.validator(z.object({ codigoUasg: z.string().length(6) }))
	.handler(async ({ data }) => {
		await requireUserId()
		const page = unwrapCompras(
			await comprasApi.GET("/modulo-uasg/1_consultarUasg", {
				params: { query: { pagina: 1, codigoUasg: data.codigoUasg, statusUasg: true } },
			})
		)
		return page.resultado?.[0] ?? null
	})
