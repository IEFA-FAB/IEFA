/**
 * Conferências da demanda antes de ela virar peça.
 *
 * Três fontes de regra:
 *   - a estrutura do Value-Focused Thinking (objetivo fundamental com atributo, objetivo-meio
 *     ligado a um fundamental, mais de uma alternativa, escolha justificada pelos objetivos);
 *   - o que a Lei nº 14.133/2021 e as INs exigem do ETP, do mapa de riscos e da pesquisa;
 *   - as lições dos processos reais do IEFA-SJ (forno, janelas e cerca do E-102): cada
 *     conferência com `basis` "lição" nasceu de uma correção pedida em processo de verdade.
 *
 * `bloqueia` impede o envio à ACI; `atencao` vai ao guia e à ACI como pendência; `dica` é
 * orientação. A conferência não reescreve nada: aponta o passo e o campo.
 */

import { formatBRL, frameProcurement } from "./framing"
import { CV_THRESHOLD, dependentQuotes, expiredQuotes, MIN_QUOTES, summarizePrices } from "./prices"
import type { DemandPayload } from "./schema"

export const DEMAND_STEPS = ["contexto", "objetivos", "alternativas", "solucao", "itens", "precos", "riscos", "planejamento"] as const
export type DemandStep = (typeof DEMAND_STEPS)[number]

export const DEMAND_STEP_LABEL: Record<DemandStep, string> = {
	contexto: "Problema",
	objetivos: "Objetivos",
	alternativas: "Alternativas",
	solucao: "Solução",
	itens: "Itens e quantidades",
	precos: "Pesquisa de preços",
	riscos: "Riscos",
	planejamento: "Planejamento e equipe",
}

export type CheckSeverity = "bloqueia" | "atencao" | "dica"

export interface DemandCheck {
	id: string
	severity: CheckSeverity
	step: DemandStep
	message: string
	/** De onde vem a regra: dispositivo, método ou lição de processo real. */
	basis?: string
}

/** Descrição sucinta do objeto no DFD (PGC). */
export const DFD_SUMMARY_MAX = 200

const LESSON = "lição de processo real do IEFA-SJ"

/**
 * Trechos que admitem falha da Administração. Saíram das peças das janelas a pedido do
 * requisitante: o processo registra o que foi feito e decidido, não o que deu errado.
 */
const ADMITS_FAILURE: ReadonlyArray<[RegExp, string]> = [
	[/\btrena comum\b/i, "trena comum"],
	[/\btende a subestimar\b/i, "tende a subestimar"],
	[/\bpor (?:falha|erro|esquecimento|descuido)\b/i, "por falha/erro/esquecimento"],
	[/\bn[ãa]o foi (?:previst[oa]|planejad[oa]|feit[oa]) a tempo\b/i, "não foi previsto/planejado a tempo"],
	[/(?<![\p{L}\d])[àa]s pressas(?![\p{L}\d])/iu, "às pressas"],
	[/\bimproviso\b/i, "improviso"],
]

/** Riscos genéricos: o mapa curto os deixa como cláusula do TR. */
const GENERIC_RISKS: ReadonlyArray<[RegExp, string]> = [
	[/\batraso\b/i, "atraso (vai aos prazos e à multa moratória do TR)"],
	[/\bdesert[ao]|fracassad[ao]\b/i, "dispensa deserta ou fracassada (procedimento da IN SEGES/ME nº 67/2021)"],
	[/\bhabilita[çc][ãa]o\b/i, "irregularidade de habilitação (seção de habilitação do TR e SICAF)"],
	[/\bacidente\b/i, "acidente de trabalho ou dano a terceiros (cláusula de responsabilidade, art. 120)"],
]

/** Todo texto livre da demanda, com o passo em que ele é editado. */
function freeTexts(demand: DemandPayload): Array<{ step: DemandStep; where: string; value: string }> {
	const out: Array<{ step: DemandStep; where: string; value: string }> = []
	const push = (step: DemandStep, where: string, value: string) => {
		if (value.trim()) out.push({ step, where, value })
	}
	const { context, solution, planning } = demand
	push("contexto", "problema", context.problem)
	push("contexto", "quem é afetado", context.affected)
	push("contexto", "consequência", context.consequence)
	push("contexto", "o que motivou", context.trigger)
	push("contexto", "justificativa da prioridade", context.priorityReason)
	for (const objective of demand.objectives) push("objetivos", `objetivo "${objective.text.slice(0, 40)}"`, `${objective.text} ${objective.why}`)
	for (const alternative of demand.alternatives)
		push("alternativas", `alternativa "${alternative.name.slice(0, 40)}"`, `${alternative.description} ${alternative.notes}`)
	push("alternativas", "justificativa da escolha", demand.choiceRationale)
	push("solucao", "objeto", solution.object)
	push("solucao", "descrição da solução", solution.description)
	for (const requirement of solution.requirements) push("solucao", "requisito", requirement.text)
	for (const exclusion of solution.exclusions) push("solucao", "exclusão", `${exclusion.text} ${exclusion.reason}`)
	push("solucao", "parcelamento", solution.parcelamento.rationale)
	push("solucao", "sustentabilidade", solution.sustainability)
	for (const item of demand.items) push("itens", `item "${item.description.slice(0, 40)}"`, `${item.description} ${item.quantityRationale}`)
	for (const risk of demand.risks)
		push(
			"riscos",
			`risco "${risk.risk.slice(0, 40)}"`,
			[risk.risk, risk.cause, risk.allocationDetail, risk.damage, risk.preventiveAction, risk.contingencyAction].join(" ")
		)
	push("planejamento", "impactos ambientais", planning.environmentalImpacts)
	for (const action of planning.priorActions) push("planejamento", "providência", action.action)
	return out
}

/** Data local `YYYY-MM-DD`: em UTC, a noite de Brasília já seria o dia seguinte. */
export function todayIso(today: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0")
	return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

export function checkDemand(demand: DemandPayload, today: Date = new Date()): DemandCheck[] {
	const checks: DemandCheck[] = []
	// Ids únicos: viram chave de lista na tela, e o mesmo teste pode disparar duas vezes no
	// mesmo lugar (dois requisitos com travessão, um risco que casa com dois genéricos).
	const seen = new Map<string, number>()
	const add = (check: DemandCheck) => {
		const count = seen.get(check.id) ?? 0
		seen.set(check.id, count + 1)
		checks.push(count === 0 ? check : { ...check, id: `${check.id}-${count + 1}` })
	}
	const { context, solution, planning } = demand
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	const means = demand.objectives.filter((objective) => objective.kind === "means" && objective.text.trim())
	const prices = summarizePrices(demand)
	const framing = frameProcurement(demand, prices.total, today)

	// ── Problema ──────────────────────────────────────────────────────────────
	if (!demand.requestingArea.trim())
		add({ id: "area", severity: "bloqueia", step: "contexto", message: "Informe a área requisitante como ela aparece no sistema." })
	if (context.problem.trim().length < 40)
		add({
			id: "problem",
			severity: "bloqueia",
			step: "contexto",
			message: "Descreva o problema em fatos: o que falta ou falha hoje, onde e desde quando.",
			basis: "art. 18, § 1º, I, da Lei nº 14.133/2021",
		})
	if (!context.consequence.trim())
		add({
			id: "consequence",
			severity: "atencao",
			step: "contexto",
			message: "Diga o que acontece se nada for feito: é o que sustenta a necessidade e a prioridade.",
		})
	if (!context.deadline)
		add({ id: "deadline", severity: "atencao", step: "contexto", message: "Informe até quando a contratação precisa estar concluída (data do DFD)." })
	else if (context.deadline < todayIso(today)) add({ id: "deadline-past", severity: "atencao", step: "contexto", message: "A data de conclusão já passou." })
	if (context.supervening && !context.trigger.trim())
		add({
			id: "supervening",
			severity: "atencao",
			step: "contexto",
			message: "Fato superveniente: descreva o fato novo que tornou a demanda necessária agora.",
		})
	if (context.priority === "alta" && !context.priorityReason.trim())
		add({ id: "priority", severity: "atencao", step: "contexto", message: "Prioridade alta pede justificativa no DFD." })

	// ── Objetivos ─────────────────────────────────────────────────────────────
	if (fundamentals.length === 0)
		add({
			id: "fundamental",
			severity: "bloqueia",
			step: "objetivos",
			message: "Registre ao menos um objetivo fundamental: o que se quer de fato, e não o objeto a comprar.",
			basis: "Value-Focused Thinking; resultados pretendidos, art. 18, § 1º, IX",
		})
	if (fundamentals.length > 6)
		add({
			id: "fundamental-many",
			severity: "dica",
			step: "objetivos",
			message: `${fundamentals.length} objetivos fundamentais: pergunte "por que isso importa?" para cada um; os que respondem com outro objetivo são meio.`,
		})
	for (const objective of fundamentals) {
		if (!objective.attribute.name.trim() || !objective.attribute.target.trim())
			add({
				id: `attribute-${objective.id}`,
				severity: "atencao",
				step: "objetivos",
				message: `Objetivo "${objective.text.slice(0, 60)}": defina como medir o atendimento e a meta. Sem atributo, o benefício do ETP fica vago.`,
				basis: "Value-Focused Thinking (atributo do objetivo)",
			})
	}
	for (const objective of means) {
		const linked = objective.supports.filter((target) => fundamentals.some((fundamental) => fundamental.id === target))
		if (linked.length === 0)
			add({
				id: `means-${objective.id}`,
				severity: "atencao",
				step: "objetivos",
				message: `Objetivo-meio "${objective.text.slice(0, 60)}" não aponta o objetivo fundamental que sustenta.`,
				basis: "Value-Focused Thinking (rede meios-fins)",
			})
	}
	for (const fundamental of fundamentals) {
		const realizedByRequirement = solution.requirements.some((requirement) => requirement.objectiveId === fundamental.id)
		const realizedByMeans = means.some(
			(objective) => objective.supports.includes(fundamental.id) && solution.requirements.some((requirement) => requirement.objectiveId === objective.id)
		)
		if (solution.requirements.length > 0 && !realizedByRequirement && !realizedByMeans)
			add({
				id: `trace-${fundamental.id}`,
				severity: "atencao",
				step: "solucao",
				message: `Nenhum requisito realiza o objetivo "${fundamental.text.slice(0, 60)}". Ou falta requisito, ou o objetivo não é desta contratação.`,
				basis: "rastreabilidade objetivo → requisito (art. 18, § 1º, III)",
			})
	}

	// ── Alternativas ──────────────────────────────────────────────────────────
	const alternatives = demand.alternatives.filter((alternative) => alternative.name.trim())
	const chosen = alternatives.find((alternative) => alternative.id === demand.chosenAlternativeId) ?? null
	if (alternatives.length < 2)
		add({
			id: "alternatives",
			severity: "bloqueia",
			step: "alternativas",
			message: "Compare ao menos duas alternativas (contratar é uma; ata vigente, meios próprios ou não fazer também contam).",
			basis: "levantamento de mercado, art. 18, § 1º, V; IN SEGES nº 58/2022, art. 9º",
		})
	if (!chosen) add({ id: "chosen", severity: "bloqueia", step: "alternativas", message: "Marque a alternativa escolhida." })
	if (!demand.choiceRationale.trim())
		add({
			id: "rationale",
			severity: "bloqueia",
			step: "alternativas",
			message: "Justifique a escolha pelos objetivos: por que esta alternativa atende melhor.",
		})
	if (!alternatives.some((alternative) => alternative.kind === "ata_vigente"))
		add({
			id: "ata",
			severity: "dica",
			step: "alternativas",
			message: "Examine se há ata de registro de preços vigente (da UASG ou de outro órgão) que cubra o objeto, e registre o resultado como alternativa.",
			basis: LESSON,
		})
	if (chosen) {
		for (const fundamental of fundamentals) {
			const rating = chosen.ratings[fundamental.id]
			if (!rating)
				add({
					id: `rating-${fundamental.id}`,
					severity: "atencao",
					step: "alternativas",
					message: `Avalie a alternativa escolhida no objetivo "${fundamental.text.slice(0, 60)}".`,
				})
			else if (rating === "nao_atende")
				add({
					id: `rating-no-${fundamental.id}`,
					severity: "atencao",
					step: "alternativas",
					message: `A alternativa escolhida não atende o objetivo "${fundamental.text.slice(0, 60)}". Revise a escolha ou o objetivo.`,
				})
		}
	}
	for (const alternative of alternatives) {
		if (alternative.id !== demand.chosenAlternativeId && !alternative.notes.trim())
			add({
				id: `discarded-${alternative.id}`,
				severity: "atencao",
				step: "alternativas",
				message: `Registre por que a alternativa "${alternative.name.slice(0, 60)}" foi descartada.`,
			})
	}

	// ── Solução ───────────────────────────────────────────────────────────────
	if (!solution.nature)
		add({ id: "nature", severity: "bloqueia", step: "solucao", message: "Defina a natureza do objeto (bem, serviço, serviço de engenharia, obra ou TIC)." })
	if (!solution.object.trim()) add({ id: "object", severity: "bloqueia", step: "solucao", message: "Escreva o objeto em uma frase." })
	else if (solution.object.trim().length > DFD_SUMMARY_MAX)
		add({
			id: "object-length",
			severity: "atencao",
			step: "solucao",
			message: `O objeto tem ${solution.object.trim().length} caracteres; a descrição sucinta do DFD aceita ${DFD_SUMMARY_MAX}.`,
			basis: "limite do campo no PGC",
		})
	if (!solution.description.trim())
		add({ id: "description", severity: "bloqueia", step: "solucao", message: "Descreva a solução como um todo.", basis: "art. 18, § 1º, VII" })
	if (solution.requirements.length === 0)
		add({ id: "requirements", severity: "atencao", step: "solucao", message: "Liste os requisitos da contratação.", basis: "art. 18, § 1º, III" })
	for (const exclusion of solution.exclusions)
		if (exclusion.text.trim() && !exclusion.reason.trim())
			add({
				id: `exclusion-${exclusion.id}`,
				severity: "atencao",
				step: "solucao",
				message: `A exclusão "${exclusion.text.slice(0, 60)}" precisa do motivo, que vai ao ETP e ao TR.`,
				basis: LESSON,
			})
	if (solution.parcelamento.decision === "grupo_unico" && !solution.parcelamento.rationale.trim())
		add({
			id: "parcelamento",
			severity: "bloqueia",
			step: "solucao",
			message: "Grupo único afasta o parcelamento: justifique pelo art. 47, § 1º, e pela Súmula TCU nº 247.",
			basis: "art. 40, V, b, e art. 47 da Lei nº 14.133/2021",
		})
	if (solution.exclusivity.isExclusive && !solution.exclusivity.evidence.trim())
		add({
			id: "exclusivity",
			severity: "bloqueia",
			step: "solucao",
			message: "Inexigibilidade: descreva o documento que comprova a exclusividade.",
			basis: "art. 74, § 1º",
		})
	if (solution.nature === "bem" && !solution.deliveryPlace.trim())
		add({ id: "delivery", severity: "atencao", step: "solucao", message: "Informe o local de entrega." })
	const excludesInstallation = solution.exclusions.some((exclusion) => /instala/i.test(exclusion.text))
	if (solution.nature === "bem" && excludesInstallation)
		add({
			id: "tr-8-9",
			severity: "dica",
			step: "solucao",
			message:
				"Aquisição sem instalação: o modelo de TR de compras traz, em texto fixo, montagem e instalação a cargo do contratado no recebimento. O guia aponta o trecho para justificativa nos autos.",
			basis: LESSON,
		})

	// ── Itens ─────────────────────────────────────────────────────────────────
	if (demand.items.length === 0) add({ id: "items", severity: "bloqueia", step: "itens", message: "Inclua os itens da contratação." })
	demand.items.forEach((item, index) => {
		const label = `Item ${index + 1}`
		if (!item.description.trim() || !item.unit.trim() || item.quantity === null || item.quantity <= 0)
			add({ id: `item-${item.id}`, severity: "bloqueia", step: "itens", message: `${label}: descrição, unidade e quantidade são obrigatórias.` })
		if (!item.catalogCode)
			add({
				id: `catalog-${item.id}`,
				severity: "atencao",
				step: "itens",
				message: `${label}: informe o código ${item.catalogKind} do catálogo do Compras.gov.br.`,
			})
		if (!item.quantityRationale.trim())
			add({
				id: `rationale-${item.id}`,
				severity: "atencao",
				step: "itens",
				message: `${label}: registre a memória de cálculo da quantidade.`,
				basis: "art. 18, § 1º, IV",
			})
		if (!item.expenseNature) add({ id: `nd-${item.id}`, severity: "atencao", step: "itens", message: `${label}: informe a natureza de despesa.` })
		else if (item.expenseNature.startsWith("4.4.90.52"))
			add({
				id: `nd-incorp-${item.id}`,
				severity: "dica",
				step: "itens",
				message: `${label}: 4.4.90.52 é material permanente. Se o bem será incorporado ao imóvel (janela, porta, esquadria), a natureza é 3.3.90.30.24; confira o vínculo PDM × ND no catálogo.`,
				basis: "Portaria STN nº 448/2002 (incorporabilidade); lição das janelas do E-102",
			})
		else if (solution.nature === "bem" && item.expenseNature.startsWith("3.3.90.39"))
			add({ id: `nd-mismatch-${item.id}`, severity: "atencao", step: "itens", message: `${label}: 3.3.90.39 é serviço, mas o objeto é bem.` })
		else if ((solution.nature === "servico" || solution.nature === "servico_engenharia") && item.expenseNature.startsWith("3.3.90.30"))
			add({ id: `nd-mismatch-${item.id}`, severity: "atencao", step: "itens", message: `${label}: 3.3.90.30 é material de consumo, mas o objeto é serviço.` })
	})

	// ── Preços ────────────────────────────────────────────────────────────────
	const isExclusive = solution.exclusivity.isExclusive
	for (const summary of prices.items) {
		const index = demand.items.findIndex((item) => item.id === summary.itemId)
		const label = `Item ${index + 1}`
		if (summary.values.length === 0) add({ id: `price-${summary.itemId}`, severity: "bloqueia", step: "precos", message: `${label}: sem nenhum preço válido.` })
		else if (!isExclusive && summary.values.length < MIN_QUOTES)
			add({
				id: `price-few-${summary.itemId}`,
				severity: "atencao",
				step: "precos",
				message: `${label}: ${summary.values.length} preço(s) válido(s); a pesquisa direta pede no mínimo ${MIN_QUOTES}. Se não houver mais, registre as consultas sem resposta.`,
				basis: "IN SEGES/ME nº 65/2021, art. 5º, IV, e § 2º",
			})
		if (summary.cv !== null && summary.cv > CV_THRESHOLD && demand.priceMethod !== "mediana")
			add({
				id: `cv-${summary.itemId}`,
				severity: demand.priceMethod === "auto" ? "dica" : "atencao",
				step: "precos",
				message: `${label}: coeficiente de variação de ${(summary.cv * 100).toFixed(1)}%${demand.priceMethod === "auto" ? "; a estimativa usa a mediana" : ", acima de 25%: a média não representa o conjunto"}.`,
				basis: "IN SEGES/ME nº 65/2021, art. 6º",
			})
	}
	for (const quoteId of expiredQuotes(demand.quotes, todayIso(today))) {
		const quote = demand.quotes.find((candidate) => candidate.id === quoteId)
		add({
			id: `expired-${quoteId}`,
			severity: "atencao",
			step: "precos",
			message: `A proposta de ${quote?.supplier || "fornecedor sem nome"} venceu em ${quote?.validUntil}. Peça a renovação antes de concluir.`,
		})
	}
	for (const pair of dependentQuotes(demand.quotes)) {
		const a = demand.quotes.find((quote) => quote.id === pair.a)
		const b = demand.quotes.find((quote) => quote.id === pair.b)
		add({
			id: `dependent-${pair.a}-${pair.b}`,
			severity: "atencao",
			step: "precos",
			message: `As cotações de ${a?.supplier || "?"} e ${b?.supplier || "?"} não parecem independentes: ${pair.reason}. Confira sócios e vínculos antes de usá-las juntas.`,
			basis: `${LESSON} (forno: cotações do mesmo grupo)`,
		})
	}
	for (const quote of demand.quotes) {
		if (!quote.supplier.trim() || !quote.date)
			add({ id: `quote-${quote.id}`, severity: "atencao", step: "precos", message: "Toda cotação precisa da fonte (fornecedor ou sítio) e da data." })
	}
	const validSources = new Set(demand.quotes.filter((quote) => !quote.excludedReason.trim()).map((quote) => quote.source))
	if (solution.nature === "bem" && validSources.size === 1 && validSources.has("tabela_referencia"))
		add({
			id: "only-tables",
			severity: "atencao",
			step: "precos",
			message: "Bem sob medida cotado só por tabela: tabelas e sítios servem de controle de razoabilidade; o preço vem das propostas.",
			basis: LESSON,
		})

	// ── Riscos ────────────────────────────────────────────────────────────────
	const risks = demand.risks.filter((risk) => risk.risk.trim())
	if (risks.length === 0)
		add({ id: "risks", severity: "bloqueia", step: "riscos", message: "Registre os riscos da contratação (normalmente de 3 a 6).", basis: "art. 18, § 1º, X" })
	else if (risks.length < 3)
		add({ id: "risks-few", severity: "dica", step: "riscos", message: "Menos de 3 riscos: confira execução, local e premissas de quantidade." })
	else if (risks.length > 6)
		add({
			id: "risks-many",
			severity: "atencao",
			step: "riscos",
			message: `${risks.length} riscos: mapa longo parece lista genérica. Funda os de mesma causa e leve os genéricos a cláusula do TR.`,
			basis: `${LESSON} (cerca: 10 riscos viraram 4)`,
		})
	for (const risk of risks) {
		const label = `Risco "${risk.risk.slice(0, 50)}"`
		if (risk.probability === null || risk.impact === null)
			add({ id: `scale-${risk.id}`, severity: "bloqueia", step: "riscos", message: `${label}: informe probabilidade e impacto (1 a 5).` })
		if (risk.probability === 5)
			add({
				id: `certain-${risk.id}`,
				severity: "atencao",
				step: "riscos",
				message: `${label}: probabilidade 5 é fato certo; trate como premissa ou providência.`,
			})
		for (const [pattern, where] of GENERIC_RISKS)
			if (pattern.test(risk.risk))
				add({ id: `generic-${risk.id}`, severity: "atencao", step: "riscos", message: `${label} é genérico: ${where}.`, basis: LESSON })
		if (!risk.preventiveAction.trim() || !risk.contingencyAction.trim())
			add({ id: `actions-${risk.id}`, severity: "atencao", step: "riscos", message: `${label}: registre a ação preventiva e a de contingência.` })
		if (!risk.preventiveOwner.trim() || !risk.contingencyOwner.trim())
			add({ id: `owners-${risk.id}`, severity: "atencao", step: "riscos", message: `${label}: indique o responsável de cada ação (papel, em campo próprio).` })
		if (/respons[áa]vel\s*:/i.test(`${risk.preventiveAction} ${risk.contingencyAction}`))
			add({
				id: `owner-in-text-${risk.id}`,
				severity: "atencao",
				step: "riscos",
				message: `${label}: o responsável vai no campo próprio, não no texto da ação.`,
				basis: LESSON,
			})
		if (!risk.allocationDetail.trim())
			add({
				id: `allocation-${risk.id}`,
				severity: "atencao",
				step: "riscos",
				message: `${label}: detalhe por que o risco cabe a essa parte, a consequência contratual e a fronteira com o risco vizinho.`,
				basis: "art. 103, § 1º",
			})
	}
	if (risks.some((risk) => risk.allocatedTo === "contratada") && framing.route !== "inexigibilidade_74_I")
		add({
			id: "risk-contractor",
			severity: "dica",
			step: "riscos",
			message:
				'No Compras.gov.br, "Contratada" exige CNPJ, que só existe depois da adjudicação. Lance esses riscos depois da seleção ou como "Administração", com a consequência contratual no detalhamento.',
			basis: LESSON,
		})

	// ── Planejamento ──────────────────────────────────────────────────────────
	const roles = new Set(planning.team.filter((member) => member.name.trim()).map((member) => member.role))
	if (!roles.has("requisitante") || !roles.has("tecnica"))
		add({
			id: "team",
			severity: "atencao",
			step: "planejamento",
			message: "O ETP é elaborado em conjunto pela área requisitante e pela área técnica: inclua um integrante de cada.",
			basis: "IN SEGES nº 58/2022, art. 8º",
		})
	if (!planning.pcaId.trim() && !context.supervening)
		add({ id: "pca", severity: "atencao", step: "planejamento", message: "Informe o identificador da contratação no PCA.", basis: "art. 18, § 1º, II" })
	if (!planning.nup.trim())
		add({ id: "nup", severity: "dica", step: "planejamento", message: "Sem NUP ainda: as peças saem com [PREENCHER] no número do processo." })
	if (!planning.environmentalImpacts.trim() && !solution.sustainability.trim())
		add({
			id: "environment",
			severity: "atencao",
			step: "planejamento",
			message: "Descreva os impactos ambientais do objeto e as medidas de mitigação.",
			basis: "art. 18, § 1º, XII",
		})

	// ── Enquadramento ─────────────────────────────────────────────────────────
	for (const [index, warning] of framing.warnings.entries())
		add({ id: `framing-${index}`, severity: framing.route === "licitacao" ? "dica" : "atencao", step: "precos", message: warning })
	if ((framing.route === "dispensa_75_I" || framing.route === "dispensa_75_II") && planning.sameNatureSpent === 0)
		add({
			id: "same-nature",
			severity: "dica",
			step: "precos",
			message:
				"Confirme com o setor de contratações o que a unidade já contratou no exercício com objeto da mesma natureza: o limite da dispensa vale para a soma.",
			basis: "art. 75, § 1º, da Lei nº 14.133/2021",
		})
	if (framing.route === "dispensa_75_II" && prices.total !== null && prices.total <= 80_000)
		add({
			id: "me-epp",
			severity: "dica",
			step: "precos",
			message: `Valor de ${formatBRL(prices.total)}: item até R$ 80.000,00 tem participação exclusiva de ME e EPP (art. 48, I, da LC nº 123/2006), salvo as exceções do art. 49.`,
		})

	// ── Redação (todos os textos) ─────────────────────────────────────────────
	for (const entry of freeTexts(demand)) {
		if (/[—–]/.test(entry.value))
			add({
				id: `dash-${entry.step}-${entry.where}`,
				severity: "atencao",
				step: entry.step,
				message: `Travessão em ${entry.where}: use vírgula, parênteses ou reescreva.`,
				basis: "padrão de redação do IEFA-SJ",
			})
		for (const [pattern, phrase] of ADMITS_FAILURE)
			if (pattern.test(entry.value))
				add({
					id: `admits-${entry.step}-${entry.where}-${phrase}`,
					severity: "atencao",
					step: entry.step,
					message: `"${phrase}" em ${entry.where}: o processo registra o que foi feito e decidido, sem expor falha da Administração.`,
					basis: LESSON,
				})
	}

	return checks
}

export function countBySeverity(checks: readonly DemandCheck[]): Record<CheckSeverity, number> {
	return {
		bloqueia: checks.filter((check) => check.severity === "bloqueia").length,
		atencao: checks.filter((check) => check.severity === "atencao").length,
		dica: checks.filter((check) => check.severity === "dica").length,
	}
}
