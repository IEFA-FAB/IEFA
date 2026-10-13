// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): texto das
// mensagens institucionais (por UG e consolidada) e contexto enviado ao oráculo.
import type { AdvancedAnalysis } from "#/lib/conta-generica/advanced-analysis"
import { formatCurrency, formatMilitaryDate, type GroupedData, getConferente, getRacInfo, getUgName } from "#/lib/conta-generica/helpers"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"

export type MessageType = "prazo" | "sem_prazo" | "alerta"

/** Metadados da mensagem escolhidos na tela (número, data, tipo, prazo). */
export interface MessageSettings {
	messageType: MessageType
	deadline: string
	msgNumber: string
	msgDate: string
}

// ── Message generation ──────────────────────────────────────────────────────

export const generateMessage = (ug: string, contas: GroupedData[string], { messageType, deadline, msgNumber, msgDate }: MessageSettings) => {
	const racGroups: Record<string, { info: ReturnType<typeof getRacInfo>; accounts: string[] }> = {}
	for (const conta of Object.keys(contas)) {
		const racInfo = getRacInfo(conta)
		if (!racGroups[racInfo.id]) racGroups[racInfo.id] = { info: racInfo, accounts: [] }
		racGroups[racInfo.id].accounts.push(conta)
	}

	let contasText = ""
	for (const group of Object.values(racGroups)) {
		contasText += "\n"
		for (const conta of group.accounts) {
			contasText += `- Conta Contábil: ${conta}\n`
			contas[conta].forEach((reg) => {
				contasText += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${formatCurrency(reg.saldo)}\n`
			})
		}
	}

	const deadlineText =
		messageType === "prazo" && deadline
			? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
			: ""

	const stnNote =
		ug === "120999"
			? "\nNOTA: Esta Unidade Gestora (120999 - MAER - DIF. CAMBIAL) possui tratamento diferenciado por ser de uso exclusivo da Secretaria do Tesouro Nacional (STN).\n"
			: ""

	const actionText =
		messageType === "alerta"
			? `A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada e realize as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
			: `Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

	return `Assunto: Identificação de Inconsistência Contábil

Mensagem nº ${msgNumber}/SUCONT-3/${formatMilitaryDate(msgDate)}

Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência contábil por esta Unidade Gestora, apresentando saldo(s) diferente(s) de zero.
${stnNote}
Abaixo, detalhamos a(s) conta(s) e o(s) respectivo(s) saldo(s) identificado(s):${contasText}${deadlineText}
${actionText}

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}

export const generateSingleMessage = (
	result: GroupedData | null,
	conferenteFilter: string | null,
	{ messageType, deadline, msgNumber, msgDate }: MessageSettings
) => {
	const deadlineText =
		messageType === "prazo" && deadline
			? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
			: ""

	const actionText =
		messageType === "alerta"
			? `A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada e realizem as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
			: `Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

	const ugsToInclude = Object.keys(result ?? {})
		.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
		.sort()

	let text = `Assunto: Identificação de Inconsistências Contábeis\n\nMensagem nº ${msgNumber}/SUCONT-3/${formatMilitaryDate(msgDate)}\n\n`
	text += `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências apresentando saldo(s) diferente(s) de zero.\n\n`
	text += `Abaixo, detalhamos as inconsistências identificadas por Unidade Gestora:\n\n`

	for (const ug of ugsToInclude) {
		text += `UG: ${getUgName(ug)} (${ug})\n`
		const contas = result?.[ug]
		if (!contas) continue
		for (const conta of Object.keys(contas)) {
			text += `- Conta Contábil: ${conta}\n`
			contas[conta].forEach((reg) => {
				text += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${formatCurrency(reg.saldo)}\n`
			})
		}
		text += "\n"
	}

	text += `${deadlineText}\n${actionText}\n\n${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}\n\nAtenciosamente,\n\nDivisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)\nSubdiretoria de Contabilidade (SUCONT)\nDiretoria de Economia e Finanças da Aeronáutica (DIREF)`
	return text
}

// ── Oracle ──────────────────────────────────────────────────────────────────

export type OracleContextInput = Pick<AdvancedAnalysis, "totalFinancialImpact" | "odsRiskMap" | "priorityList"> & {
	criticalSummary: AdvancedAnalysis["criticalSummary"] | null
	paretoData: AdvancedAnalysis["paretoData"] | null
}

// Só os dados da análise: persona e regras do oráculo são do servidor.
export const buildOracleContext = ({ totalFinancialImpact, odsRiskMap, criticalSummary, paretoData, priorityList }: OracleContextInput) =>
	`
Dados da análise atual:
- Impacto Financeiro Total em Risco: ${formatCurrency(totalFinancialImpact)}
- Total de inconsistências: ${odsRiskMap.reduce((a, c) => a + c.count, 0)}
- ODS mais crítico: ${criticalSummary?.ods}
- Órgão Superior mais crítico: ${criticalSummary?.os}
- UG com mais inconsistências: ${criticalSummary?.ugCount} (${getUgName(criticalSummary?.ugCount || "")})
- UG com maior volume irregular: ${criticalSummary?.ugVolume} (${getUgName(criticalSummary?.ugVolume || "")})
- Análise de Pareto: ${paretoData?.ugPercentage}% das UGs concentram ${paretoData?.inconsistencyPercentage}% das inconsistências.

Mapa de Risco por ODS:
${odsRiskMap.map((o) => `- ${o.ods}: ${o.count} inconsistências (${o.percentage}%), Volume: ${formatCurrency(o.volume)}`).join("\n")}

Prioridades de Atuação:
${priorityList.map((p, i) => `${i + 1}º: UG ${p.ug} (${getUgName(p.ug)}) - Score: ${p.priorityScore}`).join("\n")}
      `.trim()
