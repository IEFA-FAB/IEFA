/**
 * As peças da fase preparatória, geradas da demanda estruturada, campo a campo e na ordem dos
 * formulários do Compras.gov.br (conferidos nas telas do sistema em 2026-09-26).
 *
 * Tudo sai da mesma fonte, então objeto, valores, quantidades e itens são idênticos em DFD,
 * ETP, Mapa de Riscos e TR por construção: é a verificação cruzada que no processo das janelas
 * foi feita à mão, peça contra peça.
 *
 * O texto é de versão final: sem instrução de preenchimento dentro da peça, sem travessão,
 * sem remissão a número de item do TR (o sistema renumera). O que depende de dado que ainda
 * não existe sai como `[PREENCHER: o quê]`; a orientação vai em `note`, que o guia mostra ao
 * lado do campo e nunca dentro dele.
 */

import { type Framing, formatBRL, formatSystemNumber, frameProcurement } from "./framing"
import { type PriceSummary, QUOTE_SOURCE_LABEL, summarizePrices } from "./prices"
import type { DemandPayload, Nature, Objective, Rating, Risk, RiskPhase, TeamRole } from "./schema"

export type FieldKind = "texto" | "texto_rico" | "numero" | "data" | "selecao" | "tabela" | "radio" | "manter"

export interface FieldTable {
	columns: string[]
	rows: string[][]
}

export interface FormField {
	key: string
	/** Nome do campo como aparece no sistema. */
	label: string
	kind: FieldKind
	/** Parágrafos separados por linha em branco; listas com alíneas "a) ". */
	value: string
	table?: FieldTable
	maxLength?: number
	/** Orientação para quem cola: fica ao lado do campo, nunca dentro dele. */
	note?: string
}

export interface FormSection {
	title: string
	fields: FormField[]
}

export type DocumentId = "dfd" | "etp" | "mr" | "tr" | "memoria" | "pesquisa"

export interface SystemForm {
	id: DocumentId
	title: string
	/** Onde se preenche: módulo do sistema ou autos do processo. */
	system: string
	/** Caminho de navegação até o formulário. */
	path: string
	/** Cuidados antes de começar a colar. */
	tips: string[]
	sections: FormSection[]
	/** Tipo de documento no α, para as peças que vão à conferência da ACI. */
	alphaKind?: "ETP" | "TR"
}

export interface DemandDocuments {
	framing: Framing
	prices: PriceSummary
	forms: SystemForm[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação
// ─────────────────────────────────────────────────────────────────────────────

export function pending(what: string): string {
	return `[PREENCHER: ${what}]`
}

function or(value: string | null | undefined, what: string): string {
	const trimmed = value?.trim()
	return trimmed ? trimmed : pending(what)
}

function formatDate(iso: string | null): string | null {
	if (!iso) return null
	const [year, month, day] = iso.split("-")
	return `${day}/${month}/${year}`
}

const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatQuantity(value: number | null): string {
	return value === null ? pending("quantidade") : NUMBER.format(value)
}

function formatMoney(value: number | null): string {
	return value === null ? pending("valor") : DECIMAL.format(value)
}

function formatCnpj(digits: string): string {
	if (digits.length !== 14) return digits
	return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz"

function letter(index: number): string {
	return index < LETTERS.length ? (LETTERS[index] as string) : `${LETTERS[Math.floor(index / LETTERS.length) - 1]}${LETTERS[index % LETTERS.length]}`
}

/** Lista com alíneas: "a) …;" com ponto final no último. */
function alineas(entries: string[]): string {
	return entries
		.map((entry, index) => {
			const clean = entry.trim().replace(/[.;]+$/, "")
			return `${letter(index)}) ${clean}${index === entries.length - 1 ? "." : ";"}`
		})
		.join("\n")
}

function paragraphs(...parts: Array<string | null | undefined | false>): string {
	return parts
		.filter((part): part is string => typeof part === "string" && part.trim() !== "")
		.map((part) => part.trim())
		.join("\n\n")
}

/** Primeira letra minúscula, para encaixar o objeto no meio da frase. */
function lowerFirst(value: string): string {
	return value ? value.charAt(0).toLocaleLowerCase("pt-BR") + value.slice(1) : value
}

function sentence(value: string): string {
	const trimmed = value.trim()
	return /[.!?:]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const NATURE_LABEL: Record<Nature, string> = {
	bem: "aquisição de bens",
	servico: "prestação de serviço",
	servico_engenharia: "serviço comum de engenharia",
	obra: "obra",
	tic: "solução de tecnologia da informação e comunicação",
}

const PHASE_LABEL: Record<RiskPhase, string> = {
	planejamento: "Planejamento da Contratação",
	selecao: "Seleção do Fornecedor",
	gestao: "Gestão do Contrato",
}

const RATING_VERB: Record<Rating, string> = {
	atende: "atende",
	parcial: "atende parcialmente",
	nao_atende: "não atende",
}

const ROLE_LABEL: Record<TeamRole, string> = {
	requisitante: "Área requisitante",
	tecnica: "Área técnica",
	planejamento: "Equipe de planejamento",
	fiscal: "Fiscal do contrato",
	gestor: "Gestor do contrato",
}

const PRIORITY_LABEL = { baixa: "Baixa", media: "Média", alta: "Alta" } as const

function objectiveLabel(objective: Objective): string {
	return objective.text.trim().replace(/[.;]+$/, "")
}

function expenseNatures(demand: DemandPayload): string[] {
	return [...new Set(demand.items.map((item) => item.expenseNature).filter(Boolean))]
}

function riskLevel(risk: Risk): number {
	return (risk.probability ?? 0) * (risk.impact ?? 0)
}

/** Riscos do maior nível para o menor, como o mapa se lê. */
export function sortedRisks(demand: DemandPayload): Risk[] {
	return demand.risks.filter((risk) => risk.risk.trim()).sort((a, b) => riskLevel(b) - riskLevel(a))
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos reaproveitados entre peças
// ─────────────────────────────────────────────────────────────────────────────

function itemsTable(demand: DemandPayload, prices: PriceSummary): FieldTable {
	return {
		columns: ["Item", "Catálogo", "Código", "Descrição", "Unidade", "Quantidade", "Valor unitário (R$)", "Valor total (R$)"],
		rows: demand.items.map((item, index) => {
			const summary = prices.items.find((candidate) => candidate.itemId === item.id)
			return [
				String(index + 1),
				item.catalogKind,
				item.catalogCode || pending("código"),
				or(item.description, "descrição"),
				or(item.unit, "unidade"),
				formatQuantity(item.quantity),
				formatMoney(summary?.unitPrice ?? null),
				formatMoney(summary?.total ?? null),
			]
		}),
	}
}

function totalSentence(prices: PriceSummary): string {
	return prices.total === null ? pending("valor estimado (pesquisa de preços)") : formatBRL(prices.total)
}

function pcaSentence(demand: DemandPayload, year: number): string {
	const { dfdNumber, pcaId } = demand.planning
	const dfd = dfdNumber.trim() ? `no DFD nº ${dfdNumber.trim()}` : `no ${pending("número do DFD")}`
	if (pcaId.trim()) return `A demanda foi formalizada ${dfd}, vinculado ao identificador ${pcaId.trim()} do Plano de Contratações Anual ${year}.`
	return `A demanda foi formalizada ${dfd}, vinculado ao Plano de Contratações Anual ${year} sob o ${pending("identificador da contratação no PCA")}.`
}

function exclusionsText(demand: DemandPayload): string | null {
	const exclusions = demand.solution.exclusions.filter((exclusion) => exclusion.text.trim())
	if (exclusions.length === 0) return null
	return paragraphs(
		"Não integram o objeto:",
		alineas(
			exclusions.map(
				(exclusion) =>
					`${exclusion.text.trim().replace(/[.;]+$/, "")}${exclusion.reason.trim() ? `, porque ${lowerFirst(exclusion.reason.trim().replace(/[.;]+$/, ""))}` : ""}`
			)
		)
	)
}

function requirementsText(demand: DemandPayload): string {
	const requirements = demand.solution.requirements.filter((requirement) => requirement.text.trim())
	return paragraphs(
		requirements.length > 0 ? alineas(requirements.map((requirement) => requirement.text)) : pending("requisitos da contratação"),
		demand.solution.sustainability.trim() ? `Critérios de sustentabilidade: ${sentence(lowerFirst(demand.solution.sustainability))}` : null
	)
}

function teamTable(demand: DemandPayload, roles?: readonly TeamRole[]): FieldTable {
	const members = demand.planning.team.filter((member) => member.name.trim() && (!roles || roles.includes(member.role)))
	return {
		columns: ["Nome", "Cargo/Função", "Papel"],
		rows:
			members.length > 0
				? members.map((member) => [member.name.trim(), or(member.position, "cargo"), ROLE_LABEL[member.role]])
				: [[pending("nome"), pending("cargo"), ""]],
	}
}

function memberOf(demand: DemandPayload, role: TeamRole): string | null {
	const member = demand.planning.team.find((candidate) => candidate.role === role && candidate.name.trim())
	return member ? `${member.name.trim()}${member.position.trim() ? `, ${member.position.trim()}` : ""}` : null
}

// ─────────────────────────────────────────────────────────────────────────────
// DFD (PGC)
// ─────────────────────────────────────────────────────────────────────────────

function buildDfd(demand: DemandPayload, framing: Framing, prices: PriceSummary): SystemForm {
	const { context, solution } = demand
	const natures = expenseNatures(demand)
	const deadline = formatDate(context.deadline)

	const priorityReason =
		context.priorityReason.trim() ||
		(deadline
			? `A contratação precisa estar concluída até ${deadline}${context.deadlineReason.trim() ? `, ${lowerFirst(context.deadlineReason.trim().replace(/[.;]+$/, ""))}` : ""}.`
			: "")

	const sections: FormSection[] = [
		{
			title: "1. Informações Gerais",
			fields: [
				{ key: "deadline", label: "Data da conclusão da Contratação", kind: "data", value: deadline ?? pending("data") },
				{
					key: "area",
					label: "Área Requisitante",
					kind: "selecao",
					value: or(demand.requestingArea, "área requisitante"),
					note: "Escolha na lista. Se a área não aparecer, peça o cadastro ao setor de planejamento da UASG.",
				},
				{ key: "uasg", label: "UASG Destino do DFD", kind: "selecao", value: or(demand.planning.uasg, "UASG") },
				{ key: "summary", label: "Descrição sucinta do objeto", kind: "texto", value: or(solution.object, "objeto"), maxLength: 200 },
				{ key: "priority", label: "Prioridade", kind: "selecao", value: PRIORITY_LABEL[context.priority] },
				{ key: "priority-reason", label: "Justificativa de Prioridade", kind: "texto", value: priorityReason || pending("justificativa da prioridade") },
			],
		},
		{
			title: "2. Justificativa de Necessidade",
			fields: [
				{
					key: "need",
					label: "Justificativa de Necessidade",
					kind: "texto_rico",
					value: paragraphs(
						or(context.problem, "descrição do problema"),
						context.affected,
						context.consequence,
						solution.object.trim() ? `A demanda consiste em ${sentence(lowerFirst(solution.object))}` : null,
						framing.route
							? `A contratação se dará por ${lowerFirst(framing.label)}, com valor estimado de ${totalSentence(prices)}${natures.length ? `, na natureza de despesa ${natures.join(", ")}` : ""}.`
							: null
					),
				},
			],
		},
		{
			title: "3. Materiais/Serviços",
			fields: [
				{
					key: "items",
					label: "Materiais/Serviços",
					kind: "tabela",
					value: "",
					table: itemsTable(demand, prices),
					note: "Adicionar e pesquisar pelo código. O sistema mostra a descrição do catálogo: confira se os atributos do código correspondem ao item (a especificação completa vai ao TR).",
				},
			],
		},
		{
			title: "4. Responsáveis",
			fields: [
				{
					key: "team",
					label: "Responsáveis",
					kind: "tabela",
					value: "",
					table: teamTable(demand, ["requisitante"]),
					note: "O sistema pede CPF, e-mail, cargo e despacho de cada responsável, e o torna editor do DFD. Tenha os dados em mãos.",
				},
			],
		},
	]

	if (context.supervening)
		sections.push({
			title: "5. Acompanhamento",
			fields: [
				{
					key: "followup",
					label: "Acompanhamento",
					kind: "texto",
					value: paragraphs("Essa contratação é fruto de fato superveniente, o qual impossibilitou o atendimento do prazo comum.", context.trigger),
					note: "Obrigatório quando o DFD é criado fora do prazo do PCA.",
				},
			],
		})

	return {
		id: "dfd",
		title: "Documento de Formalização da Demanda",
		system: "Compras.gov.br, Planejamento e Gerenciamento de Contratações (PGC)",
		path: "Área de Trabalho > Acesso Rápido > PGC > Criar (ou Criar > Formalização de Demandas (DFD))",
		tips: [
			"Criar gera número oficial na UASG: só clique quando for de fato registrar a demanda.",
			"O formulário salva sozinho ao trocar de seção. Não há botão Salvar.",
			"Ao terminar, use Enviar DFD. Depois do envio, o número do DFD vai para o ETP e para o TR.",
		],
		sections,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ETP Digital
// ─────────────────────────────────────────────────────────────────────────────

function alternativesText(demand: DemandPayload): string {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	const alternatives = demand.alternatives.filter((alternative) => alternative.name.trim())
	if (alternatives.length === 0) return pending("alternativas examinadas")

	const entries = alternatives.map((alternative) => {
		const evaluation = fundamentals
			.map((objective) => {
				const rating = alternative.ratings[objective.id]
				return rating ? `${RATING_VERB[rating]} ao objetivo de ${lowerFirst(objectiveLabel(objective))}` : null
			})
			.filter((part): part is string => part !== null)
		return [
			`${alternative.name.trim()}${alternative.description.trim() ? `: ${lowerFirst(alternative.description.trim().replace(/[.;]+$/, ""))}` : ""}`,
			evaluation.length ? `; ${evaluation.join("; ")}` : "",
			alternative.estimatedCost !== null ? `; custo aproximado de ${formatBRL(alternative.estimatedCost)}` : "",
			alternative.id !== demand.chosenAlternativeId && alternative.notes.trim()
				? `. Descartada: ${lowerFirst(alternative.notes.trim().replace(/[.;]+$/, ""))}`
				: "",
		].join("")
	})

	const chosen = alternatives.find((alternative) => alternative.id === demand.chosenAlternativeId)
	return paragraphs(
		"Foram examinadas as seguintes alternativas para atender à necessidade, avaliadas pelos objetivos da contratação:",
		alineas(entries),
		chosen
			? `A alternativa escolhida é ${lowerFirst(chosen.name.trim().replace(/[.;]+$/, ""))}. ${demand.choiceRationale.trim()}`
			: pending("alternativa escolhida e justificativa")
	)
}

function priceText(demand: DemandPayload, framing: Framing, prices: PriceSummary): string {
	const valid = demand.quotes.filter((quote) => !quote.excludedReason.trim())
	const excluded = demand.quotes.filter((quote) => quote.excludedReason.trim())
	const sources = [...new Set(valid.map((quote) => QUOTE_SOURCE_LABEL[quote.source]))]
	const usesMedian = prices.items.some((item) => item.method === "mediana")
	const methodSentence =
		demand.priceMethod === "auto"
			? `Adotou-se, por item, a média dos preços válidos${usesMedian ? " e, nos itens com coeficiente de variação superior a 25%, a mediana" : ""} (art. 6º da IN SEGES/ME nº 65/2021).`
			: demand.priceMethod === "mediana"
				? "Adotou-se, por item, a mediana dos preços válidos (art. 6º da IN SEGES/ME nº 65/2021)."
				: demand.priceMethod === "media"
					? "Adotou-se, por item, a média dos preços válidos (art. 6º da IN SEGES/ME nº 65/2021)."
					: "Adotou-se, por item, o menor dos preços válidos (art. 6º da IN SEGES/ME nº 65/2021)."

	return paragraphs(
		`O valor estimado da contratação é de ${totalSentence(prices)}, obtido por pesquisa de preços na forma da IN SEGES/ME nº 65/2021${sources.length ? `, com as seguintes fontes: ${sources.map(lowerFirst).join("; ")}` : ""}.`,
		methodSentence,
		framing.route === "inexigibilidade_74_I"
			? "Por se tratar de inexigibilidade, a justificativa do preço observa o art. 7º da IN SEGES/ME nº 65/2021, com notas fiscais ou contratos do próprio fornecedor com outros contratantes."
			: null,
		excluded.length
			? `Foram desconsideradas: ${excluded.map((quote) => `${quote.supplier.trim() || "cotação sem fornecedor"}, ${lowerFirst(quote.excludedReason.trim().replace(/[.;]+$/, ""))}`).join("; ")}.`
			: null,
		"O detalhamento das cotações consta do relatório da pesquisa de preços, juntado aos autos."
	)
}

function parcelamentoText(demand: DemandPayload): string {
	const { decision, rationale } = demand.solution.parcelamento
	const nature = demand.solution.nature
	const article = nature === "bem" ? "art. 40, V, b, e § 3º" : "art. 47"
	switch (decision) {
		case "por_item":
			return paragraphs(`A solução será contratada por item, o que amplia a competição, nos termos do ${article} da Lei nº 14.133/2021.`, rationale)
		case "grupo_unico":
			return paragraphs(
				`Os itens serão reunidos em grupo único, sem parcelamento, pelos motivos a seguir, nos termos do ${article} da Lei nº 14.133/2021 e da Súmula TCU nº 247.`,
				or(rationale, "motivo do grupo único")
			)
		case "item_unico":
			return paragraphs("O objeto é composto por item único, não havendo parcelamento a considerar.", rationale)
	}
}

function benefitsText(demand: DemandPayload): string {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	if (fundamentals.length === 0) return pending("resultados pretendidos")
	return paragraphs(
		"Com a contratação, pretende-se alcançar os seguintes resultados:",
		alineas(
			fundamentals.map((objective) => {
				const { name, baseline, target } = objective.attribute
				const measure = name.trim()
					? `, medido por ${lowerFirst(name.trim())}${baseline.trim() ? `, de ${baseline.trim()}` : ""}${target.trim() ? ` para ${target.trim()}` : ""}`
					: ""
				return `${objectiveLabel(objective)}${measure}`
			})
		)
	)
}

function viabilityText(demand: DemandPayload, framing: Framing): string {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	const chosen = demand.alternatives.find((alternative) => alternative.id === demand.chosenAlternativeId)
	return paragraphs(
		`Os estudos demonstram a necessidade da contratação${fundamentals.length ? `, a adequação da solução escolhida aos objetivos de ${fundamentals.map((objective) => lowerFirst(objectiveLabel(objective))).join(", ")}` : ""} e a compatibilidade do valor estimado com os preços de mercado.`,
		chosen
			? `A alternativa adotada, ${lowerFirst(chosen.name.trim().replace(/[.;]+$/, ""))}, é a que melhor atende a esses objetivos entre as examinadas.`
			: null,
		`Declara-se, portanto, a viabilidade da contratação${framing.route ? `, por ${lowerFirst(framing.label)}` : ""}.`
	)
}

function buildEtp(demand: DemandPayload, framing: Framing, prices: PriceSummary, year: number): SystemForm {
	const { context, solution, planning } = demand
	const related = planning.related.filter((entry) => entry.description.trim())
	const actions = planning.priorActions.filter((entry) => entry.action.trim())
	const requester = memberOf(demand, "requisitante")

	const field = (key: string, label: string, value: string, extra: Partial<FormField> = {}): FormSection => ({
		title: label,
		fields: [{ key, label, kind: "texto_rico", value, ...extra }],
	})

	return {
		id: "etp",
		title: "Estudo Técnico Preliminar",
		system: "Compras.gov.br, ETP Digital",
		path: "Área de Trabalho > Criar > ETP Digital (ou Artefatos Digitais > lista de ETP > Criar)",
		tips: [
			"Cada campo de texto salva sozinho. Depois de colar, clique fora e volte ao campo para conferir.",
			"O campo 8 tem um valor numérico com máscara: digite com vírgula decimal. Dígitos sem vírgula viram reais inteiros.",
			"Área requisitante e Responsáveis são tabelas com diálogo e pedem CPF.",
			"Não há campo para objeto nem para anexo: o objeto e a forma de contratação vão no campo 6; planilhas vão aos autos.",
			"Ao final, exporte o PDF pelo ícone de download e confira a diagramação.",
		],
		alphaKind: "ETP",
		sections: [
			{
				title: "1. Informações Básicas",
				fields: [
					{ key: "nup", label: "Número do processo", kind: "texto", value: or(planning.nup, "NUP") },
					{
						key: "contratacao",
						label: "Número da Contratação",
						kind: "selecao",
						value: pending("número da contratação no PGC"),
						note: "Escolha na lista a contratação a que o DFD foi vinculado.",
					},
				],
			},
			field(
				"need",
				"2. Descrição da necessidade",
				paragraphs(or(context.problem, "descrição do problema"), context.affected, context.consequence, context.trigger)
			),
			{
				title: "3. Área requisitante",
				fields: [
					{
						key: "area",
						label: "Área requisitante",
						kind: "tabela",
						value: "",
						table: {
							columns: ["Área Requisitante", "Responsável"],
							rows: [[or(demand.requestingArea, "área requisitante"), requester ?? pending("responsável")]],
						},
					},
				],
			},
			field("requirements", "4. Descrição dos Requisitos da Contratação", requirementsText(demand)),
			field("market", "5. Levantamento de Mercado", alternativesText(demand)),
			field(
				"solution",
				"6. Descrição da solução como um todo",
				paragraphs(
					solution.object.trim() ? `A solução consiste em ${sentence(lowerFirst(solution.object))}` : pending("objeto"),
					solution.description,
					exclusionsText(demand),
					framing.selection || null,
					"As condições de entrega, recebimento e garantia constam do Termo de Referência."
				)
			),
			{
				title: "7. Estimativa das Quantidades a serem Contratadas",
				fields: [
					{
						key: "quantities",
						label: "7. Estimativa das Quantidades a serem Contratadas",
						kind: "texto_rico",
						value: "As quantidades foram estimadas conforme a memória de cálculo a seguir.",
						table: {
							columns: ["Item", "Descrição", "Unidade", "Quantidade", "Memória de cálculo"],
							rows: demand.items.map((item, index) => [
								String(index + 1),
								or(item.description, "descrição"),
								or(item.unit, "unidade"),
								formatQuantity(item.quantity),
								or(item.quantityRationale, "memória de cálculo"),
							]),
						},
					},
				],
			},
			{
				title: "8. Estimativa do Valor da Contratação",
				fields: [
					{
						key: "value-number",
						label: "Valor (R$)",
						kind: "numero",
						value: prices.total === null ? pending("valor") : formatSystemNumber(prices.total),
						note: "Digite exatamente assim, com vírgula decimal e sem ponto de milhar.",
					},
					{
						key: "value-text",
						label: "8. Estimativa do Valor da Contratação",
						kind: "texto_rico",
						value: priceText(demand, framing, prices),
						table: itemsTable(demand, prices),
					},
				],
			},
			field("parcelamento", "9. Justificativa para o Parcelamento ou não da Solução", parcelamentoText(demand)),
			field(
				"related",
				"10. Contratações Correlatas e/ou Interdependentes",
				related.length
					? alineas(related.map((entry) => `${entry.description.trim().replace(/[.;]+$/, "")} (contratação ${entry.relation})`))
					: "Não há contratações correlatas nem interdependentes."
			),
			field("planning", "11. Alinhamento entre a Contratação e o Planejamento", pcaSentence(demand, year)),
			field("benefits", "12. Benefícios a serem alcançados com a contratação", benefitsText(demand)),
			{
				title: "13. Providências a serem Adotadas",
				fields: [
					actions.length
						? {
								key: "actions",
								label: "13. Providências a serem Adotadas",
								kind: "texto_rico",
								value: "As providências a adotar pela Administração são as seguintes.",
								table: {
									columns: ["Providência", "Responsável", "Precede"],
									rows: actions.map((entry) => [entry.action.trim(), or(entry.owner, "responsável"), or(entry.precedes, "etapa")]),
								},
							}
						: {
								key: "actions",
								label: "13. Providências a serem Adotadas",
								kind: "texto_rico",
								value: "Não há providências a adotar pela Administração antes da contratação, além dos atos de instrução do processo.",
							},
				],
			},
			field("environment", "14. Possíveis Impactos Ambientais", or(planning.environmentalImpacts, "impactos ambientais do objeto e medidas de mitigação")),
			{
				title: "15. Declaração de Viabilidade",
				fields: [
					{ key: "viability", label: "Declaração de Viabilidade", kind: "radio", value: "Viável" },
					{ key: "viability-text", label: "15.1. Justificativa da Viabilidade", kind: "texto_rico", value: viabilityText(demand, framing) },
				],
			},
			{
				title: "16. Responsáveis",
				fields: [
					{
						key: "team",
						label: "Responsáveis",
						kind: "tabela",
						value: "",
						table: teamTable(demand, ["requisitante", "tecnica", "planejamento"]),
						note: "Elaboração conjunta da área requisitante e da área técnica (IN SEGES nº 58/2022, art. 8º). O sistema pede CPF, e-mail, cargo e despacho.",
					},
				],
			},
		],
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de Riscos
// ─────────────────────────────────────────────────────────────────────────────

function buildMr(demand: DemandPayload, framing: Framing): SystemForm {
	const risks = sortedRisks(demand)
	const direct = framing.route !== "inexigibilidade_74_I"
	const exclusiveSupplier = demand.solution.exclusivity.supplier.trim()

	return {
		id: "mr",
		title: "Mapa de Gerenciamento de Riscos",
		system: "Compras.gov.br, Gestão de Riscos",
		path: "Área de Trabalho > Acesso Rápido > Gestão de Riscos > Criar",
		tips: [
			"Criar gera número oficial na UASG.",
			'Item da Contratação só aceita número (1, 2…). Texto como "Grupo 1" faz o salvar falhar sem aviso.',
			direct
				? '"Contratada" exige CNPJ, que só existe depois da adjudicação: lance esses riscos após a seleção ou como "Administração", com a consequência contratual no detalhamento.'
				: `"Alocado para" a contratada leva a razão social e o CNPJ${exclusiveSupplier ? ` (${exclusiveSupplier})` : ""}.`,
			"Impactos, ação preventiva e ação de contingência são abas do cartão do risco, cada uma com Adicionar.",
			"O responsável de cada ação só lista quem está em Responsáveis, que pede CPF.",
		],
		sections: [
			{
				title: "Informações Básicas",
				fields: [
					{ key: "object", label: "Objeto", kind: "texto", value: or(demand.solution.object, "objeto") },
					{ key: "category", label: "Categoria", kind: "selecao", value: framing.artifactCategory || pending("categoria") },
				],
			},
			...risks.map(
				(risk, index): FormSection => ({
					title: `Risco ${index + 1}`,
					fields: [
						{ key: `risk-${risk.id}`, label: "Risco", kind: "texto", value: or(risk.risk, "risco") },
						{ key: `cause-${risk.id}`, label: "Causa do risco", kind: "texto", value: or(risk.cause, "causa") },
						{ key: `phase-${risk.id}`, label: "Relacionado à fase", kind: "selecao", value: PHASE_LABEL[risk.phase] },
						{ key: `p-${risk.id}`, label: "Probabilidade", kind: "numero", value: risk.probability === null ? pending("1 a 5") : String(risk.probability) },
						{ key: `i-${risk.id}`, label: "Impacto", kind: "numero", value: risk.impact === null ? pending("1 a 5") : String(risk.impact) },
						{
							key: `level-${risk.id}`,
							label: "Nível",
							kind: "manter",
							value: riskLevel(risk) ? String(riskLevel(risk)) : "",
							note: "Calculado pelo sistema (P × I). O valor aqui é só para conferência.",
						},
						{
							key: `allocated-${risk.id}`,
							label: "Alocado para",
							kind: "selecao",
							value: risk.allocatedTo === "administracao" ? "Administração" : !direct && exclusiveSupplier ? exclusiveSupplier : "Contratada",
						},
						{ key: `item-${risk.id}`, label: "Item da Contratação", kind: "numero", value: "1", note: "Número do item ou grupo a que o risco se refere." },
						{ key: `detail-${risk.id}`, label: "Detalhamento da Alocação", kind: "texto", value: or(risk.allocationDetail, "detalhamento da alocação") },
						{ key: `damage-${risk.id}`, label: "Impactos (Dano)", kind: "texto", value: or(risk.damage, "impactos") },
						{ key: `prev-${risk.id}`, label: "Ação preventiva", kind: "texto", value: or(risk.preventiveAction, "ação preventiva") },
						{ key: `prev-owner-${risk.id}`, label: "Responsável pela ação preventiva", kind: "selecao", value: or(risk.preventiveOwner, "responsável") },
						{ key: `cont-${risk.id}`, label: "Ação de contingência", kind: "texto", value: or(risk.contingencyAction, "ação de contingência") },
						{ key: `cont-owner-${risk.id}`, label: "Responsável pela ação de contingência", kind: "selecao", value: or(risk.contingencyOwner, "responsável") },
					],
				})
			),
		],
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Termo de Referência (minuta da AGU no sistema)
// ─────────────────────────────────────────────────────────────────────────────

function buildTr(demand: DemandPayload, framing: Framing, prices: PriceSummary, year: number): SystemForm {
	const { solution, planning } = demand
	const natures = expenseNatures(demand)
	const excludesInstallation = solution.exclusions.some((exclusion) => /instala/i.test(exclusion.text))
	const gestor = memberOf(demand, "gestor")
	const fiscal = memberOf(demand, "fiscal")
	const budget = planning.budget

	const editable = (key: string, title: string, value: string, note?: string, table?: FieldTable): FormSection => ({
		title,
		fields: [
			{
				key,
				label: title,
				kind: "texto_rico",
				value,
				table,
				note: note ?? "Substitui os trechos em vermelho da seção. O texto preto do modelo não se altera.",
			},
		],
	})

	const keep = (key: string, title: string, note: string): FormSection => ({
		title,
		fields: [{ key, label: title, kind: "manter", value: "", note }],
	})

	const itemLines = demand.items.map((item, index) => {
		const summary = prices.items.find((candidate) => candidate.itemId === item.id)
		return `Item ${index + 1}: ${item.description.trim() || pending("descrição")}; ${item.catalogKind} ${item.catalogCode || pending("código")}; unidade ${item.unit.trim() || pending("unidade")}; quantidade ${formatQuantity(item.quantity)}; valor unitário R$ ${formatMoney(summary?.unitPrice ?? null)}; valor total R$ ${formatMoney(summary?.total ?? null)}`
	})

	return {
		id: "tr",
		title: "Termo de Referência",
		system: "Compras.gov.br, Artefatos Digitais",
		path: `Área de Trabalho > Criar > Artefato Digital > ${framing.trModel || pending("modelo de TR")}`,
		tips: [
			'Texto preto do modelo é fixo; só o vermelho (itálico) se edita. Onde o modelo oferece "OU", fique com uma opção e apague as demais.',
			'Bloco vermelho que não se aplica: "Não se aplica." quando o título da seção é obrigatório; excluir quando o bloco inteiro é opcional.',
			"Tabelas coladas no editor do sistema são instáveis: os itens seguem em alíneas.",
			"Não remeta a número de item do próprio TR: o sistema renumera ao excluir blocos.",
			"Ao final, exporte o PDF e confira página a página.",
		],
		alphaKind: "TR",
		sections: [
			{
				title: "Informações Básicas",
				fields: [
					{ key: "category", label: "Categoria", kind: "selecao", value: framing.trCategory || pending("categoria") },
					{
						key: "contratacao",
						label: "Número da Contratação",
						kind: "selecao",
						value: pending("número da contratação no PGC"),
						note: "Pesquisar e associar.",
					},
					{ key: "nup", label: "Processo Administrativo", kind: "texto", value: or(planning.nup, "NUP") },
				],
			},
			editable(
				"general",
				"1. CONDIÇÕES GERAIS DA CONTRATAÇÃO",
				paragraphs(or(solution.object, "objeto"), itemLines.length ? alineas(itemLines) : pending("itens")),
				"Objeto e tabela de itens em alíneas. Vigência: escolha a opção do modelo compatível com a entrega (por escopo, até o recebimento definitivo)."
			),
			editable("need", "2. FUNDAMENTAÇÃO E DESCRIÇÃO DA NECESSIDADE DA CONTRATAÇÃO", pcaSentence(demand, year)),
			editable(
				"solution",
				"3. DESCRIÇÃO DA SOLUÇÃO COMO UM TODO CONSIDERADO O CICLO DE VIDA DO OBJETO E ESPECIFICAÇÃO DO PRODUTO",
				paragraphs(solution.description || pending("descrição da solução"), exclusionsText(demand))
			),
			editable("requirements", "4. REQUISITOS DA CONTRATAÇÃO", requirementsText(demand)),
			editable(
				"execution",
				"5. MODELO DE EXECUÇÃO DO OBJETO",
				paragraphs(
					`O prazo de entrega é de ${solution.deliveryDays ?? pending("prazo em dias")} dias, contados do recebimento da nota de empenho ou da ordem de fornecimento.`,
					`Local de entrega: ${sentence(solution.deliveryPlace.trim() || pending("local de entrega"))}`,
					solution.warrantyMonths !== null
						? `O prazo de garantia é de ${solution.warrantyMonths} meses, contados do recebimento definitivo.`
						: `O prazo de garantia é de ${pending("meses")}, contados do recebimento definitivo.`
				)
			),
			editable(
				"management",
				"6. MODELO DE GESTÃO DO CONTRATO",
				paragraphs(`Gestor do contrato: ${gestor ?? pending("gestor")}.`, `Fiscal do contrato: ${fiscal ?? pending("fiscal")}.`),
				"Os nomes podem ser designados depois, por portaria; o trecho vermelho do modelo pede a indicação."
			),
			keep("sanctions", "7. INFRAÇÕES E SANÇÕES ADMINISTRATIVAS", "Manter o texto do modelo."),
			keep(
				"payment",
				"8. CRITÉRIOS DE MEDIÇÃO E DE PAGAMENTO",
				excludesInstallation
					? "Manter o modelo. Atenção: no modelo de compras, o recebimento traz em texto preto a montagem e a instalação a cargo do contratado. Sem instalação no objeto, registre nos autos a justificativa para a adaptação desse trecho."
					: "Manter o texto do modelo."
			),
			editable(
				"selection",
				"9. FORMA E CRITÉRIOS DE SELEÇÃO DO FORNECEDOR E FORMA DE FORNECIMENTO",
				framing.selection || pending("forma de seleção do fornecedor")
			),
			editable(
				"value",
				"10. ESTIMATIVAS DO VALOR DA CONTRATAÇÃO",
				`O custo estimado total da contratação é de ${totalSentence(prices)}, conforme custos unitários apostos nas condições gerais da contratação.`
			),
			editable(
				"budget",
				"11. ADEQUAÇÃO ORÇAMENTÁRIA",
				`As despesas decorrentes da presente contratação correrão à conta de recursos específicos consignados no Orçamento Geral da União, na natureza de despesa ${natures.length ? natures.join(", ") : pending("natureza de despesa")}${budget.fonte.trim() ? `, fonte ${budget.fonte.trim()}` : ""}${budget.ptres.trim() ? `, PTRES ${budget.ptres.trim()}` : ""}${budget.pi.trim() ? `, PI ${budget.pi.trim()}` : ""}${budget.acao.trim() ? `, ação ${budget.acao.trim()}` : ""}.`
			),
			keep("final", "12. DISPOSIÇÕES FINAIS", "Manter o texto do modelo."),
		],
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças dos autos
// ─────────────────────────────────────────────────────────────────────────────

function buildMemoria(demand: DemandPayload): SystemForm {
	return {
		id: "memoria",
		title: "Memória de Cálculo das Quantidades",
		system: "Autos do processo",
		path: "Juntar ao processo (SEI/NUP)",
		tips: ["Peça dos autos, citada no ETP (campo 7)."],
		sections: [
			{
				title: "Memória de cálculo",
				fields: [
					{
						key: "memoria",
						label: "Memória de cálculo",
						kind: "texto_rico",
						value: `Quantidades estimadas para ${sentence(lowerFirst(or(demand.solution.object, "objeto")))}`,
						table: {
							columns: ["Item", "Descrição", "Unidade", "Quantidade", "Memória de cálculo"],
							rows: demand.items.map((item, index) => [
								String(index + 1),
								or(item.description, "descrição"),
								or(item.unit, "unidade"),
								formatQuantity(item.quantity),
								or(item.quantityRationale, "memória de cálculo"),
							]),
						},
					},
				],
			},
		],
	}
}

function buildPesquisa(demand: DemandPayload, framing: Framing, prices: PriceSummary): SystemForm {
	const quotes = demand.quotes
	return {
		id: "pesquisa",
		title: "Relatório da Pesquisa de Preços",
		system: "Autos do processo",
		path: "Juntar ao processo (SEI/NUP), com as propostas e prints das fontes",
		tips: ["Peça dos autos (IN SEGES/ME nº 65/2021, art. 3º), citada no ETP (campo 8). Junte cada proposta e o registro de cada fonte."],
		sections: [
			{
				title: "Fontes consultadas",
				fields: [
					{
						key: "sources",
						label: "Fontes consultadas",
						kind: "tabela",
						value: priceText(demand, framing, prices),
						table: {
							columns: ["Fonte", "Fornecedor", "CNPJ", "Referência", "Data", "Validade", "Situação"],
							rows: quotes.map((quote) => [
								QUOTE_SOURCE_LABEL[quote.source],
								or(quote.supplier, "fornecedor"),
								quote.supplierDocument ? formatCnpj(quote.supplierDocument) : "",
								quote.reference.trim(),
								formatDate(quote.date) ?? pending("data"),
								formatDate(quote.validUntil) ?? "",
								quote.excludedReason.trim() ? `Desconsiderada: ${quote.excludedReason.trim()}` : "Válida",
							]),
						},
					},
				],
			},
			{
				title: "Preços por item",
				fields: [
					{
						key: "per-item",
						label: "Preços por item",
						kind: "tabela",
						value: "",
						table: {
							columns: ["Item", ...quotes.map((quote) => quote.supplier.trim() || "?"), "Média", "Mediana", "CV", "Critério", "Unitário adotado", "Total"],
							rows: demand.items.map((item, index) => {
								const summary = prices.items.find((candidate) => candidate.itemId === item.id)
								return [
									String(index + 1),
									...quotes.map((quote) => (typeof quote.prices[item.id] === "number" ? formatMoney(quote.prices[item.id] as number) : "")),
									formatMoney(summary?.mean ?? null),
									formatMoney(summary?.median ?? null),
									summary?.cv === null || summary?.cv === undefined ? "" : `${DECIMAL.format(summary.cv * 100)}%`,
									summary?.method ?? "",
									formatMoney(summary?.unitPrice ?? null),
									formatMoney(summary?.total ?? null),
								]
							}),
						},
					},
				],
			},
		],
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────────────

export function buildDocuments(demand: DemandPayload, today: Date = new Date()): DemandDocuments {
	const prices = summarizePrices(demand)
	const framing = frameProcurement(demand, prices.total, today)
	const year = today.getFullYear()
	return {
		framing,
		prices,
		forms: [
			buildDfd(demand, framing, prices),
			buildEtp(demand, framing, prices, year),
			buildMr(demand, framing),
			buildTr(demand, framing, prices, year),
			buildMemoria(demand),
			buildPesquisa(demand, framing, prices),
		],
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Forma linear, para o .docx que vai à ACI
// ─────────────────────────────────────────────────────────────────────────────

export type DocBlock =
	| { type: "heading"; level: 1 | 2 | 3; text: string }
	| { type: "paragraph"; text: string }
	| { type: "table"; columns: string[]; rows: string[][] }

/**
 * A peça como documento corrido: título, seções e campos, na ordem do sistema. É o que a ACI
 * recebe para extrair e conferir, com os mesmos textos do guia.
 */
export function formBlocks(form: SystemForm, header: { object: string; area: string; nup: string }): DocBlock[] {
	const blocks: DocBlock[] = [
		{ type: "heading", level: 1, text: form.title.toUpperCase() },
		{ type: "paragraph", text: `Objeto: ${header.object}` },
		{ type: "paragraph", text: `Área requisitante: ${header.area}` },
		{ type: "paragraph", text: `Processo: ${header.nup}` },
	]
	for (const section of form.sections) {
		blocks.push({ type: "heading", level: 2, text: section.title })
		for (const field of section.fields) {
			if (field.kind === "manter") continue
			if (section.fields.length > 1 || field.label !== section.title) blocks.push({ type: "heading", level: 3, text: field.label })
			for (const paragraph of field.value.split(/\n{2,}/)) {
				for (const line of paragraph.split("\n")) if (line.trim()) blocks.push({ type: "paragraph", text: line.trim() })
			}
			if (field.table) blocks.push({ type: "table", columns: field.table.columns, rows: field.table.rows })
		}
	}
	return blocks
}

/** Rótulo curto da natureza, para cabeçalhos. */
export function natureLabel(nature: Nature | null): string {
	return nature ? NATURE_LABEL[nature] : "natureza não definida"
}
