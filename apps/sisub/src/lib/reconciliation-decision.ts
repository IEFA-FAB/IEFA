/**
 * Decisão sobre uma divergência da conciliação SIAFI × sisub: o que pode ser decidido e o que a
 * decisão grava.
 *
 * Os valores confrontados são os da conciliação LIDA NO SERVIDOR (`finance.v_siafi_reconciliation`),
 * na mesma transação da escrita. Os que a tela manda são só a versão que ela viu: divergiram, a
 * decisão é recusada com conflito, e a tela recarrega. Antes, os dois valores vinham do payload
 * e viravam evento de reforço/anulação no empenho — qualquer número que o cliente mandasse.
 *
 * Fica fora de `@/server/*` porque teste unitário não importa servidor.
 */

import { roundToCents } from "@iefa/sisub-domain"

/** Prefixo da recusa por conflito: a tela reconhece e recarrega a conciliação. */
export const RECONCILIATION_CONFLICT_PREFIX = "A conciliação mudou"

export type ReconciliationDecision = "adotado_siafi" | "mantido_local"
export type ReconciliationDocumentType = "ne" | "ns" | "ob"

/** A linha da conciliação, como a view a entrega. */
export interface ReconciliationSnapshot {
	situacao: string
	valorSisub: number | null
	valorSiafi: number | null
	/** Já há decisão registrada para estes mesmos valores (`decisao_vigente` da view). */
	hasCurrentDecision: boolean
}

export type DivergencePlan =
	| {
			ok: true
			valorSisub: number | null
			valorSiafi: number | null
			/** Evento no empenho (só ao adotar o SIAFI numa NE com diferença); `null` quando nada muda no valor. */
			empenhoEvent: { tipo: "reforco" | "anulacao"; valor: number; justificativa: string } | null
	  }
	| { ok: false; message: string }

const CENT = 0.009

function isSameAmount(a: number | null, b: number | null): boolean {
	if (a == null || b == null) return a == null && b == null
	return Math.abs(a - b) <= CENT
}

/**
 * O que a decisão grava, ou por que não pode ser tomada.
 *
 * - documento fora da conciliação ou já conciliado: nada a decidir;
 * - decisão vigente (para estes mesmos valores): já resolvido. É o que torna o segundo clique (ou
 *   o reenvio depois de um 502) inofensivo, em vez de um segundo reforço;
 * - valores diferentes dos que a tela viu: conflito, a tela recarrega.
 *
 * Só o documento `divergente` mexe no empenho (adotar o SIAFI numa NE com diferença de valor). As
 * outras situações da lista (`apenas_siafi`, `apenas_sisub`, `aguardando_documento_pai`) continuam
 * podendo ser dispensadas com a decisão registrada, sem efeito no valor — como antes.
 */
export function planDivergenceResolution(input: {
	snapshot: ReconciliationSnapshot | null
	documentoTipo: ReconciliationDocumentType
	decisao: ReconciliationDecision
	seen: { valorSisub: number | null; valorSiafi: number | null }
	/** Há empenho local com este número (só importa para NE). */
	hasEmpenho: boolean
}): DivergencePlan {
	const { snapshot } = input
	if (!snapshot) return { ok: false, message: "Documento não encontrado na conciliação desta unidade — recarregue a tela" }
	if (snapshot.hasCurrentDecision) {
		return { ok: false, message: "Este documento já tem decisão registrada para estes valores — recarregue a conciliação" }
	}
	if (snapshot.situacao === "conciliado") {
		return { ok: false, message: `${RECONCILIATION_CONFLICT_PREFIX}: o documento já está conciliado — recarregue e confira` }
	}
	if (!isSameAmount(snapshot.valorSisub, input.seen.valorSisub) || !isSameAmount(snapshot.valorSiafi, input.seen.valorSiafi)) {
		return { ok: false, message: `${RECONCILIATION_CONFLICT_PREFIX} desde que a tela foi aberta (valores diferentes) — recarregue e decida de novo` }
	}

	let empenhoEvent: Extract<DivergencePlan, { ok: true }>["empenhoEvent"] = null
	const { valorSisub, valorSiafi } = snapshot
	if (input.decisao === "adotado_siafi" && input.documentoTipo === "ne" && snapshot.situacao === "divergente" && valorSisub != null && valorSiafi != null) {
		if (!input.hasEmpenho) return { ok: false, message: "Empenho não encontrado nesta unidade — recarregue a conciliação" }
		const delta = roundToCents(valorSiafi - valorSisub)
		if (Math.abs(delta) > CENT) {
			empenhoEvent = {
				tipo: delta > 0 ? "reforco" : "anulacao",
				valor: Math.abs(delta),
				justificativa: `Conciliação SIAFI: valor ajustado de ${valorSisub.toFixed(2)} para ${valorSiafi.toFixed(2)}`,
			}
		}
	}
	return { ok: true, valorSisub: snapshot.valorSisub, valorSiafi: snapshot.valorSiafi, empenhoEvent }
}
