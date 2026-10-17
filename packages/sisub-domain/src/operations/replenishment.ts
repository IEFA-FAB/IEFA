/**
 * MRP + roteamento de canal de compra (Fase 7 do estoque).
 *
 * Necessidade líquida = demanda bruta (cardápios) × FC ÷ IR
 *                       − estoque disponível (excluindo lotes que vencem no horizonte)
 *                       − em trânsito (OFs enviadas, não recebidas)
 *
 * FC (correction_factor = bruto/líquido) multiplica: compra-se peso BRUTO.
 * IR (rehydration_index) divide quando aplicável: necessidade hidratada → seco.
 * As fórmulas do anexo quantitativo (`calculateQuantityEstimateNeeds`) NÃO mudam — divergência intencional
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

export type LeadTimeSource = "observed" | "arp_default" | "kitchen_default"

/**
 * Prazo de entrega estimado. `days: null` é pendência, não zero: nem histórico, nem prazo da ARP,
 * nem prazo padrão configurado pela cozinha. Quem consome não presume valor.
 */
export type LeadTimeEstimate = { days: number; source: LeadTimeSource } | { days: null; source: "not_configured" }

/**
 * Prazo de entrega com fallback em cascata: mediana do observado (mínimo 2 amostras) → prazo
 * contratual da ARP → prazo padrão da cozinha (`kitchen_stock_settings.default_lead_time_days`).
 * Sem nenhum dos três, `not_configured`: o 7 fixo de antes não tinha origem.
 */
export function estimateLeadTime(observedDays: readonly number[], arpDefaultDays: number | null, kitchenDefaultDays: number | null): LeadTimeEstimate {
	const valid = observedDays.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b)
	if (valid.length >= 2) {
		const mid = Math.floor(valid.length / 2)
		const median = valid.length % 2 === 1 ? valid[mid] : ((valid[mid - 1] ?? 0) + (valid[mid] ?? 0)) / 2
		return { days: Math.ceil(median ?? 0), source: "observed" }
	}
	if (arpDefaultDays != null && arpDefaultDays > 0) return { days: arpDefaultDays, source: "arp_default" }
	if (kitchenDefaultDays != null && Number.isFinite(kitchenDefaultDays) && kitchenDefaultDays > 0) {
		return { days: Math.ceil(kitchenDefaultDays), source: "kitchen_default" }
	}
	return { days: null, source: "not_configured" }
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
	/**
	 * Limiar de urgência (default: prazo de entrega estimado; configurável na política do item).
	 * `null` = indeterminado: sem limiar do item e sem prazo de entrega conhecido.
	 */
	urgencyThresholdDays: number | null
	/**
	 * O valor estimado CABE no que resta do limite da dispensa por valor no exercício (art. 75, II,
	 * e § 1º: somatório da unidade gestora no ramo de atividade). Não é o valor do item sozinho.
	 */
	smallValue: boolean
	/** Quanto resta do limite do inciso II no ramo, para a memória de cálculo (null = desconhecido). */
	dispensaRemaining?: number | null
}

export type ReplenishmentUrgency = "urgent" | "not_urgent" | "undetermined"

export interface ChannelDecision {
	/** `null` quando o canal depende da urgência e ela é indeterminada. */
	channel: PurchaseChannel | null
	urgency: ReplenishmentUrgency
	reason: string
}

const UNDETERMINED_URGENCY = "urgência indeterminada: prazo de entrega não configurado"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Ordem determinística do spec: ARP própria → carona → Supermercado Virtual → Contrata+ → licitação.
 *
 * Supermercado Virtual e Contrata+Brasil são dispensa por valor: os dois só entram quando o valor
 * cabe no somatório do exercício. Urgência operacional sozinha não autoriza dispensa — a de
 * emergência (art. 75, VIII) tem requisitos próprios e é decisão documentada, não sugestão.
 */
export function decideChannel(input: ChannelDecisionInput): ChannelDecision {
	const urgency: ReplenishmentUrgency =
		input.urgencyThresholdDays == null ? "undetermined" : input.coverageDays < input.urgencyThresholdDays ? "urgent" : "not_urgent"
	if (input.ownArpBalance >= input.netNeed && input.netNeed > 0) {
		return {
			channel: "own_arp",
			urgency,
			reason: `ARP própria vigente com saldo (${input.ownArpBalance}) cobre a necessidade (${input.netNeed}) — emitir empenho/OF`,
		}
	}
	if (input.caronaAvailable === true) {
		return { channel: "carona", urgency, reason: "Sem saldo em ARP própria; há ARP de outra UASG localizável — solicitar adesão (carona)" }
	}
	const room = input.dispensaRemaining != null ? ` (resta ${BRL.format(Math.max(0, input.dispensaRemaining))} do limite no ramo)` : ""
	if (input.smallValue && input.hasCatmat && urgency === "undetermined") {
		// O Supermercado Virtual depende da urgência; o Contrata+Brasil não. Sem o prazo, não se escolhe.
		return {
			channel: null,
			urgency,
			reason: `Valor dentro do somatório da dispensa${room} e item com CATMAT, mas ${UNDETERMINED_URGENCY} — Supermercado Virtual se a cobertura (${input.coverageDays}d) estiver abaixo do prazo, Contrata+Brasil se não. Configure o prazo de entrega padrão da cozinha`,
		}
	}
	if (input.smallValue && input.hasCatmat && urgency === "urgent") {
		return {
			channel: "supermercado_virtual",
			urgency,
			reason: `Cobertura (${input.coverageDays}d) abaixo do limiar de urgência (${input.urgencyThresholdDays}d), item com CATMAT e valor dentro do somatório da dispensa${room} — dispensa eletrônica via Supermercado Virtual`,
		}
	}
	if (input.smallValue) {
		return { channel: "contrata_mais", urgency, reason: `Valor dentro do somatório da dispensa (art. 75, II e § 1º, da Lei 14.133)${room} — Contrata+Brasil` }
	}
	if (urgency === "urgent") {
		return {
			channel: "licitacao",
			urgency,
			reason: `Cobertura (${input.coverageDays}d) abaixo do limiar, mas o valor não cabe no somatório da dispensa${room} — urgência sozinha não autoriza dispensa (a de emergência, art. 75, VIII, exige processo próprio); abrir planejamento de licitação`,
		}
	}
	const suffix = urgency === "undetermined" ? ` (${UNDETERMINED_URGENCY})` : ""
	return { channel: "licitacao", urgency, reason: `Nenhum canal direto se aplica — abrir novo planejamento de licitação (quantity_estimate)${suffix}` }
}

/** O valor estimado cabe no que resta do limite? Sem limite conhecido, não cabe (não se presume). */
export function fitsDispensaRoom(estimatedValue: number | null, remaining: number | null): boolean {
	return estimatedValue != null && estimatedValue > 0 && remaining != null && estimatedValue <= remaining + 0.005
}
