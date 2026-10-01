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

/** Prefixo da recusa por conflito: a tela reconhece e recarrega a conciliação. */
export const RECONCILIATION_CONFLICT_PREFIX = "A conciliação mudou"

export type ReconciliationDecision = "adotado_siafi" | "mantido_local"
export type ReconciliationDocumentType = "ne" | "ns" | "ob"

/** A linha da conciliação, como a view a entrega. */
export interface ReconciliationSnapshot {
	situacao: string
	valorSisub: number | null
	valorSiafi: number | null
	decisaoVigente: boolean
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

/** Local, e não o de `@iefa/sisub-domain/operations`: este módulo também vai para o navegador. */
function roundToCents(value: number): number {
	return Math.round(value * 100) / 100
}

function sameValue(a: number | null, b: number | null): boolean {
	if (a == null || b == null) return a == null && b == null
	return Math.abs(a - b) <= CENT
}

/**
 * O que a decisão grava, ou por que não pode ser tomada.
 *
 * - documento fora da conciliação, já conciliado ou sem divergência de valor: nada a decidir;
 * - decisão vigente (para estes mesmos valores): a divergência já foi resolvida — é o que torna
 *   o segundo clique (ou o reenvio depois de um 502) inofensivo, em vez de um segundo reforço;
 * - valores diferentes dos que a tela viu: conflito, a tela recarrega.
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
	if (snapshot.decisaoVigente) {
		return { ok: false, message: "Esta divergência já tem decisão registrada para estes valores — recarregue a conciliação" }
	}
	if (snapshot.situacao !== "divergente") {
		return {
			ok: false,
			message: `${RECONCILIATION_CONFLICT_PREFIX}: o documento não está mais divergente (${snapshot.situacao.replaceAll("_", " ")}) — recarregue e confira`,
		}
	}
	if (!sameValue(snapshot.valorSisub, input.seen.valorSisub) || !sameValue(snapshot.valorSiafi, input.seen.valorSiafi)) {
		return { ok: false, message: `${RECONCILIATION_CONFLICT_PREFIX} desde que a tela foi aberta (valores diferentes) — recarregue e decida de novo` }
	}

	let empenhoEvent: Extract<DivergencePlan, { ok: true }>["empenhoEvent"] = null
	if (input.decisao === "adotado_siafi" && input.documentoTipo === "ne" && snapshot.valorSisub != null && snapshot.valorSiafi != null) {
		if (!input.hasEmpenho) return { ok: false, message: "Empenho não encontrado nesta unidade — recarregue a conciliação" }
		const delta = roundToCents(snapshot.valorSiafi - snapshot.valorSisub)
		if (Math.abs(delta) > CENT) {
			empenhoEvent = {
				tipo: delta > 0 ? "reforco" : "anulacao",
				valor: Math.abs(delta),
				justificativa: `Conciliação SIAFI: valor ajustado de ${snapshot.valorSisub.toFixed(2)} para ${snapshot.valorSiafi.toFixed(2)}`,
			}
		}
	}
	return { ok: true, valorSisub: snapshot.valorSisub, valorSiafi: snapshot.valorSiafi, empenhoEvent }
}
