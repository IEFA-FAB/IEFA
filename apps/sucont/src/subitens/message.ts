// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): texto das
// mensagens institucionais (por UG e consolidada por questão RAC) e das datas que
// entram nele.
import { addDays, todayInBrasilia } from "#/lib/brasilia"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"
import type { MessageConfig, ProcessedData } from "#/subitens/types"
import { formatUgFull } from "#/subitens/ug"

/**
 * Prazo padrão da mensagem: cinco dias a partir de hoje em Brasília. O campo mostra esse valor
 * quando ninguém escolheu outro, e o texto da mensagem lê o mesmo, para tela e mensagem não
 * divergirem (o `toISOString()` dava o dia seguinte depois das 21h).
 */
export const defaultDeadline = (today: string = todayInBrasilia()) => addDays(today, 5)

// ── Constants ────────────────────────────────────────────────
export const RAC_QUESTIONS: Record<string, { title: string; description: string }> = {
	"RAC 28": {
		title: "Utilização de Contas/Subitens Genéricos",
		description:
			"Identificação de saldos em contas contábeis cuja conta corrente usa código genérico: o subitem 99 (“Outros…”) da natureza de despesa ou o conta corrente 999, que a Macrofunção 02.03.18 manda evitar. O uso prejudica a transparência e a correta evidenciação dos atos e fatos administrativos.",
	},
}

/**
 * Aviso de relatório sem nenhum código genérico na conta corrente. A regex marca o subitem
 * 99 e também o 999, que NÃO é subitem: é o favorecido genérico do c/c 002 (ver
 * `GENERIC_SUBITEM_REGEX`). O texto antigo, "Nenhum subitem genérico (99/999)", chamava os
 * dois de subitem.
 */
export const NO_GENERIC_CODE_MESSAGE = "Nenhum código genérico identificado na conta corrente: nem subitem 99 (“Outros…”) nem favorecido genérico 999."

/** Data da mensagem no formato do número (`05OUT2026`). Sem data, o marcador `XXXMÊSANO`. */
export const formatMsgDate = (dateStr: string) => {
	if (!dateStr) return "XXXMÊSANO"
	const date = new Date(`${dateStr}T12:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	const month = months[date.getMonth()]
	const year = date.getFullYear()
	return `${day}${month}${year}`
}

/**
 * Chave de uma mensagem na tela: identifica o rascunho e o "Copiado". As duas listas
 * (por UG e consolidada por questão) usam prefixos diferentes; antes o "Copiado" era
 * guardado pelo índice, e a primeira mensagem de uma lista marcava a primeira da outra.
 */
export const ugMessageKey = (ug: string) => `ug:${ug}`
export const racMessageKey = (racId: string) => `rac:${racId}`

/**
 * Data do relatório em `DD/MM/AAAA`, a partir do valor do `<input type="date">`.
 *
 * O campo vazio (a conferente apagou a data) devolve "". A tela formatava com
 * `Intl.DateTimeFormat` sobre `new Date("T12:00:00")`, que é data inválida e lançava
 * `RangeError` no meio da renderização, derrubando a tela de resultados.
 */
export const formatReportDate = (dateStr: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
	if (!match) return ""
	const [, year, month, day] = match
	return `${day}/${month}/${year}`
}

/**
 * Prazo que entra no texto (`DD/MM/AAAA`), só para mensagem "com prazo". Era o corpo de
 * `getDeadlineText`/`getRacDeadlineText`; o prazo padrão vem por parâmetro para o teste
 * fixar a data, e só é calculado quando a configuração não tem data limite.
 */
export const formatDeadlineText = (config: MessageConfig | undefined, fallbackDeadline: () => string = defaultDeadline) => {
	if (config?.messageType !== "com_prazo") return ""
	const [year, month, day] = (config.deadlineDate || fallbackDeadline()).split("-")
	return `${day}/${month}/${year}`
}

// ── Message Templates ────────────────────────────────────────
const formatOccurrenceLines = (occurrences: ProcessedData[]) =>
	occurrences
		.map(
			(occ) =>
				`   • Conta Contábil ${occ.contaContabil} — Conta Corrente ${occ.contaCorrente} — Saldo: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}`
		)
		.join("\n")

/** Agrupa num objeto simples: a ordem das chaves (inteiras primeiro) é a que o texto sempre teve. */
function groupOccurrencesBy(occurrences: ProcessedData[], field: "racId" | "ug"): Record<string, ProcessedData[]> {
	const grouped: Record<string, ProcessedData[]> = {}
	for (const occ of occurrences) {
		if (!grouped[occ[field]]) grouped[occ[field]] = []
		grouped[occ[field]].push(occ)
	}
	return grouped
}

const getRacTitle = (racId: string) => RAC_QUESTIONS[racId]?.title || racId

const buildDeadlineClause = (messageType: "com_prazo" | "sem_prazo" | "alerta", deadline: string) =>
	messageType === "com_prazo" && deadline
		? `\nSolicitamos que as providências sejam adotadas no prazo de ${deadline}, a contar do recebimento desta mensagem.\n`
		: ""

const buildConclusion = (messageType: "com_prazo" | "sem_prazo" | "alerta") =>
	messageType === "alerta"
		? `Esta é uma mensagem de alerta. Não é necessário responder via Sistema de Atendimento ao Usuário (SAU) com as ações realizadas ou justificativas, a menos que haja alguma dúvida.`
		: `Após a regularização, ou caso haja justificativa técnica para a manutenção do saldo, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

export const INSTITUTIONAL_TEMPLATE = (
	_ug: string,
	occurrences: ProcessedData[],
	_date: string,
	monthYear: string,
	messageType: "com_prazo" | "sem_prazo" | "alerta" = "sem_prazo",
	deadline = "",
	messageNumber = "XXX",
	focalRacId?: string
) => {
	const groupedByRac = groupOccurrencesBy(occurrences, "racId")

	// Questão focal: só quando informada e diferente de "all" (que é o panorama geral).
	const focalId = focalRacId && focalRacId !== "all" ? focalRacId : undefined

	const racIds = focalId ? [focalId] : Object.keys(groupedByRac)

	const occurrencesList = racIds.map((id) => formatOccurrenceLines(groupedByRac[id] ?? [])).join("\n")

	const subject = focalId
		? `Assunto: Inconsistência Contábil — ${getRacTitle(focalId)}`
		: `Assunto: Regularização de Inconsistências Contábeis — Panorama Geral`

	const deadlineClause = buildDeadlineClause(messageType, deadline)

	const intro = focalId
		? `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à ${getRacTitle(focalId)} por esta Unidade Gestora.`
		: `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências contábeis sob responsabilidade desta Unidade Gestora, conforme detalhamento abaixo:`

	const conclusion = buildConclusion(messageType)

	return `${subject}

Mensagem nº ${messageNumber}/SUCONT-3/${monthYear}

${intro}

Detalhamento da(s) situação(ões) identificada(s):
${occurrencesList}
${deadlineClause}
Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

${conclusion}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}

export const CONSOLIDATED_TEMPLATE = (
	racId: string,
	occurrences: ProcessedData[],
	_date: string,
	monthYear: string,
	messageType: "com_prazo" | "sem_prazo" | "alerta" = "sem_prazo",
	deadline = "",
	messageNumber = "XXX"
) => {
	const groupedByUg = groupOccurrencesBy(occurrences, "ug")

	const occurrencesList = Object.keys(groupedByUg)
		.map((ug) => `${formatUgFull(ug)}:\n${formatOccurrenceLines(groupedByUg[ug] ?? [])}`)
		.join("\n\n")

	const subject = `Assunto: Inconsistência Contábil — ${getRacTitle(racId)}`

	const deadlineClause = buildDeadlineClause(messageType, deadline)

	const intro = `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à ${getRacTitle(racId)} pelas Unidades Gestoras listadas abaixo.`

	const conclusion = buildConclusion(messageType)

	return `${subject}

Mensagem nº ${messageNumber}/SUCONT-3/${monthYear}

Às Unidades Gestoras (UGs) listadas abaixo:

${intro}

Detalhamento da(s) situação(ões) identificada(s):
${occurrencesList}
${deadlineClause}
Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

${conclusion}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}
