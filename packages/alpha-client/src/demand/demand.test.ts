import { describe, expect, test } from "bun:test"
import {
	buildDocuments,
	checkDemand,
	DemandPayloadSchema,
	dependentQuotes,
	emptyDemand,
	formBlocks,
	frameProcurement,
	renderFillingGuide,
	summarizePrices,
} from "./index"
import type { DemandPayload } from "./schema"

const TODAY = new Date(2026, 8, 26)

/** As janelas do E-102, reduzidas a dois itens: o caso real que originou as regras. */
function windowsDemand(): DemandPayload {
	return DemandPayloadSchema.parse({
		requestingArea: "Escritório do IEFA em São José dos Campos",
		context: {
			problem: "Os 21 vãos de janela do prédio E-102 têm esquadrias antigas que não vedam chuva nem poeira e não permitem o fechamento seguro do laboratório.",
			affected: "Laboratório do IEFA-SJ, seus equipamentos e o efetivo que ocupa o prédio.",
			consequence: "Sem vedação, equipamentos e mobiliário ficam expostos à umidade e bens patrimoniais não podem ser guardados no imóvel.",
			trigger: "Cessão do prédio E-102 ao IEFA-SJ.",
			deadline: "2026-11-01",
			supervening: true,
			priority: "alta",
			priorityReason: "Ocupação do laboratório prevista para o fim do exercício.",
		},
		objectives: [
			{
				id: "f1",
				text: "Proteger equipamentos e bens do laboratório",
				kind: "fundamental",
				why: "É o patrimônio que sustenta a pesquisa",
				attribute: { name: "vãos com vedação e fechamento seguro", kind: "natural", baseline: "0 de 21", target: "21 de 21" },
			},
			{ id: "m1", text: "Janelas com vedação contra chuva e poeira", kind: "means", supports: ["f1"] },
		],
		alternatives: [
			{ id: "a1", name: "Aquisição de janelas sob medida", kind: "contratar", ratings: { f1: "atende" }, notes: "" },
			{
				id: "a2",
				name: "Recuperação das esquadrias existentes",
				kind: "meios_proprios",
				ratings: { f1: "parcial" },
				notes: "Perfis corroídos, sem reposição de peças.",
			},
			{
				id: "a3",
				name: "Ata de registro de preços vigente",
				kind: "ata_vigente",
				ratings: { f1: "nao_atende" },
				notes: "A ata do Pregão SRP 527/2026 não tem esquadria sob medida.",
			},
		],
		chosenAlternativeId: "a1",
		choiceRationale: "Única alternativa que veda todos os vãos com garantia de fabricante.",
		solution: {
			nature: "bem",
			object: "Aquisição de 21 janelas de alumínio maxim-ar sob medida, com contramarcos, para o prédio E-102 do IEFA-SJ, no DCTA.",
			description: "Janelas fabricadas sob medida a partir da medição dos vãos pelo fornecedor, com vidro temperado de 6 mm.",
			requirements: [{ id: "r1", text: "Vidro temperado incolor de 6 mm", kind: "tecnico", objectiveId: "m1" }],
			exclusions: [{ id: "x1", text: "Instalação das janelas", reason: "o projeto arquitetônico ainda será elaborado" }],
			deliveryPlace: "Prédio E-102, campus do DCTA, São José dos Campos/SP",
			deliveryDays: 60,
			warrantyMonths: 12,
		},
		items: [
			{
				id: "i1",
				description: "Janela maxim-ar, 3 folhas, 2.780 x 970 mm",
				catalogKind: "CATMAT",
				catalogCode: "610629",
				unit: "UN",
				quantity: 3,
				quantityRationale: "Vãos do padrão P1 medidos no levantamento.",
				expenseNature: "3.3.90.30.24",
			},
			{
				id: "i2",
				description: "Janela maxim-ar, 1 folha, 1.000 x 1.000 mm",
				catalogKind: "CATMAT",
				catalogCode: "610610",
				unit: "UN",
				quantity: 18,
				quantityRationale: "Vãos dos padrões P2 a P8.",
				expenseNature: "3.3.90.30.24",
			},
		],
		quotes: [
			{ id: "q1", supplier: "Luganno", supplierDocument: "11111111000111", date: "2026-09-20", validUntil: "2026-10-20", prices: { i1: 4000, i2: 1500 } },
			{ id: "q2", supplier: "YSA", supplierDocument: "22222222000122", date: "2026-09-21", validUntil: "2026-10-21", prices: { i1: 4200, i2: 1600 } },
			{ id: "q3", supplier: "Styllus", supplierDocument: "33333333000133", date: "2026-09-22", validUntil: "2026-10-22", prices: { i1: 4100, i2: 1550 } },
		],
		risks: [
			{
				id: "k1",
				risk: "Janelas fabricadas fora das medidas dos vãos, sem encaixe no contramarco",
				cause: "Medição dos vãos feita sem conferência pela fiscalização",
				phase: "gestao",
				probability: 3,
				impact: 3,
				allocatedTo: "contratada",
				allocationDetail: "A medição é encargo da contratada; o refazimento corre por conta dela, sem revisão de preço.",
				damage: "Vãos sem vedação até a nova fabricação.",
				preventiveAction: "Conferir a medição com a fiscalização antes da fabricação, com termo assinado.",
				preventiveOwner: "Fiscal do contrato",
				contingencyAction: "Rejeitar e exigir nova fabricação em 30 dias; aplicar as sanções do TR.",
				contingencyOwner: "Gestor do contrato",
			},
		],
		planning: {
			nup: "67106.000123/2026-01",
			uasg: "120016",
			dfdNumber: "1076/2026",
			pcaId: "",
			sameNatureSpent: 0,
			environmentalImpacts: "Embalagens recolhidas pela contratada; perfis de alumínio recicláveis.",
			team: [
				{ id: "t1", name: "Fulano de Tal", position: "2º Ten Int", role: "requisitante" },
				{ id: "t2", name: "Beltrano", position: "Engenheiro", role: "tecnica" },
			],
		},
	})
}

describe("frameProcurement", () => {
	test("bem abaixo do limite do inciso II em 2026 é dispensa do art. 75, II", () => {
		const framing = frameProcurement(windowsDemand(), 50_946.28, TODAY)
		expect(framing.route).toBe("dispensa_75_II")
		expect(framing.trModel).toContain("Termo de Referência Compras Lei 14.133 (dezembro/2025)")
		expect(framing.trCategory).toBe("II - compra, inclusive por encomenda: Bens de consumo")
	})

	test("o já gasto no exercício soma no limite (art. 75, § 1º)", () => {
		const demand = windowsDemand()
		demand.planning.sameNatureSpent = 20_000
		expect(frameProcurement(demand, 50_946.28, TODAY).route).toBe("licitacao")
	})

	test("serviço de engenharia usa o inciso I", () => {
		const demand = windowsDemand()
		demand.solution.nature = "servico_engenharia"
		expect(frameProcurement(demand, 82_468.84, TODAY).route).toBe("dispensa_75_I")
	})

	test("exclusividade leva à inexigibilidade, qualquer que seja o valor", () => {
		const demand = windowsDemand()
		demand.solution.exclusivity = { isExclusive: true, supplier: "IH Ceramica", evidence: "Declaração do fabricante" }
		expect(frameProcurement(demand, 500_000, TODAY).route).toBe("inexigibilidade_74_I")
	})

	test("sem preço, o enquadramento por valor fica em aberto", () => {
		expect(frameProcurement(windowsDemand(), null, TODAY).route).toBeNull()
	})
})

describe("summarizePrices", () => {
	test("média quando o CV é baixo; total pela quantidade", () => {
		const prices = summarizePrices(windowsDemand())
		const first = prices.items[0]
		expect(first?.method).toBe("media")
		expect(first?.unitPrice).toBe(4100)
		expect(prices.total).toBe(4100 * 3 + 1550 * 18)
	})

	test("mediana quando o CV passa de 25%", () => {
		const demand = windowsDemand()
		const outlier = demand.quotes[2]
		if (outlier) outlier.prices.i1 = 12_000
		const first = summarizePrices(demand).items[0]
		expect(first?.method).toBe("mediana")
		expect(first?.unitPrice).toBe(4200)
	})

	test("cotação afastada não entra na conta", () => {
		const demand = windowsDemand()
		const excluded = demand.quotes[2]
		if (excluded) excluded.excludedReason = "Escopo diverso"
		expect(summarizePrices(demand).items[0]?.values).toEqual([4000, 4200])
	})

	test("mesma raiz de CNPJ ou mesmo domínio indicam cotações dependentes", () => {
		const demand = windowsDemand()
		const [a, b] = demand.quotes
		if (a && b) {
			a.contactEmail = "vendas@grupo.com.br"
			b.contactEmail = "orcamento@grupo.com.br"
		}
		expect(dependentQuotes(demand.quotes)).toHaveLength(1)
	})
})

describe("checkDemand", () => {
	test("demanda vazia bloqueia", () => {
		expect(checkDemand(emptyDemand(), TODAY).some((check) => check.severity === "bloqueia")).toBe(true)
	})

	test("a demanda das janelas não tem bloqueio", () => {
		const blocking = checkDemand(windowsDemand(), TODAY).filter((check) => check.severity === "bloqueia")
		expect(blocking).toEqual([])
	})

	test("travessão e frase que admite falha são apontados", () => {
		const demand = windowsDemand()
		demand.context.problem += " A medição foi feita com trena comum — sem conferência."
		const ids = checkDemand(demand, TODAY).map((check) => check.id)
		expect(ids.some((id) => id.startsWith("dash-contexto"))).toBe(true)
		expect(ids.some((id) => id.startsWith("admits-contexto"))).toBe(true)
	})

	test("proposta vencida é apontada e continua na conta até ser afastada", () => {
		const demand = windowsDemand()
		const quote = demand.quotes[0]
		if (quote) quote.validUntil = "2026-09-20"
		expect(checkDemand(demand, TODAY).some((check) => check.id === "expired-q1")).toBe(true)
		expect(summarizePrices(demand).items[0]?.values).toHaveLength(3)
	})

	test('"às pressas" com acento é apontado', () => {
		const demand = windowsDemand()
		demand.context.problem += " A medição foi feita às pressas."
		expect(checkDemand(demand, TODAY).some((check) => check.id.startsWith("admits-contexto"))).toBe(true)
	})

	test("ids das pendências são únicos", () => {
		const demand = windowsDemand()
		demand.solution.requirements.push(
			{ id: "r2", text: "Perfil reforçado — linha Suprema", kind: "tecnico", objectiveId: "m1" },
			{ id: "r3", text: "Fecho tipo punho — preto", kind: "tecnico", objectiveId: "m1" }
		)
		demand.risks.push({ ...demand.risks[0], id: "k3", risk: "Atraso na habilitação do fornecedor" } as DemandPayload["risks"][number])
		const ids = checkDemand(demand, TODAY).map((check) => check.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test("4.4.90.52 lembra a incorporabilidade", () => {
		const demand = windowsDemand()
		const item = demand.items[0]
		if (item) item.expenseNature = "4.4.90.52"
		expect(checkDemand(demand, TODAY).some((check) => check.id === "nd-incorp-i1")).toBe(true)
	})

	test("risco genérico e objetivo-meio solto são apontados", () => {
		const demand = windowsDemand()
		demand.risks.push({ ...demand.risks[0], id: "k2", risk: "Atraso na entrega" } as DemandPayload["risks"][number])
		demand.objectives.push({ ...demand.objectives[1], id: "m2", supports: [] } as DemandPayload["objectives"][number])
		const ids = checkDemand(demand, TODAY).map((check) => check.id)
		expect(ids).toContain("generic-k2")
		expect(ids).toContain("means-m2")
	})

	test("alternativa escolhida que não atende um objetivo fundamental", () => {
		const demand = windowsDemand()
		demand.chosenAlternativeId = "a3"
		expect(checkDemand(demand, TODAY).some((check) => check.id === "rating-no-f1")).toBe(true)
	})
})

/**
 * As janelas com quase tudo errado: dispara a maior parte das regras de uma vez. A lista
 * completa, na ordem, prende a ordem das seções e a numeração dos ids repetidos.
 */
function messyDemand(): DemandPayload {
	const demand = windowsDemand()
	demand.requestingArea = " "
	Object.assign(demand.context, { problem: "Janelas velhas.", consequence: "", deadline: "2026-01-10", trigger: "", priorityReason: "" })
	const [fundamental, means] = demand.objectives as [DemandPayload["objectives"][number], DemandPayload["objectives"][number]]
	fundamental.attribute.target = ""
	demand.objectives.push(
		{ ...fundamental, id: "f2", text: "Reduzir o consumo de energia", attribute: { ...fundamental.attribute, target: "10%" } },
		{ ...means, id: "m2", text: "Vidro com controle solar", supports: ["x"] }
	)
	const alternatives = demand.alternatives as Array<DemandPayload["alternatives"][number]>
	if (alternatives[2]) alternatives[2].notes = ""
	demand.choiceRationale = ""
	Object.assign(demand.solution, {
		object: `Aquisição de janelas ${"sob medida ".repeat(25)}`,
		deliveryPlace: "",
		sustainability: "",
		parcelamento: { decision: "grupo_unico", rationale: "" },
	})
	demand.solution.requirements.push(
		{ id: "r2", text: "Perfil reforçado — linha Suprema", kind: "tecnico", objectiveId: "m1" },
		{ id: "r3", text: "Fecho tipo punho – preto", kind: "tecnico", objectiveId: "m1" }
	)
	demand.solution.exclusions.push({ id: "x2", text: "Pintura", reason: "" })
	const [first, second] = demand.items as [DemandPayload["items"][number], DemandPayload["items"][number]]
	Object.assign(first, { quantity: 0, catalogCode: "", quantityRationale: "", expenseNature: "" })
	second.expenseNature = "3.3.90.39.17"
	demand.items.push({ ...second, id: "i3", expenseNature: "4.4.90.52" })
	const quotes = demand.quotes as Array<DemandPayload["quotes"][number]>
	if (quotes[0]) quotes[0].validUntil = "2026-09-01"
	if (quotes[1]) quotes[1].supplierDocument = "11111111000299"
	quotes.push({ ...(quotes[2] as DemandPayload["quotes"][number]), id: "q4", supplier: "", date: null, prices: { i1: 9000 } })
	const risk = demand.risks[0] as DemandPayload["risks"][number]
	risk.probability = 5
	demand.risks.push(
		{
			...risk,
			id: "k2",
			risk: "Atraso na habilitação do fornecedor",
			probability: null,
			preventiveOwner: "",
			allocationDetail: "",
			preventiveAction: "Responsável: fiscal — conferir",
		},
		{ ...risk, id: "k3", risk: "Acidente na obra às pressas", contingencyAction: "" }
	)
	Object.assign(demand.planning, { nup: "", environmentalImpacts: "", team: [{ id: "t1", name: "Fulano", position: "Ten", role: "requisitante" }] })
	return demand
}

describe("checkDemand: ordem completa das pendências", () => {
	test("demanda vazia", () => {
		expect(checkDemand(emptyDemand(), TODAY).map((check) => `${check.severity}:${check.step}:${check.id}`)).toEqual(EMPTY_IDS)
	})

	test("demanda com quase tudo errado", () => {
		expect(checkDemand(messyDemand(), TODAY).map((check) => `${check.severity}:${check.step}:${check.id}`)).toEqual(MESSY_IDS)
	})
})

const EMPTY_IDS = [
	"bloqueia:contexto:area",
	"bloqueia:contexto:problem",
	"atencao:contexto:consequence",
	"atencao:contexto:deadline",
	"bloqueia:objetivos:fundamental",
	"bloqueia:alternativas:alternatives",
	"bloqueia:alternativas:chosen",
	"bloqueia:alternativas:rationale",
	"dica:alternativas:ata",
	"bloqueia:solucao:nature",
	"bloqueia:solucao:object",
	"bloqueia:solucao:description",
	"atencao:solucao:requirements",
	"bloqueia:itens:items",
	"bloqueia:riscos:risks",
	"atencao:planejamento:team",
	"atencao:planejamento:pca",
	"dica:planejamento:nup",
	"atencao:planejamento:environment",
]

const MESSY_IDS = [
	"bloqueia:contexto:area",
	"bloqueia:contexto:problem",
	"atencao:contexto:consequence",
	"atencao:contexto:deadline-past",
	"atencao:contexto:supervening",
	"atencao:contexto:priority",
	"atencao:objetivos:attribute-f1",
	"atencao:objetivos:means-m2",
	"atencao:solucao:trace-f2",
	"bloqueia:alternativas:rationale",
	"atencao:alternativas:rating-f2",
	"atencao:alternativas:discarded-a3",
	"atencao:solucao:object-length",
	"atencao:solucao:exclusion-x2",
	"bloqueia:solucao:parcelamento",
	"atencao:solucao:delivery",
	"dica:solucao:tr-8-9",
	"bloqueia:itens:item-i1",
	"atencao:itens:catalog-i1",
	"atencao:itens:rationale-i1",
	"atencao:itens:nd-i1",
	"atencao:itens:nd-mismatch-i2",
	"dica:itens:nd-incorp-i3",
	"dica:precos:cv-i1",
	"bloqueia:precos:price-i3",
	"atencao:precos:expired-q1",
	"atencao:precos:dependent-q1-q2",
	"atencao:precos:dependent-q3-q4",
	"atencao:precos:quote-q4",
	"atencao:riscos:certain-k1",
	"bloqueia:riscos:scale-k2",
	"atencao:riscos:generic-k2",
	"atencao:riscos:generic-k2-2",
	"atencao:riscos:owners-k2",
	"atencao:riscos:owner-in-text-k2",
	"atencao:riscos:allocation-k2",
	"atencao:riscos:certain-k3",
	"atencao:riscos:generic-k3",
	"atencao:riscos:actions-k3",
	"dica:riscos:risk-contractor",
	"atencao:planejamento:team",
	"dica:planejamento:nup",
	"atencao:planejamento:environment",
	"dica:precos:same-nature",
	"dica:precos:me-epp",
	"atencao:solucao:dash-solucao-requisito",
	"atencao:solucao:dash-solucao-requisito-2",
	'atencao:riscos:dash-riscos-risco "Atraso na habilitação do fornecedor"',
	'atencao:riscos:admits-riscos-risco "Acidente na obra às pressas"-às pressas',
]

describe("buildDocuments", () => {
	const documents = buildDocuments(windowsDemand(), TODAY)
	const form = (id: string) => documents.forms.find((candidate) => candidate.id === id)
	const field = (formId: string, key: string) =>
		form(formId)
			?.sections.flatMap((section) => section.fields)
			.find((candidate) => candidate.key === key)

	test("gera as seis peças, ETP e TR marcados para a ACI", () => {
		expect(documents.forms.map((candidate) => candidate.id)).toEqual(["dfd", "etp", "mr", "tr", "memoria", "pesquisa"])
		expect(form("etp")?.alphaKind).toBe("ETP")
		expect(form("tr")?.alphaKind).toBe("TR")
	})

	test("o valor do ETP sai no formato da máscara do sistema", () => {
		expect(field("etp", "value-number")?.value).toBe("40200,00")
	})

	test("o ETP tem os 16 campos do ETP Digital", () => {
		const titles = form("etp")?.sections.map((section) => section.title) ?? []
		expect(titles).toHaveLength(16)
		expect(titles[0]).toBe("1. Informações Básicas")
		expect(titles[15]).toBe("16. Responsáveis")
	})

	test("objeto idêntico no DFD, no Mapa e no TR", () => {
		const object = windowsDemand().solution.object
		expect(field("dfd", "summary")?.value).toBe(object)
		expect(field("mr", "object")?.value).toBe(object)
		expect(field("tr", "general")?.value.startsWith(object)).toBe(true)
	})

	test("nenhuma peça gerada tem travessão", () => {
		const all = documents.forms.flatMap((candidate) => candidate.sections.flatMap((section) => section.fields.map((entry) => entry.value)))
		expect(all.some((value) => /[—–]/.test(value))).toBe(false)
	})

	test("sem instalação no objeto, o TR aponta o trecho fixo do recebimento", () => {
		expect(field("tr", "payment")?.note).toContain("instalação")
	})

	test("fato superveniente vai ao Acompanhamento do DFD", () => {
		expect(field("dfd", "followup")?.value).toContain("fato superveniente")
	})

	test("forma linear do ETP para o .docx", () => {
		const etp = form("etp")
		if (!etp) throw new Error("sem ETP")
		const blocks = formBlocks(etp, { object: "x", area: "y", nup: "z" })
		expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "ESTUDO TÉCNICO PRELIMINAR" })
		expect(blocks.some((block) => block.type === "table")).toBe(true)
	})
})

describe("renderFillingGuide", () => {
	test("escapa o texto da demanda e tem um Copiar por campo copiável", () => {
		const demand = windowsDemand()
		demand.context.problem = `<script>alert(1)</script> ${demand.context.problem}`
		const html = renderFillingGuide(demand, buildDocuments(demand, TODAY), checkDemand(demand, TODAY), { title: "Janelas", unit: "IEFA", generatedAt: TODAY })
		expect(html).not.toContain("<script>alert(1)</script>")
		expect(html).toContain("&lt;script&gt;")
		expect((html.match(/data-copy=/g) ?? []).length).toBeGreaterThan(30)
	})
})
