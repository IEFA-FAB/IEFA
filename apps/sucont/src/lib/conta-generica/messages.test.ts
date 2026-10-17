import { describe, expect, it } from "bun:test"
import type { GroupedData } from "#/lib/conta-generica/helpers"
import { buildOracleContext, generateMessage, generateSingleMessage, type MessageSettings } from "#/lib/conta-generica/messages"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"

const FUNDAMENTACAO = blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)
/** O `Intl` separa o símbolo do valor com espaço não separável. */
const brl = (value: string) => `R$ ${value}`

const SIGNATURE = [
	"Atenciosamente,",
	"",
	"Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)",
	"Subdiretoria de Contabilidade (SUCONT)",
	"Diretoria de Economia e Finanças da Aeronáutica (DIREF)",
].join("\n")

const ACTION_SEM_PRAZO =
	"Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem."
const ACTION_ALERTA_UG =
	"A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada e realize as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU)."
const ACTION_ALERTA_UGS =
	"A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada e realizem as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU)."
const DEADLINE_TEXT = "\nSolicitamos que as providências sejam adotadas até a data de 20/10/2026, a contar do recebimento desta mensagem.\n"

const settings = (over: Partial<MessageSettings> = {}): MessageSettings => ({
	messageType: "sem_prazo",
	deadline: "",
	msgNumber: "001",
	msgDate: "2026-03-05",
	...over,
})

describe("generateMessage", () => {
	const contas: GroupedData[string] = {
		"11199": [
			{ mes: "JAN", saldo: 1234.56 },
			{ mes: "FEV", saldo: -10 },
		],
	}

	const expected = (opts: { stnNote?: string; deadlineText?: string; action?: string; date?: string; contasText?: string }) =>
		[
			"Assunto: Identificação de Inconsistência Contábil",
			"",
			`Mensagem nº 001/SUCONT-3/${opts.date ?? "05MAR2026"}`,
			"",
			"Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência contábil por esta Unidade Gestora, apresentando saldo(s) diferente(s) de zero.",
			opts.stnNote ?? "",
			`Abaixo, detalhamos a(s) conta(s) e o(s) respectivo(s) saldo(s) identificado(s):${
				opts.contasText ??
				`\n- Conta Contábil: 11199\n  Conta Corrente / Mês: JAN | Valor Alongado / Saldo: ${brl("1.234,56")}\n  Conta Corrente / Mês: FEV | Valor Alongado / Saldo: -${brl("10,00")}\n`
			}${opts.deadlineText ?? ""}`,
			opts.action ?? ACTION_SEM_PRAZO,
			"",
			FUNDAMENTACAO,
			"",
			SIGNATURE,
		].join("\n")

	it("sem prazo", () => {
		expect(generateMessage("120001", contas, settings())).toBe(expected({}))
	})

	it("com prazo e data limite", () => {
		expect(generateMessage("120001", contas, settings({ messageType: "prazo", deadline: "2026-10-20" }))).toBe(expected({ deadlineText: DEADLINE_TEXT }))
	})

	it("com prazo mas sem data limite: sem a frase do prazo", () => {
		expect(generateMessage("120001", contas, settings({ messageType: "prazo" }))).toBe(expected({}))
	})

	it("data limite preenchida não vale fora do tipo com prazo", () => {
		expect(generateMessage("120001", contas, settings({ deadline: "2026-10-20" }))).toBe(expected({}))
	})

	it("alerta", () => {
		expect(generateMessage("120001", contas, settings({ messageType: "alerta" }))).toBe(expected({ action: ACTION_ALERTA_UG }))
	})

	it("UG 120999 leva a nota da STN", () => {
		expect(generateMessage("120999", contas, settings())).toBe(
			expected({
				stnNote:
					"\nNOTA: Esta Unidade Gestora (120999 - MAER - DIF. CAMBIAL) possui tratamento diferenciado por ser de uso exclusivo da Secretaria do Tesouro Nacional (STN).\n",
			})
		)
	})

	it("sem data da mensagem usa o marcador XXXMÊSANO", () => {
		expect(generateMessage("120001", contas, settings({ msgDate: "" }))).toBe(expected({ date: "XXXMÊSANO" }))
	})

	it("agrupa por questão RAC: a 29 sai antes da XX e cada grupo abre com linha em branco", () => {
		const mixed: GroupedData[string] = {
			A99: [{ mes: "MAR", saldo: 1 }],
			"11A99": [{ mes: "ABR", saldo: 2 }],
			"09999": [{ mes: "MAI", saldo: 3 }],
		}
		const contasText = [
			"",
			"- Conta Contábil: 11A99",
			`  Conta Corrente / Mês: ABR | Valor Alongado / Saldo: ${brl("2,00")}`,
			"",
			"- Conta Contábil: A99",
			`  Conta Corrente / Mês: MAR | Valor Alongado / Saldo: ${brl("1,00")}`,
			"- Conta Contábil: 09999",
			`  Conta Corrente / Mês: MAI | Valor Alongado / Saldo: ${brl("3,00")}`,
			"",
		].join("\n")
		expect(generateMessage("120001", mixed, settings())).toBe(expected({ contasText }))
	})
})

describe("generateSingleMessage", () => {
	// 120001 e 120004: 1S ELIANA · 120006: 1T JEFFERSON LUÍS.
	const result: GroupedData = {
		"120006": { "21299": [{ mes: "MAR", saldo: 5 }] },
		"120001": {
			"11199": [
				{ mes: "JAN", saldo: 1 },
				{ mes: "FEV", saldo: 2 },
			],
			"31199": [{ mes: "JAN", saldo: 3 }],
		},
		"120004": { "11199": [{ mes: "ABR", saldo: 4 }] },
	}

	const head = [
		"Assunto: Identificação de Inconsistências Contábeis",
		"",
		"Mensagem nº 001/SUCONT-3/05MAR2026",
		"",
		"Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências apresentando saldo(s) diferente(s) de zero.",
		"",
		"Abaixo, detalhamos as inconsistências identificadas por Unidade Gestora:",
		"",
		"",
	].join("\n")

	const ug120001 = [
		"UG: GABAER (120001)",
		"- Conta Contábil: 11199",
		`  Conta Corrente / Mês: JAN | Valor Alongado / Saldo: ${brl("1,00")}`,
		`  Conta Corrente / Mês: FEV | Valor Alongado / Saldo: ${brl("2,00")}`,
		"- Conta Contábil: 31199",
		`  Conta Corrente / Mês: JAN | Valor Alongado / Saldo: ${brl("3,00")}`,
		"",
		"",
	].join("\n")
	const ug120004 = ["UG: BABR (120004)", "- Conta Contábil: 11199", `  Conta Corrente / Mês: ABR | Valor Alongado / Saldo: ${brl("4,00")}`, "", ""].join("\n")
	const ug120006 = ["UG: GAP-BR (120006)", "- Conta Contábil: 21299", `  Conta Corrente / Mês: MAR | Valor Alongado / Saldo: ${brl("5,00")}`, "", ""].join("\n")

	const tail = (deadlineText: string, action: string) => `${deadlineText}\n${action}\n\n${FUNDAMENTACAO}\n\n${SIGNATURE}`

	it("todas as UGs, em ordem de código, sem prazo", () => {
		expect(generateSingleMessage(result, null, settings())).toBe(head + ug120001 + ug120004 + ug120006 + tail("", ACTION_SEM_PRAZO))
	})

	it("filtra pelo conferente", () => {
		expect(generateSingleMessage(result, "1S ELIANA", settings())).toBe(head + ug120001 + ug120004 + tail("", ACTION_SEM_PRAZO))
	})

	it("com prazo e data limite; alerta", () => {
		expect(generateSingleMessage(result, "1T JEFFERSON LUÍS", settings({ messageType: "prazo", deadline: "2026-10-20" }))).toBe(
			head + ug120006 + tail(DEADLINE_TEXT, ACTION_SEM_PRAZO)
		)
		expect(generateSingleMessage(result, "1T JEFFERSON LUÍS", settings({ messageType: "alerta" }))).toBe(head + ug120006 + tail("", ACTION_ALERTA_UGS))
	})

	it("sem resultado: só cabeçalho e fecho", () => {
		expect(generateSingleMessage(null, null, settings({ msgDate: "" }))).toBe(head.replace("05MAR2026", "XXXMÊSANO") + tail("", ACTION_SEM_PRAZO))
	})
})

describe("buildOracleContext", () => {
	it("resume a análise para o oráculo", () => {
		const context = buildOracleContext({
			totalFinancialImpact: 1183,
			odsRiskMap: [
				{ ods: "SEFA", count: 5, volume: 21, percentage: 50 },
				{ ods: "GABAER", count: 3, volume: 160, percentage: 30 },
			],
			criticalSummary: { ods: "SEFA", os: "DIRAD", ugCount: "120006", ugVolume: "888888" },
			paretoData: {
				ugPercentage: 60,
				inconsistencyPercentage: 80,
				topUgs: [
					{ ug: "120006", count: 4, volume: 20, ods: "SEFA", os: "DIRAD" },
					{ ug: "120001", count: 3, volume: 160, ods: "GABAER", os: "GABAER" },
					{ ug: "120004", count: 1, volume: 1000, ods: "COMPREP", os: "VI COMAR" },
				],
			},
			priorityList: [
				{ ug: "120004", count: 1, volume: 1000, ods: "COMPREP", os: "VI COMAR", priorityScore: 63 },
				{ ug: "120006", count: 4, volume: 20, ods: "SEFA", os: "DIRAD", priorityScore: 51 },
			],
		})
		expect(context).toBe(
			[
				"Dados da análise atual:",
				`- Impacto Financeiro Total em Risco: ${brl("1.183,00")}`,
				"- Total de inconsistências: 8",
				"- ODS mais crítico: SEFA",
				"- Órgão Superior mais crítico: DIRAD",
				"- UG com mais inconsistências: 120006 (GAP-BR)",
				"- UG com maior volume irregular: 888888 (NÃO IDENTIFICADA)",
				"- Análise de Pareto: 60% das UGs (3 UGs) concentram 80% das inconsistências.",
				"",
				"Mapa de Risco por ODS:",
				`- SEFA: 5 inconsistências (50%), Volume: ${brl("21,00")}`,
				`- GABAER: 3 inconsistências (30%), Volume: ${brl("160,00")}`,
				"",
				"Prioridades de Atuação:",
				"1º: UG 120004 (BABR) - Score: 63",
				"2º: UG 120006 (GAP-BR) - Score: 51",
			].join("\n")
		)
	})

	it("antes da análise avançada: campos saem como undefined, Pareto sem dados e listas vazias", () => {
		const context = buildOracleContext({ totalFinancialImpact: 0, odsRiskMap: [], criticalSummary: null, paretoData: null, priorityList: [] })
		expect(context).toBe(
			[
				"Dados da análise atual:",
				`- Impacto Financeiro Total em Risco: ${brl("0,00")}`,
				"- Total de inconsistências: 0",
				"- ODS mais crítico: undefined",
				"- Órgão Superior mais crítico: undefined",
				"- UG com mais inconsistências: undefined (NÃO IDENTIFICADA)",
				"- UG com maior volume irregular: undefined (NÃO IDENTIFICADA)",
				"- Análise de Pareto: sem dados.",
				"",
				"Mapa de Risco por ODS:",
				"",
				"",
				"Prioridades de Atuação:",
			].join("\n")
		)
	})
})
