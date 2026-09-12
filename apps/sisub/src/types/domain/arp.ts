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

import type { components } from "@iefa/compras-api"
import type { Empenho, ProcurementArp, ProcurementArpItem } from "@iefa/database/sisub"

type ComprasSchemas = components["schemas"]

// ─── Composições ─────────────────────────────────────────────────────────────

export interface ArpWithItems extends ProcurementArp {
	items: ProcurementArpItem[]
}

export interface ArpItemWithEmpenhos extends ProcurementArpItem {
	empenhos: Empenho[]
}

// ─── DTOs da API Compras.gov.br ───────────────────────────────────────────────
//
// Derivados do swagger oficial (`/v3/api-docs`, espelhado em
// `packages/compras-api/openapi.json`) em vez de reescritos à mão. Os nomes
// escritos à mão aqui tinham derivado inteiros do contrato real — `numeroAta`
// por `numeroAtaRegistroPreco`, `codigoMaterial` por `codigoItem`,
// `niiFornecedor` (com dois "i") por `niFornecedor` — e nada disso aparecia em
// typecheck porque a resposta era um `as` sobre `unknown`.

/** Resultado de `modulo-arp/1_consultarARP` */
export type ComprasArpResult = ComprasSchemas["VwFtArpDTO"]
export type ComprasArpPage = ComprasSchemas["GenericAPIResponseDTOVwFtArpDTO"]

/** Resultado de `modulo-arp/2_consultarARPItem` */
export type ComprasArpItemResult = ComprasSchemas["VwFtArpItemDTO"]
export type ComprasArpItemPage = ComprasSchemas["GenericAPIResponseDTOVwFtArpItemDTO"]

/**
 * Resultado de `modulo-arp/4_consultarEmpenhosSaldoItem`.
 *
 * `saldoEmpenho` NÃO existe em `2_consultarARPItem` — o item da ata traz
 * `quantidadeEmpenhada`, mas o saldo só sai deste endpoint. É por isso que
 * importar/sincronizar uma ARP custa duas chamadas.
 */
export type ComprasArpSaldoResult = ComprasSchemas["VwArpEmpenhosItemDTO"]
export type ComprasArpSaldoPage = ComprasSchemas["VwArpEmpenhosItemAPI"]

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
