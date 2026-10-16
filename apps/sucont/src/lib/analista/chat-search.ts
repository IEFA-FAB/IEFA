// Extraído de components/analista/chat-assistant.tsx (`handleSearch`, port do Analistasaldoimproprio):
// a interpretação da pergunta ao Oráculo SUCONT e a resposta montada a partir dos painéis.
import { getOrganizacao } from "#/lib/analista/organizacao"

export interface MangerialData {
	totalRiskValue: number
	topUgs: { ug: string; count: number; value: number }[]
	topRacs: { name: string; value: number }[]
	totalIssues: number
	conferentes: { name: string; count: number; ugs: string[] }[]
}

export interface EstrategicoData {
	totalRiskValue: number
	topOds: { name: string; count: number; value: number; percent: number }[]
	topOrgaosSuperiores: {
		name: string
		count: number
		value: number
		percent: number
	}[]
	topContas: { conta: string; count: number; value: number; descricao: string }[]
	totalIssues: number
}

export interface DecisaoData {
	pareto: {
		totalUgs: number
		twentyPercentCount: number
		paretoPercent: number
		topTwentyUgs: Array<{ ug: string; nome: string; count: number }>
	}
	priorities: Array<{ ug: string; nome: string; count: number; value: number }>
	criticalLevels: {
		ods: string
		superior: string
		ugCount: string
		ugValue: string
	}
}

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

interface ChatContext {
	managerialData: MangerialData
	estrategicoData: EstrategicoData
	decisaoData: DecisaoData | null
}

/** Uma pergunta reconhecida: `matches` recebe a pergunta já em minúsculas. */
interface ChatRule {
	matches: (lowerQuery: string) => boolean
	answer: (ctx: ChatContext) => string
}

const hasAny = (lowerQuery: string, terms: string[]) => terms.some((term) => lowerQuery.includes(term))

const FALLBACK_ANSWER =
	'Desculpe, não consegui interpretar essa pergunta. Como Oráculo SUCONT, posso ajudá-lo com:\n- "Qual ODS possui maior risco contábil?"\n- "Qual Órgão Superior concentra mais inconsistências?"\n- "Qual UG apresenta maior risco contábil?"\n- "Quais são as 10 UGs mais críticas do COMAER?"\n- "20% das UGs concentram quantos % das inconsistências?"\n- "Quais inconsistências devem ser tratadas primeiro?"'

/**
 * Resposta quando o painel consultado não tem o que listar (filtro sem cobrança). As
 * regras liam `[0].name` direto e lançavam `TypeError` no meio do chat.
 */
const EMPTY_PANEL_ANSWER = "Não há inconsistências no recorte atual para responder a essa pergunta. Ajuste o filtro ou carregue outro relatório."

/** Avaliadas em ordem; a primeira que casa responde. */
const CHAT_RULES: ChatRule[] = [
	{
		matches: (q) => q.includes("ods") && hasAny(q, ["mais inconsistências", "maior risco"]),
		answer: ({ estrategicoData }) => {
			const topOds = estrategicoData.topOds[0]
			if (!topOds) return EMPTY_PANEL_ANSWER
			return `O ODS com maior risco contábil (mais inconsistências) é o **${topOds.name}**, com ${topOds.count} inconsistências (${topOds.percent.toFixed(1)}% do total).`
		},
	},
	{
		matches: (q) => q.includes("órgão superior") && hasAny(q, ["concentra mais", "mais inconsistências"]),
		answer: ({ estrategicoData }) => {
			const topOrgao = estrategicoData.topOrgaosSuperiores[0]
			if (!topOrgao) return EMPTY_PANEL_ANSWER
			return `O Órgão Superior que concentra mais inconsistências é o **${topOrgao.name}**, com ${topOrgao.count} ocorrências (${topOrgao.percent.toFixed(1)}% do total).`
		},
	},
	{
		matches: (q) => q.includes("ug") && q.includes("maior risco"),
		answer: ({ managerialData }) => {
			const topUg = managerialData.topUgs[0]
			if (!topUg) return EMPTY_PANEL_ANSWER
			const org = getOrganizacao(topUg.ug)
			return `A UG que apresenta o maior risco contábil (número de inconsistências) é a **UG ${topUg.ug} (${org.nome})**, com ${topUg.count} inconsistências.`
		},
	},
	{
		matches: (q) => q.includes("ug") && q.includes("maior saldo irregular"),
		answer: ({ managerialData }) => {
			const topUgValue = [...managerialData.topUgs].sort((a, b) => b.value - a.value)[0]
			if (!topUgValue) return EMPTY_PANEL_ANSWER
			const org = getOrganizacao(topUgValue.ug)
			return `A UG com o maior saldo irregular é a **UG ${topUgValue.ug} (${org.nome})**, totalizando ${formatCurrency(topUgValue.value)}.`
		},
	},
	{
		matches: (q) => q.includes("10 ugs") || (q.includes("ugs") && q.includes("mais críticas")),
		answer: ({ managerialData }) => {
			const top10 = managerialData.topUgs.slice(0, 10)
			if (top10.length === 0) return EMPTY_PANEL_ANSWER
			return `As 10 UGs mais críticas do COMAER (por volume de inconsistências) são:\n\n${top10
				.map((ug, i) => {
					const org = getOrganizacao(ug.ug)
					return `${i + 1}º UG ${ug.ug} (${org.nome}) — ${ug.count} inconsistências`
				})
				.join("\n")}`
		},
	},
	{
		matches: (q) => q.includes("20%") && q.includes("concentram"),
		answer: ({ decisaoData }) => {
			if (decisaoData?.pareto.totalUgs === 0) return EMPTY_PANEL_ANSWER
			if (decisaoData) {
				return `De acordo com a análise de Pareto, **20% das UGs** analisadas concentram **${decisaoData.pareto.paretoPercent.toFixed(1)}%** de todas as inconsistências contábeis.`
			}
			return "A análise de Pareto indica que uma parcela reduzida de UGs concentra a maioria das inconsistências. Carregue mais dados para um percentual exato."
		},
	},
	{
		matches: (q) => hasAny(q, ["primeiro", "prioridade", "tratar"]),
		answer: ({ decisaoData }) => {
			if (decisaoData?.priorities.length === 0) return EMPTY_PANEL_ANSWER
			if (decisaoData) {
				const top3 = decisaoData.priorities.slice(0, 3)
				return `As inconsistências que devem ser tratadas com prioridade imediata (considerando volume, valor e impacto) são das seguintes UGs:\n\n${top3
					.map((ug, i) => `${i + 1}º UG ${ug.ug} (${ug.nome}) — ${ug.count} inconsistências — ${formatCurrency(ug.value)}`)
					.join("\n")}`
			}
			return "As prioridades de atuação devem focar em UGs com maior volume de inconsistências e maior impacto financeiro."
		},
	},
	{
		matches: (q) => hasAny(q, ["mapa de risco", "panorama"]),
		answer: ({ estrategicoData }) => {
			if (estrategicoData.topOds.length === 0) return EMPTY_PANEL_ANSWER
			return `O Mapa de Risco Contábil mostra a distribuição das inconsistências por ODS:\n\n${estrategicoData.topOds
				.map((o) => `${o.name} — ${o.count} inconsistências — ${formatCurrency(o.value)} — ${o.percent.toFixed(1)}%`)
				.join("\n")}`
		},
	},
	{
		matches: (q) => q.includes("questão rac") && hasAny(q, ["mais recorrente", "mais frequente"]),
		answer: ({ managerialData }) => {
			const topRac = managerialData.topRacs[0]
			if (!topRac) return EMPTY_PANEL_ANSWER
			return `A questão RAC mais recorrente é a **${topRac.name}**, com ${topRac.value} ocorrências.`
		},
	},
	{
		matches: (q) => hasAny(q, ["120999", "stn", "diferenciado"]),
		answer: () =>
			"A **UG 120999 (MAER - DIF. CAMBIAL)**, subordinada à **SEFA / SEFA**, é o Órgão Central de Contabilidade (STN). O tratamento é diferenciado por ser exclusivo para lançamentos da Secretaria do Tesouro Nacional.",
	},
	{
		matches: (q) => hasAny(q, ["setorial", "autoridade"]),
		answer: () =>
			"As Setoriais Contábeis do COMAER (SEFA) são a autoridade máxima em normas e fiscalização contábil. São elas:\n- UG 120002 (DIREF), subordinada ao SEFA / SEFA\n- UG 120701 (DIREF/SUCONT), subordinada ao SEFA / SEFA\n- UG 120702 (DIREF/SUCONV), subordinada ao SEFA / SEFA\n- UG 121002 (DIREF - FAer), subordinada ao SEFA / SEFA",
	},
]

export function answerChatQuery(query: string, managerialData: MangerialData, estrategicoData: EstrategicoData, decisaoData: DecisaoData | null): string {
	const lowerQuery = query.toLowerCase()
	const rule = CHAT_RULES.find((r) => r.matches(lowerQuery))
	return rule ? rule.answer({ managerialData, estrategicoData, decisaoData }) : FALLBACK_ANSWER
}
