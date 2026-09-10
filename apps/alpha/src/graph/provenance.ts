/**
 * @module provenance
 * Procedência da resposta fora do RADA-e.
 *
 * O ChatRADA se apresenta como consulta ao RADA-e. Quando a pergunta não é respondida a
 * partir do corpus — saudação à parte, toda pergunta que o roteador manda para o chat
 * geral — a resposta NÃO pode soar como se viesse do regulamento. Duas formas são
 * admitidas, e só elas:
 *
 * 1. há fonte identificável → "não é proveniente do RADA-e, mas com base em X: Y"
 * 2. não há                 → "não existe no RADA-e e não tenho certeza sobre ela"
 *
 * A composição é feita AQUI, em código, e não pedida ao modelo no prompt: instrução de
 * prompt é sugestão, e a que mais se perde é justamente a ressalva — o modelo responde
 * bem, esquece o aviso, e o usuário atribui ao RADA-e uma afirmação que não está nele.
 */

/** O que o modelo declara sobre a própria resposta. */
export interface NonRadaAnswer {
	/** Tem resposta e sabe de onde ela vem. */
	hasAnswer: boolean
	/** Fonte identificável: norma, sistema, base de dados. Vazio quando não há. */
	source?: string | null
	/** A resposta em si. */
	answer?: string | null
}

/** Usada quando não há fonte, ou quando a declaração do modelo é incoerente. */
export const NO_BASIS_ANSWER = "Essa informação não existe no RADA-e e não tenho certeza sobre ela."

/**
 * Fonte que o modelo NÃO pode declarar aqui: o próprio corpus.
 *
 * Este caminho só existe quando a resposta não veio do RADA-e — ou porque ele não foi
 * consultado, ou porque a busca não trouxe nada. Aceitar `source: "RADA-e"` produziria a
 * frase mais enganosa possível: "não é proveniente do RADA-e, mas com base no RADA-e",
 * atribuindo ao regulamento uma afirmação que nenhum trecho recuperado embasa.
 */
const CORPUS_SELF_REFERENCE = /\brada\b/i

export function composeNonRadaAnswer(declared: NonRadaAnswer): string {
	const source = declared.source?.trim()
	const answer = declared.answer?.trim()

	// Os três precisam valer juntos. Resposta sem fonte é exatamente o caso que a regra
	// existe para impedir: conteúdo plausível, procedência nenhuma.
	if (!declared.hasAnswer || !source || !answer) return NO_BASIS_ANSWER
	if (CORPUS_SELF_REFERENCE.test(source)) return NO_BASIS_ANSWER

	return `Essa informação não é proveniente do RADA-e, mas com base em ${source}: ${answer}`
}
