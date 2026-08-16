/**
 * @module normas
 * Fonte única das referências normativas citadas nas mensagens geradas pelas
 * ferramentas e nos prompts de IA.
 *
 * Existe porque as citações estavam espalhadas como texto solto em cada gerador
 * de mensagem — e uma delas estava errada: o prompt do ofício chamava a
 * macrofunção 02.03.18 de "Fidedignidade e ajuste de pendências", título que não
 * existe. A 02.03.18 é ENCERRAMENTO DO EXERCÍCIO; quem trata de conformidade é a
 * 02.03.15.
 *
 * Regra de uso: mensagem que cobra UG cita daqui. Nunca escreva o número da
 * macrofunção à mão no meio de um template.
 */

export interface Macrofuncao {
	codigo: string
	titulo: string
}

/** Macrofunções do Manual SIAFI efetivamente aplicáveis ao acompanhamento contábil. */
export const MACROFUNCOES = {
	/** Análise de contas, pendências alongadas, saldo invertido, c/c 999. */
	encerramento: { codigo: "02.03.18", titulo: "Encerramento do Exercício" },
	/** Taxonomia da ocorrência: alerta × ressalva; radicais incoerência/conciliação/saldo invertido/pendência. */
	conformidade: { codigo: "02.03.15", titulo: "Conformidade Contábil" },
	restosAPagar: { codigo: "02.03.17", titulo: "Restos a Pagar" },
	depreciacao: { codigo: "02.03.30", titulo: "Depreciação, Amortização e Exaustão" },
	reavaliacao: { codigo: "02.03.35", titulo: "Reavaliação e Redução ao Valor Recuperável" },
	regularizacoes: { codigo: "02.10.06", titulo: "Manual de Regularizações Contábeis" },
} as const satisfies Record<string, Macrofuncao>

/** "Macrofunção 02.03.18 — Encerramento do Exercício (Manual SIAFI)" */
export function citarMacrofuncao(m: Macrofuncao): string {
	return `Macrofunção ${m.codigo} — ${m.titulo} (Manual SIAFI)`
}

/** Referências do RADA-e usadas pela SUCONT-4 na conciliação patrimonial. */
export const RADAE = {
	execucaoPatrimonial: "Manual G (RADA-e), Módulo 7 — Execução Patrimonial",
	manualD: "Manual D (RADA-e), Item 8",
} as const

/**
 * Fundamentação de saldo em conta transitória / de trânsito / a classificar.
 *
 * A 02.03.18 §5.1 manda analisar e conciliar os saldos, "procurando eliminar as
 * pendências indevidas e/ou alongadas". As regras conta a conta (§5.2) são
 * condicionais — "somente permanecerá com saldo se…", "não deverá ter valores de
 * longa data". A norma federal NÃO proíbe saldo ao fim de um mês qualquer: essa
 * exigência é do RAC, e por isso as duas coisas aparecem separadas no texto.
 */
export const FUNDAMENTO_SALDO_TRANSITORIO = [
	`${citarMacrofuncao(MACROFUNCOES.encerramento)}, item 5.1 — as contas do Balanço devem ter os saldos analisados e conciliados, eliminando pendências indevidas e/ou alongadas, ainda que em nível de conta corrente.`,
	"Roteiro de Acompanhamento Contábil (RAC/SUCONT-3) — o fechamento mensal sem saldo residual nestas contas é exigência interna do COMAER, mais restritiva que a periodicidade de encerramento prevista na macrofunção.",
] as const

/**
 * Fundamentação de uso de conta ou subitem genérico (Q34/Q35).
 *
 * A 02.03.18 §5.1 manda evitar o c/c 999. A ocorrência federal correspondente é
 * de materialidade: a transação CONINCONS lista o subelemento 99 que ultrapassa
 * 5% do valor em cada modalidade de aplicação e elemento de despesa (parâmetro em
 * CONPARINC), e a 02.03.15 §4.2.2.2 trata o excesso como RESSALVA.
 *
 * As ferramentas do sucont ainda não calculam esse percentual — não recebem
 * modalidade nem elemento no relatório de origem. Por isso o texto declara que o
 * apontamento é por ocorrência, e não por ultrapassagem do parâmetro federal.
 */
export const FUNDAMENTO_CONTA_GENERICA = [
	`${citarMacrofuncao(MACROFUNCOES.encerramento)}, item 5.1 — os saldos devem ser analisados evitando-se a utilização do conta corrente 999.`,
	`${citarMacrofuncao(MACROFUNCOES.conformidade)}, item 4.2.2.2 — o registro na conta "Outros" acima do percentual da transação CONPARINC enseja ressalva na conformidade contábil.`,
	"Este apontamento é por ocorrência, apurado no relatório do Tesouro Gerencial. Ele não afere o percentual do subelemento 99 por modalidade de aplicação e elemento de despesa (CONINCONS), de modo que pode alcançar situação ainda abaixo do parâmetro federal.",
] as const

/**
 * Fundamentação de divergência entre sistema estruturante e contabilidade
 * (SIAFI × SILOMS). É exatamente o radical CONCILIAÇÃO da 02.03.15 §4.2.3.2.
 */
export const FUNDAMENTO_CONCILIACAO_SISTEMAS = [
	`${citarMacrofuncao(MACROFUNCOES.conformidade)}, item 4.2.3.2 — divergência entre sistema externo e contábil caracteriza ocorrência do radical CONCILIAÇÃO, registrável como ressalva.`,
	`${citarMacrofuncao(MACROFUNCOES.encerramento)}, item 5.1 — conciliação e eliminação de pendências alongadas.`,
	RADAE.execucaoPatrimonial,
	RADAE.manualD,
] as const

/** Renderiza um bloco "Fundamentação normativa" numerado para o corpo da mensagem. */
export function blocoFundamentacao(itens: readonly string[]): string {
	return ["Fundamentação normativa:", ...itens.map((item, i) => `${i + 1}. ${item}`)].join("\n")
}
