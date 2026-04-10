// ─── Tipos de domínio — ARP + Empenho (Fase 1) ───────────────────────────────
//
// Os tipos base são derivados do @iefa/database/sisub (generated.ts).
// Tipos de DTO da API Compras.gov.br e composições permanecem aqui.

export type {
	Empenho,
	EmpenhoInsert,
	EmpenhoUpdate,
	ProcurementArp,
	ProcurementArpInsert,
	ProcurementArpItem,
	ProcurementArpItemInsert,
	ProcurementArpUpdate,
} from "@iefa/database/sisub"

import type { Empenho, ProcurementArp, ProcurementArpItem } from "@iefa/database/sisub"

// ─── Composições ─────────────────────────────────────────────────────────────

export interface ArpWithItems extends ProcurementArp {
	items: ProcurementArpItem[]
}

export interface ArpItemWithEmpenhos extends ProcurementArpItem {
	empenhos: Empenho[]
}

// ─── DTOs da API Compras.gov.br ───────────────────────────────────────────────

/** Resultado de `modulo-arp/1_consultarARP` */
export interface ComprasArpResult {
	numeroAta: string
	anoAta: string
	uasgGerenciadora: string
	nomeUasgGerenciadora: string
	objeto: string | null
	dataAssinatura: string | null
	dataVigenciaIni: string | null
	dataVigenciaFim: string | null
	statusAta: string | null
	valorGlobal: number | null
}

export interface ComprasArpPage {
	resultado: ComprasArpResult[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
}

/** Resultado de `modulo-arp/2_consultarARPItem` */
export interface ComprasArpItemResult {
	numeroItem: number
	codigoMaterial: number | null
	descricaoMaterial: string | null
	niiFornecedor: string | null
	nomeFornecedor: string | null
	valorUnitario: number | null
	qtdeRegistrada: number | null
	unidadeFornecimento: string | null
	qtdeEmpenhada: number | null
	saldoEmpenho: number | null
}

export interface ComprasArpItemPage {
	resultado: ComprasArpItemResult[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
}

// ─── Payload de criação de empenho ───────────────────────────────────────────

export interface CreateEmpenhoPayload {
	unitId: number
	arpItemId: string
	numeroEmpenho: string
	dataEmpenho: string
	quantidadeEmpenhada: number
	valorUnitario: number
	notaLancamento?: string
}
