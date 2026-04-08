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
