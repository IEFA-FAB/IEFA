/**
 * @module lib/compatibilidade/message
 * Extraído de routes/analista-compatibilidade.tsx (port do analistacompatibilidade):
 * texto da mensagem institucional de cobrança por UG.
 */

import { formatCurrency } from "./format"
import type { UGReport } from "./parser"

export type MessageType = "com_prazo" | "sem_prazo" | "alerta"

interface PairPresence {
	hasPair1: boolean
	hasPair2: boolean
	hasPair3: boolean
	isOnlyPair1: boolean
	isOnlyPair2: boolean
	isOnlyPair3: boolean
	isOnlySiloms: boolean
}

interface PrazoTexts {
	prazoText: string
	prazoTextPair1: string
	prazoTextPair3: string
}

interface MessageBody {
	introText: string
	specificText: string
	acaoText: string
	extraText: string
	closingText: string
}

const DEFAULT_CLOSING_TEXT =
	"Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU."

/** Data do cabeçalho (`13OUT2026`): a informada na tela, ou hoje quando vazia ou inválida. */
function formatMessageDate(msgDateStr: string) {
	const today = new Date()
	let messageDate = today
	if (msgDateStr) {
		const [year, month, day] = msgDateStr.split("-").map(Number)
		if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
			messageDate = new Date(year, month - 1, day)
		}
	}

	const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	return `${messageDate.getDate().toString().padStart(2, "0")}${meses[messageDate.getMonth()]}${messageDate.getFullYear()}`
}

function classifyPairs(report: UGReport): PairPresence {
	const hasPair1 = report.pairs.some((p) => p.id === 1)
	const hasPair2 = report.pairs.some((p) => p.id === 2)
	const hasPair3 = report.pairs.some((p) => p.id === 3)

	const isOnlyPair1 = hasPair1 && !hasPair2 && !hasPair3
	const isOnlyPair2 = !hasPair1 && hasPair2 && !hasPair3
	const isOnlyPair3 = !hasPair1 && !hasPair2 && hasPair3
	const hasSiloms = hasPair2 || hasPair3
	const isOnlySiloms = !hasPair1 && hasSiloms

	return { hasPair1, hasPair2, hasPair3, isOnlyPair1, isOnlyPair2, isOnlyPair3, isOnlySiloms }
}

function resolveDefaultSubject({ isOnlyPair1, isOnlyPair2, isOnlyPair3, isOnlySiloms }: PairPresence) {
	let defaultSubject = "Acompanhamento Contábil"
	if (isOnlyPair1) {
		defaultSubject = "Divergência de saldos - Caução a Executar"
	} else if (isOnlyPair2) {
		defaultSubject = "Divergência de saldos - Materiais de Consumo"
	} else if (isOnlyPair3) {
		defaultSubject = "Divergência de saldos - Bens Móveis"
	} else if (isOnlySiloms) {
		defaultSubject = "Divergência de saldos - Almoxarifado e Bens Móveis"
	} else {
		defaultSubject = "Divergências Contábeis Diversas"
	}
	return defaultSubject
}

/** Trechos de prazo de cada modelo; vazios fora de "com prazo". */
function buildPrazoTexts(type: MessageType, prazoDias: string): PrazoTexts {
	let prazoText = ""
	let prazoTextPair1 = ""
	let prazoTextPair3 = ""
	if (type === "com_prazo") {
		if (prazoDias) {
			const [pYear, pMonth, pDay] = prazoDias.split("-").map(Number)
			const deadline = new Date(pYear, pMonth - 1, pDay)
			const diasSemana = ["Domingo", "2ª feira", "3ª feira", "4ª feira", "5ª feira", "6ª feira", "Sábado"]
			const diaSemanaStr = diasSemana[deadline.getDay()]
			const formattedDeadline = `${deadline.getDate().toString().padStart(2, "0")}/${(deadline.getMonth() + 1).toString().padStart(2, "0")}/${deadline.getFullYear()}`
			prazoText = `, até o dia ${formattedDeadline} (${diaSemanaStr})`
			prazoTextPair1 = ` até o dia ${formattedDeadline}`
			prazoTextPair3 = `, até o dia ${formattedDeadline}`
		} else {
			prazoText = `, até o dia __/__/____ (Xª feira)`
			prazoTextPair1 = ` até o dia __/__/____`
			prazoTextPair3 = `, até o dia __/__/____`
		}
	}
	return { prazoText, prazoTextPair1, prazoTextPair3 }
}

function formatValores(report: UGReport) {
	return report.pairs
		.map((p) => {
			const displayA = p.hasA ? formatCurrency(p.saldoA ?? 0) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
			const displayB = p.hasB ? formatCurrency(p.saldoB ?? 0) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
			return `Saldo da conta ${p.formattedA}: ${displayA}\nSaldo da conta ${p.formattedB}: ${displayB}\nDiferença apurada: ${formatCurrency(p.diff)}`
		})
		.join("\n\n")
}

/** Só o par 1 (caução). */
function buildPair1Body(type: MessageType, { prazoTextPair1 }: PrazoTexts): MessageBody {
	const introText = `Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).`

	const specificText = `Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.\n\nNo caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.\n\nDessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.`

	let acaoText = ""
	if (type === "alerta") {
		acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise a situação verificada. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
	} else {
		acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise a situação verificada${prazoTextPair1}. Caso seja constatada irregularidade, deverá ser promovida a regularização imediata dos registros contábeis. Na hipótese de não haver falha, mas sim diferenças justificadas, especialmente pela existência de cauções em títulos da dívida pública, deverá ser encaminhada justificativa formal detalhada${type === "com_prazo" ? " até a mesma data" : ""}, com base nos fundamentos aqui descritos, para fins de análise e arquivamento.`
	}

	const closingText =
		"Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto."

	return { introText, specificText, acaoText, extraText: "", closingText }
}

/** Só o par 2 (materiais de consumo). */
function buildPair2Body(report: UGReport, type: MessageType, { prazoText }: PrazoTexts): MessageBody {
	const p = report.pairs[0]
	const introText = `Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis ${p.formattedA} (${p.nameA}) e ${p.formattedB} (${p.nameB})${p.legis}.`
	let acaoText = ""
	if (type === "alerta") {
		acaoText = `Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
	} else {
		acaoText = `Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria${prazoText} pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
	}
	const extraText = `Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.`

	return { introText, specificText: "", acaoText, extraText, closingText: DEFAULT_CLOSING_TEXT }
}

/** Só o par 3 (bens móveis). */
function buildPair3Body(report: UGReport, type: MessageType, { prazoTextPair3 }: PrazoTexts): MessageBody {
	const p = report.pairs[0]
	const introText = `Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis ${p.a} (${p.nameA}) e ${p.b} (${p.nameB})${p.legis}.`
	let acaoText = ""
	let extraText = ""
	if (type === "alerta") {
		acaoText = `Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
		extraText = ``
	} else {
		acaoText = `Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria${prazoTextPair3}.`
		extraText = `Com o fito de agilizar a troca de informações entre esta Diretoria e essa UG, solicito a possibilidade de responder o presente questionamento pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
	}

	return { introText, specificText: "", acaoText, extraText, closingText: DEFAULT_CLOSING_TEXT }
}

// Mixed pairs
function buildMixedBody(report: UGReport, { hasPair1, hasPair2, hasPair3 }: PairPresence, type: MessageType, { prazoText }: PrazoTexts): MessageBody {
	const introText =
		`Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:\n\n` +
		report.pairs.map((p) => `- ${p.formattedA} (${p.nameA}) e ${p.formattedB} (${p.nameB})`).join("\n")

	const specificParts = []
	if (hasPair1) {
		specificParts.push(
			`Em relação às contas 8.1.1.1.1.01.13 e 1.1.1.1.1.19.03, exige-se análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e). Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo e no passivo, é obrigatório o registro de documento hábil RC com a situação LDV053. No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na conta de controle, sem movimentação nas contas de caixa. Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior.`
		)
	}
	if (hasPair2 || hasPair3) {
		specificParts.push(
			`Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).`
		)
	}
	const specificText = specificParts.join("\n\n")

	let acaoText = ""
	if (type === "alerta") {
		acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise os casos em questão e promova a regularização imediata dos registros contábeis. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
	} else {
		acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria${prazoText} pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
	}

	let extraText = ""
	if (hasPair2) {
		extraText = `Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.`
	}

	return { introText, specificText, acaoText, extraText, closingText: DEFAULT_CLOSING_TEXT }
}

function buildMessageBody(report: UGReport, presence: PairPresence, type: MessageType, prazos: PrazoTexts): MessageBody {
	if (presence.isOnlyPair1) return buildPair1Body(type, prazos)
	if (presence.isOnlyPair2) return buildPair2Body(report, type, prazos)
	if (presence.isOnlyPair3) return buildPair3Body(report, type, prazos)
	return buildMixedBody(report, presence, type, prazos)
}

export function generateMessageText(report: UGReport, type: MessageType, prazoDias: string, msgNum: string, msgDateStr: string, customSubject: string) {
	const dateStr = formatMessageDate(msgDateStr)
	const numStr = msgNum.trim() !== "" ? msgNum.trim() : "___"

	const presence = classifyPairs(report)
	const defaultSubject = resolveDefaultSubject(presence)
	const subjectStr = customSubject.trim() !== "" ? customSubject : defaultSubject

	const prazos = buildPrazoTexts(type, prazoDias)
	const valoresText = formatValores(report)
	const { introText, specificText, acaoText, extraText, closingText } = buildMessageBody(report, presence, type, prazos)

	const detailText = presence.isOnlyPair1 ? `Detalhamento da divergência:\n\n${valoresText}` : `Detalhamento da(s) divergência(s):\n\n${valoresText}`

	return `
Assunto: ${subjectStr}

Mensagem n° ${numStr}/SUCONT-3/${dateStr}

${introText}

${detailText}
${specificText ? `\n${specificText}\n` : ""}
${acaoText}
${extraText ? `\n${extraText}\n` : ""}
${closingText}

DIREF/SUCONT/SUCONT-3
`
		.trim()
		.replace(/\n{3,}/g, "\n\n")
}
