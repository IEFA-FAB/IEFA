/**
 * @module uasg-lookup.fn
 * UASG (Unidade Administrativa de Serviços Gerais) lookup from Compras.gov.br. Read-only, no local persistence.
 * CLIENT: external fetch only — no Supabase. External: dadosabertos.compras.gov.br (10 s timeout, no retry).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// ─── Types ────────────────────────────────────────────────────────────────────

export type UasgInfo = {
	codigoUasg: string
	nomeUasg: string
	usoSisg: boolean
	adesaoSiasg: boolean
	siglaUf: string
	codigoMunicipio: number
	codigoMunicipioIbge: number
	nomeMunicipioIbge: string
	codigoUnidadePolo: number
	nomeUnidadePolo: string
	codigoUnidadeEspelho: number
	nomeUnidadeEspelho: string
	uasgCadastradora: boolean
	cnpjCpfUasg: string
	codigoOrgao: number
	cnpjCpfOrgao: string
	cnpjCpfOrgaoVinculado: string
	cnpjCpfOrgaoSuperior: string
	codigoSiorg: string
	statusUasg: boolean
	dataImplantacaoSidec: string
	dataHoraMovimento: string
}

type ComprasApiResponse = {
	resultado: UasgInfo[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
}

// ─── Server Function ──────────────────────────────────────────────────────────

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"

/**
 * Queries Compras.gov.br for UASG metadata by exact 6-digit code. Returns null if no result found.
 *
 * @throws {Error} "Compras.gov.br retornou {status}" on non-2xx response or AbortSignal timeout (10 s).
 */
export const fetchUasgInfoFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ codigoUasg: z.string().length(6) }))
	.handler(async ({ data }) => {
		const url = new URL(`${COMPRAS_BASE}/modulo-uasg/1_consultarUasg`)
		url.searchParams.set("pagina", "1")
		url.searchParams.set("codigoUasg", data.codigoUasg)
		url.searchParams.set("statusUasg", "true")

		const res = await fetch(url.toString(), {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(10_000),
		})

		if (!res.ok) throw new Error(`Compras.gov.br retornou ${res.status}`)

		const json = (await res.json()) as ComprasApiResponse

		return json.resultado?.[0] ?? null
	})
