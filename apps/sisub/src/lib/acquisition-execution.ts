/**
 * @module acquisition-execution
 * Leitura da execução da unidade que a tela de contratações e o somatório da dispensa precisam:
 * contratações do EXERCÍCIO, NEs do exercício (e as ligadas a essas contratações, mesmo com data em
 * outro ano), valor vigente, itens e ARPs.
 *
 * Tudo paginado (`readAllPages`): o PostgREST corta em mil linhas sem avisar, e o somatório da
 * dispensa lido de uma lista cortada fica abaixo do real — é exatamente o valor que decide se a
 * dispensa passou do limite (Lei 14.133/2021, art. 75, § 1º).
 *
 * Recebe os clientes por parâmetro para ser testável sem o servidor.
 */

import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"

// Frouxo de propósito: é a costura de teste (o teste passa um cliente falso) e a consulta de
// contratações tem as colunas por parâmetro, que o parser de tipos do PostgREST não resolve.
// biome-ignore lint/suspicious/noExplicitAny: costura de teste; ver acima
export type ExecutionClient = { from: (table: string) => any }

export interface ExecutionAcquisitionRow {
	id: string
	fiscal_year: number
	[column: string]: unknown
}

export interface ExecutionEmpenhoRow {
	id: string
	numero_empenho: string
	data_empenho: string
	status: string
	acquisition_id: string | null
	favorecido_nome: string | null
	origem: string
}

export interface ExecutionArpRow {
	id: string
	numero_ata: string
	uasg_gerenciadora: string
	nome_uasg_gerenciadora: string | null
	source: "compras_gov" | "manual"
	last_synced_at: string | null
	procurement_list_id: string | null
	acquisition_id: string | null
	data_vigencia_fim: string | null
}

export interface UnitExecution<A extends ExecutionAcquisitionRow> {
	acquisitions: A[]
	empenhos: ExecutionEmpenhoRow[]
	vigenteById: Map<string, number>
	arpItemIdsByEmpenho: Map<string, Array<string | null>>
	arps: ExecutionArpRow[]
	itemCountByArp: Map<string, number>
}

const EMPENHO_COLUMNS = "id, numero_empenho, data_empenho, status, acquisition_id, favorecido_nome, origem"

export async function loadUnitExecution<A extends ExecutionAcquisitionRow>(
	clients: { procurement: ExecutionClient; finance: ExecutionClient },
	input: { unitId: number; fiscalYear: number; acquisitionColumns: string }
): Promise<UnitExecution<A>> {
	const { procurement, finance } = clients
	const { unitId, fiscalYear } = input

	const [acquisitions, empenhosInYear, arps] = await Promise.all([
		readAllPages<A>("contratações", (from, to) =>
			procurement
				.from("acquisition")
				.select(input.acquisitionColumns)
				.eq("unit_id", unitId)
				.eq("fiscal_year", fiscalYear)
				.is("deleted_at", null)
				.order("created_at", { ascending: false })
				.order("id")
				.range(from, to)
		),
		readAllPages<ExecutionEmpenhoRow>("empenhos", (from, to) =>
			finance
				.from("empenho")
				.select(EMPENHO_COLUMNS)
				.eq("unit_id", unitId)
				.gte("data_empenho", `${fiscalYear}-01-01`)
				.lte("data_empenho", `${fiscalYear}-12-31`)
				.order("data_empenho", { ascending: false })
				.order("id")
				.range(from, to)
		),
		readAllPages<ExecutionArpRow>("ARPs", (from, to) =>
			procurement
				.from("procurement_arp")
				.select("id, numero_ata, uasg_gerenciadora, nome_uasg_gerenciadora, source, last_synced_at, procurement_list_id, acquisition_id, data_vigencia_fim")
				.eq("unit_id", unitId)
				.order("created_at", { ascending: false })
				.order("id")
				.range(from, to)
		),
	])

	// NE de uma contratação do exercício com data em outro ano (a de dezembro emitida em janeiro)
	// ainda conta no empenhado dela.
	const seen = new Set(empenhosInYear.map((e) => e.id))
	const linkedOutside = (
		await readAllPagesIn<ExecutionEmpenhoRow>(
			"empenhos das contratações",
			acquisitions.map((a) => a.id),
			(chunk, from, to) => finance.from("empenho").select(EMPENHO_COLUMNS).eq("unit_id", unitId).in("acquisition_id", chunk).order("id").range(from, to)
		)
	).filter((e) => !seen.has(e.id))
	const empenhos = [...empenhosInYear, ...linkedOutside]
	const empenhoIds = empenhos.map((e) => e.id)

	const [vigentes, items, arpItems] = await Promise.all([
		readAllPagesIn<{ empenho_id: string; valor_vigente: number | string | null }>("valor vigente dos empenhos", empenhoIds, (chunk, from, to) =>
			finance.from("v_empenho_vigente").select("empenho_id, valor_vigente").in("empenho_id", chunk).order("empenho_id").range(from, to)
		),
		readAllPagesIn<{ empenho_id: string; arp_item_id: string | null }>("itens dos empenhos", empenhoIds, (chunk, from, to) =>
			finance.from("empenho_item").select("id, empenho_id, arp_item_id").in("empenho_id", chunk).order("id").range(from, to)
		),
		readAllPagesIn<{ arp_id: string }>(
			"itens das ARPs",
			arps.map((a) => a.id),
			(chunk, from, to) => procurement.from("procurement_arp_item").select("id, arp_id").in("arp_id", chunk).order("id").range(from, to)
		),
	])

	const vigenteById = new Map(vigentes.map((row) => [row.empenho_id, Number(row.valor_vigente ?? 0)]))
	const arpItemIdsByEmpenho = new Map<string, Array<string | null>>()
	for (const row of items) arpItemIdsByEmpenho.set(row.empenho_id, [...(arpItemIdsByEmpenho.get(row.empenho_id) ?? []), row.arp_item_id])
	const itemCountByArp = new Map<string, number>()
	for (const item of arpItems) itemCountByArp.set(item.arp_id, (itemCountByArp.get(item.arp_id) ?? 0) + 1)

	return { acquisitions, empenhos, vigenteById, arpItemIdsByEmpenho, arps, itemCountByArp }
}
