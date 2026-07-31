/**
 * MRP + roteamento de canal de compra (Fase 7 do estoque).
 *
 * Necessidade líquida = demanda bruta (cardápios) × FC ÷ IR
 *                       − estoque disponível (excluindo lotes que vencem no horizonte)
 *                       − em trânsito (OFs enviadas, não recebidas)
 *
 * FC (correction_factor = bruto/líquido) multiplica: compra-se peso BRUTO.
 * IR (rehydration_index) divide quando aplicável: necessidade hidratada → seco.
 * As fórmulas de ATA (`calculateAtaNeeds`) NÃO mudam — divergência intencional
 * documentada em design.md (ATAs publicadas ficam congeladas).
 *
 * Canal: tabela de decisão determinística e auditável — o sistema RECOMENDA,
 * a emissão é humana.
 */

export interface CorrectionInput {
	/** Fator de correção (peso bruto / líquido). null/<=0 → 1. */
	correctionFactor: number | null | undefined
	/** Índice de reidratação. null/<=0 → 1 (não aplica). */
	rehydrationIndex: number | null | undefined
}

/** Demanda líquida de receita → quantidade de COMPRA (bruta/seca). */
export function applyCorrectionFactors(netQuantity: number, factors: CorrectionInput): number {
	const fc = factors.correctionFactor != null && factors.correctionFactor > 0 ? factors.correctionFactor : 1
	const ir = factors.rehydrationIndex != null && factors.rehydrationIndex > 0 ? factors.rehydrationIndex : 1
	return Number(((netQuantity * fc) / ir).toFixed(4))
}

export interface NetNeedInput {
	grossDemand: number
	/** Saldo disponível já EXCLUINDO lotes que vencem dentro do horizonte. */
	availableStock: number
	/** Quantidade em OFs enviadas e ainda não recebidas (na unidade base). */
	inTransit: number
}

export function calculateNetNeed(input: NetNeedInput): number {
	return Number(Math.max(0, input.grossDemand - input.availableStock - input.inTransit).toFixed(4))
}

export type LeadTimeSource = "observed" | "arp_default" | "policy_default"

/**
 * Lead time estimado com fallback em cascata: mediana do observado (mínimo 2
 * amostras) → prazo contratual da ARP → cobertura default da política.
 */
export function estimateLeadTime(
	observedDays: readonly number[],
	arpDefaultDays: number | null,
	policyDefaultDays: number
): { days: number; source: LeadTimeSource } {
	const valid = observedDays.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b)
	if (valid.length >= 2) {
		const mid = Math.floor(valid.length / 2)
		const median = valid.length % 2 === 1 ? valid[mid] : ((valid[mid - 1] ?? 0) + (valid[mid] ?? 0)) / 2
		return { days: Math.ceil(median ?? 0), source: "observed" }
	}
	if (arpDefaultDays != null && arpDefaultDays > 0) return { days: arpDefaultDays, source: "arp_default" }
	return { days: Math.max(policyDefaultDays, 1), source: "policy_default" }
}

export type PurchaseChannel = "own_arp" | "carona" | "supermercado_virtual" | "contrata_mais" | "licitacao"

export interface ChannelDecisionInput {
	netNeed: number
	/** Saldo oficial disponível em ARP própria vigente. */
	ownArpBalance: number
	/** Há ARP de outra UASG localizável para carona? (null = não pesquisado) */
	caronaAvailable: boolean | null
	/** Item tem CATMAT (pré-requisito de Supermercado Virtual / Contrata+). */
	hasCatmat: boolean
	/** Cobertura atual em dias (estoque ÷ consumo diário). */
	coverageDays: number
	/** Limiar de urgência (default: lead time estimado; configurável na política). */
	urgencyThresholdDays: number
	/** Valor estimado dentro dos limites de dispensa do art. 75 da Lei 14.133. */
	smallValue: boolean
}

export interface ChannelDecision {
	channel: PurchaseChannel
	reason: string
}

/** Ordem determinística do spec: ARP própria → carona → Supermercado Virtual → Contrata+ → licitação. */
export function decideChannel(input: ChannelDecisionInput): ChannelDecision {
	if (input.ownArpBalance >= input.netNeed && input.netNeed > 0) {
		return { channel: "own_arp", reason: `ARP própria vigente com saldo (${input.ownArpBalance}) cobre a necessidade (${input.netNeed}) — emitir empenho/OF` }
	}
	if (input.caronaAvailable === true) {
		return { channel: "carona", reason: "Sem saldo em ARP própria; há ARP de outra UASG localizável — solicitar adesão (carona)" }
	}
	const urgent = input.coverageDays < input.urgencyThresholdDays
	if (input.hasCatmat && urgent) {
		return {
			channel: "supermercado_virtual",
			reason: `Cobertura (${input.coverageDays}d) abaixo do limiar de urgência (${input.urgencyThresholdDays}d) e item tem CATMAT — dispensa eletrônica via Supermercado Virtual`,
		}
	}
	if (input.smallValue) {
		return { channel: "contrata_mais", reason: "Pequeno valor (art. 75 da Lei 14.133) fora de ata — Contrata+Brasil" }
	}
	return { channel: "licitacao", reason: "Nenhum canal direto se aplica — abrir novo planejamento de licitação (procurement_list)" }
}
