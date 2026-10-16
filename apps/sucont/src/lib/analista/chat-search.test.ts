// Caracterização das respostas do Oráculo SUCONT (chat-assistant.tsx).
import { describe, expect, it } from "bun:test"
import { answerChatQuery, type DecisaoData, type EstrategicoData, type ManagerialData } from "./chat-search"

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const MANAGERIAL: ManagerialData = {
	totalRiskValue: 1000,
	topUgs: [
		{ ug: "120062", count: 5, value: 100 },
		{ ug: "120039", count: 3, value: 900 },
		{ ug: "999001", count: 1, value: 10 },
	],
	topRacs: [
		{ name: "Questão 35", value: 4, fill: "#000" },
		{ name: "Questão 26", value: 2, fill: "#000" },
	],
	totalIssues: 9,
	conferentes: [],
}

const ESTRATEGICO: EstrategicoData = {
	totalRiskValue: 1000,
	topOds: [
		{ name: "COMPREP", count: 5, value: 100, percent: 62.5, fill: "#000" },
		{ name: "SEFA", count: 3, value: 900, percent: 37.5, fill: "#000" },
	],
	topOrgaosSuperiores: [{ name: "IV COMAR", count: 5, value: 100, percent: 62.54 }],
	topContas: [],
	totalIssues: 8,
}

/** Linha de prioridade do painel; ODS, órgão e score não entram nas respostas testadas. */
const priority = (ug: string, nome: string, count: number, value: number) => ({ ug, nome, count, value, ods: "-", superior: "-", score: 0 })

const DECISAO: DecisaoData = {
	pareto: {
		totalUgs: 3,
		ugPercentage: (2 / 3) * 100,
		issuePercentage: (5 / 6) * 100,
		topUgs: [priority("120062", "BASP", 3, 100), priority("120039", "GAP-RJ", 2, 900)],
	},
	priorities: [
		priority("120039", "GAP-RJ", 3, 900),
		priority("120062", "BASP", 5, 100),
		priority("999001", "UG 999001", 1, 10),
		priority("120002", "DIREF", 1, 1),
	],
	criticalLevels: { ods: "COMPREP", superior: "IV COMAR", ugCount: "120062", ugValue: "120039" },
}

const ask = (query: string, decisao: DecisaoData | null = DECISAO) => answerChatQuery(query, MANAGERIAL, ESTRATEGICO, decisao)

const ODS = "O ODS com maior risco contábil (mais inconsistências) é o **COMPREP**, com 5 inconsistências (62.5% do total)."
const ORGAO = "O Órgão Superior que concentra mais inconsistências é o **IV COMAR**, com 5 ocorrências (62.5% do total)."
const UG_RISCO = "A UG que apresenta o maior risco contábil (número de inconsistências) é a **UG 120062 (BASP)**, com 5 inconsistências."
const TOP10 =
	"As 10 UGs mais críticas do COMAER (por volume de inconsistências) são:\n\n1º UG 120062 (BASP) — 5 inconsistências\n2º UG 120039 (GAP-RJ) — 3 inconsistências\n3º UG 999001 (UG 999001) — 1 inconsistências"
const PARETO = "De acordo com a análise de Pareto, **67% das UGs (2 UGs) concentram 83% das inconsistências** contábeis."
// A pergunta antiga fala em 20% das UGs; a resposta diz qual é o recorte do painel.
const PARETO_20 = `O painel não mede um corte fixo de 20% das UGs: o recorte é o grupo de UGs, da maior contagem para a menor, que soma 80% das inconsistências. ${PARETO}`
const PARETO_SEM_DADO =
	"A análise de Pareto indica que uma parcela reduzida de UGs concentra a maioria das inconsistências. Carregue mais dados para um percentual exato."
const PRIORIDADE = `As inconsistências que devem ser tratadas com prioridade imediata (considerando volume, valor e impacto) são das seguintes UGs:\n\n1º UG 120039 (GAP-RJ) — 3 inconsistências — ${brl(900)}\n2º UG 120062 (BASP) — 5 inconsistências — ${brl(100)}\n3º UG 999001 (UG 999001) — 1 inconsistências — ${brl(10)}`
const PRIORIDADE_SEM_DADO = "As prioridades de atuação devem focar em UGs com maior volume de inconsistências e maior impacto financeiro."
const MAPA = `O Mapa de Risco Contábil mostra a distribuição das inconsistências por ODS:\n\nCOMPREP — 5 inconsistências — ${brl(100)} — 62.5%\nSEFA — 3 inconsistências — ${brl(900)} — 37.5%`
const RAC = "A questão RAC mais recorrente é a **Questão 35**, com 4 ocorrências."
const STN =
	"A **UG 120999 (MAER - DIF. CAMBIAL)**, subordinada à **SEFA / SEFA**, é o Órgão Central de Contabilidade (STN). O tratamento é diferenciado por ser exclusivo para lançamentos da Secretaria do Tesouro Nacional."
const SETORIAL =
	"As Setoriais Contábeis do COMAER (SEFA) são a autoridade máxima em normas e fiscalização contábil. São elas:\n- UG 120002 (DIREF), subordinada ao SEFA / SEFA\n- UG 120701 (DIREF/SUCONT), subordinada ao SEFA / SEFA\n- UG 120702 (DIREF/SUCONV), subordinada ao SEFA / SEFA\n- UG 121002 (DIREF - FAer), subordinada ao SEFA / SEFA"
const FALLBACK =
	'Desculpe, não consegui interpretar essa pergunta. Como Oráculo SUCONT, posso ajudá-lo com:\n- "Qual ODS possui maior risco contábil?"\n- "Qual Órgão Superior concentra mais inconsistências?"\n- "Qual UG apresenta maior risco contábil?"\n- "Quais são as 10 UGs mais críticas do COMAER?"\n- "Quantas UGs concentram 80% das inconsistências?"\n- "Quais inconsistências devem ser tratadas primeiro?"'

describe("answerChatQuery", () => {
	it.each([
		["Qual ODS tem mais inconsistências?", ODS],
		["qual ods possui MAIOR RISCO contábil?", ODS],
		["Qual Órgão Superior concentra mais?", ORGAO],
		["QUAL ÓRGÃO SUPERIOR TEM MAIS INCONSISTÊNCIAS?", ORGAO],
		["Qual UG apresenta maior risco contábil?", UG_RISCO],
		["Quais são as 10 UGs com mais inconsistências?", TOP10],
		["Quais UGs são as mais críticas?", TOP10],
		["Quantas UGs concentram 80% das inconsistências?", PARETO],
		["Qual a concentração do Pareto?", PARETO],
		["20% das UGs concentram quantos %?", PARETO_20],
		["O que tratar primeiro?", PRIORIDADE],
		["Qual a prioridade?", PRIORIDADE],
		["O que devo tratar?", PRIORIDADE],
		["Mostre o mapa de risco", MAPA],
		["Qual o panorama?", MAPA],
		["Qual questão RAC é mais recorrente?", RAC],
		["Qual questão RAC é a mais frequente?", RAC],
		["E a 120999?", STN],
		["Fale da STN", STN],
		["Por que o tratamento diferenciado?", STN],
		["Qual o papel da setorial contábil?", SETORIAL],
		["Qual a autoridade contábil?", SETORIAL],
		["Bom dia", FALLBACK],
	])("%s", (query, expected) => {
		expect(ask(query)).toBe(expected)
	})

	it("UG com maior saldo irregular ordena por valor sem mexer no top original", () => {
		expect(ask("Qual UG tem o maior saldo irregular?")).toBe(`A UG com o maior saldo irregular é a **UG 120039 (GAP-RJ)**, totalizando ${brl(900)}.`)
		expect(MANAGERIAL.topUgs[0].ug).toBe("120062")
	})

	it("sem o painel de decisão, Pareto e prioridade dão a resposta genérica", () => {
		expect(ask("20% das UGs concentram quanto?", null)).toBe(PARETO_SEM_DADO)
		expect(ask("O que tratar primeiro?", null)).toBe(PRIORIDADE_SEM_DADO)
	})

	it("a primeira regra que casa vence", () => {
		// "ods" + "maior risco" passa à frente de "ug" + "maior risco".
		expect(ask("Qual ODS e qual UG têm maior risco?")).toBe(ODS)
		// Pareto passa à frente de prioridade.
		expect(ask("Os 20% que concentram devem ser tratados primeiro?")).toBe(PARETO_20)
		// "ugs" sozinho, sem "mais críticas", não é o top 10.
		expect(ask("Quais UGs existem?")).toBe(FALLBACK)
		// "setoriais" não contém "setorial".
		expect(ask("Quem são as setoriais?")).toBe(FALLBACK)
	})

	it("com o painel consultado vazio, responde que não há inconsistência no recorte (o port lançava TypeError)", () => {
		const empty = "Não há inconsistências no recorte atual para responder a essa pergunta. Ajuste o filtro ou carregue outro relatório."
		const emptyManagerial = { ...MANAGERIAL, topUgs: [], topRacs: [] }
		const emptyEstrategico = { ...ESTRATEGICO, topOds: [], topOrgaosSuperiores: [] }
		const emptyDecisao = { ...DECISAO, pareto: { ...DECISAO.pareto, totalUgs: 0, ugPercentage: 0, issuePercentage: 0, topUgs: [] }, priorities: [] }
		const questions = [
			"Qual ODS tem maior risco?",
			"Qual órgão superior concentra mais?",
			"Qual UG tem maior risco?",
			"Qual UG tem o maior saldo irregular?",
			"Quais as 10 UGs?",
			"20% das UGs concentram quanto?",
			"O que tratar primeiro?",
			"Mostre o mapa de risco",
			"Qual questão RAC mais recorrente?",
		]
		for (const question of questions) {
			expect(answerChatQuery(question, emptyManagerial, emptyEstrategico, emptyDecisao)).toBe(empty)
		}
	})
})
