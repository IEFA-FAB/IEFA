/**
 * As duas portas até o pagamento — a efetivação do recebimento e o registro da
 * liquidação — aplicam UMA regra sobre a nota. Ela mora aqui, pura, porque
 * duas cópias da mesma regra divergem: foi o que aconteceu quando a liquidação
 * ganhou "a mesma regra da efetivação" sem o limite de idade da consulta.
 *
 * O parser de NF-e só confere a COERÊNCIA do arquivo; um `cStat` editado à mão
 * passa por ele. A autenticidade que a cadeia tem hoje é a consulta de situação
 * no portal da SEFAZ, registrada por uma pessoa. Por isso esta regra é estrita:
 * só AUTORIZADA, e consulta recente.
 */

/** Uma consulta vale 3 dias: nota cancelada depois dela não pode virar pagamento. */
export const SITUATION_MAX_AGE_DAYS = 3

export interface InvoiceSituation {
	status: string
	situationResult: string | null
	situationCheckedAt: string | null
}

/** O que impede a nota de sustentar efetivação ou pagamento — ou `null`. */
export function invoiceSituationProblem(invoice: InvoiceSituation, now: number = Date.now()): string | null {
	if (invoice.status === "cancelled" || invoice.situationResult === "cancelled") {
		return "NF-e cancelada pelo emitente — não sustenta efetivação nem pagamento"
	}
	const checkedAt = invoice.situationCheckedAt ? new Date(invoice.situationCheckedAt).getTime() : null
	if (checkedAt == null || Number.isNaN(checkedAt) || now - checkedAt > SITUATION_MAX_AGE_DAYS * 86_400_000) {
		return `Consulte a situação da NF-e na SEFAZ e registre o resultado (a consulta vale ${SITUATION_MAX_AGE_DAYS} dias) — nota cancelada depois da última consulta não pode virar pagamento`
	}
	if (invoice.situationResult !== "authorized") {
		return "Confirme na SEFAZ que a NF-e está AUTORIZADA e registre o resultado — situação desconhecida não libera"
	}
	return null
}

export interface ReceiptForLiquidation {
	/** Unidade COMPRADORA da cozinha do recebimento. */
	unitId: number | null
	/** Preenchido na efetivação — vale para `definitive` E para `divergent`. */
	definitiveAt: string | null
	nfeDocumentId: string | null
	empenhoId: string | null
	fiscalPending: boolean
}

export interface LiquidationLinkInput {
	unitId: number
	empenhoId: string
	receipt: ReceiptForLiquidation | null
	/** NF-e informada na requisição, além da do recebimento. */
	requestedNfeId: string | null
	invoice: (InvoiceSituation & { unitId: number | null }) | null
}

/**
 * Problemas do vínculo da liquidação. Lista vazia = pode liquidar.
 *
 * Cada regra aqui já custou um defeito concreto: recebimento de outra unidade
 * gravado sem conferência; recebimento DIVERGENTE recusado por ler o status em
 * vez do instante da efetivação; e a mesma entrega liquidada duas vezes por
 * empenhos diferentes.
 */
export function liquidationLinkProblems(input: LiquidationLinkInput, now: number = Date.now()): string[] {
	const problems: string[] = []
	const { receipt, invoice } = input

	if (receipt) {
		if (receipt.unitId !== input.unitId) problems.push("O recebimento não é desta unidade")
		// Lei 4.320, art. 63: a liquidação se apoia na ENTREGA atestada. O que diz
		// isso é o instante da efetivação — um recebimento efetivado com item
		// divergente fica em `divergent`, não em `definitive`, e continua sendo
		// entrega atestada.
		if (receipt.definitiveAt == null) problems.push("Só recebimento EFETIVADO sustenta liquidação")
		// A falta cobrada do fornecedor tem de ser resolvida antes: liquidar agora
		// pagaria pelo que não chegou.
		if (receipt.fiscalPending) problems.push("O recebimento tem pendência fiscal aberta (falta a cobrar) — resolva antes de liquidar")
		// A mesma entrega não pode sustentar NS de dois empenhos: seria pagá-la duas
		// vezes.
		if (receipt.empenhoId != null && receipt.empenhoId !== input.empenhoId) {
			problems.push("O recebimento foi entregue sob outro empenho — a liquidação tem de debitar o empenho da entrega")
		}
		if (input.requestedNfeId != null && receipt.nfeDocumentId != null && input.requestedNfeId !== receipt.nfeDocumentId) {
			problems.push("A NF-e informada não é a do recebimento")
		}
	}

	if (invoice) {
		if (invoice.unitId != null && invoice.unitId !== input.unitId) problems.push("A NF-e não é desta unidade")
		const situation = invoiceSituationProblem(invoice, now)
		if (situation) problems.push(situation)
	}

	return problems
}
