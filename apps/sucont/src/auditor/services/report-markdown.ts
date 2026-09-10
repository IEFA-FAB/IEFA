/**
 * @module auditor/services/report-markdown
 * Montagem da Nota Analítica Estratégica em Markdown.
 *
 * Divisão de responsabilidade, e é ela que sustenta o documento: **as tabelas e
 * todo número saem do `ReportDataset`**; do modelo vem só a prosa entre elas. A
 * nota pode estar mal escrita, mas não pode estar com o valor errado.
 *
 * O cabeçalho (PARA/DE) e a fundamentação normativa também não são do modelo: o
 * primeiro é constante institucional, a segunda vem de `#/lib/normas`, a mesma
 * fonte que a MSG cobra da UG. Enquanto era texto solto no prompt, a citação podia
 * divergir da que a Setorial usa no ofício sem que nada acusasse.
 */

import { blocoFundamentacao, FUNDAMENTO_CONCILIACAO_SISTEMAS } from "#/lib/normas"
import { formatCurrency } from "./dataProcessor"
import type { ReportDataset, ReportTrendItem, ReportTrendScope } from "./report"
import type { AnalyticNote } from "./report-schema"

export const NOTE_TITLE = "NOTA ANALÍTICA ESTRATÉGICA — CONCILIAÇÃO SIAFI × SILOMS"
const ADDRESSEE = "Diretor de Economia e Finanças da Aeronáutica / Estado-Maior da Aeronáutica"
const SENDER = "Divisão de Contabilidade Patrimonial — SUCONT-4/DIREF"

/** Marcador do que não é declarável — mesma convenção do gerador de MSG. */
const NO_VALUE = "—"

const GROUP_LABEL: Record<string, string> = {
	BMP: "Bens Móveis Permanentes",
	CONSUMO: "Bens de Consumo",
	INTANGIVEL: "Bens Intangíveis",
}

const SCOPE_LABEL: Record<string, string> = {
	MENSAL: "Mensal",
	TRIMESTRAL: "Trimestral",
	SEMESTRAL: "Semestral",
	ANUAL: "Anual",
}

const groupLabel = (group: string) => GROUP_LABEL[group] ?? group

/**
 * Escapa o conteúdo de uma célula de tabela Markdown.
 *
 * A barra invertida vem PRIMEIRO, e a ordem não é detalhe: escapar `|` como `\|`
 * sem antes duplicar a barra faz um valor que já termina em `\` produzir `\\|` —
 * uma barra literal seguida de um separador de coluna de verdade, que é
 * exatamente a quebra de tabela que este escape existe para impedir.
 */
const cell = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ")

const percent = (value: number | null) => (value === null ? NO_VALUE : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`)

const preponderanceLabel = (p: "SIAFI" | "SILOMS" | "EQUAL") => (p === "EQUAL" ? "Equilibrado" : p === "SIAFI" ? "SIAFI > SILOMS" : "SILOMS > SIAFI")

function table(header: string[], rows: string[][]): string {
	const head = `| ${header.join(" | ")} |`
	const rule = `| ${header.map(() => "---").join(" | ")} |`
	return [head, rule, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n")
}

/** Bloco de prosa do modelo, ou uma linha honesta quando ele não escreveu nada. */
function prose(text: string): string {
	const trimmed = text.trim()
	// Seção vazia impressa como título solto faria a nota parecer truncada sem
	// dizer que foi. Declarar a ausência é a mesma regra dos estados vazios da tela.
	return trimmed || "_O modelo não produziu texto para esta seção._"
}

function trendTable(items: ReportTrendItem[], emptyMessage: string): string {
	if (items.length === 0) return `_${emptyMessage}_`
	return table(
		["UG", "Cód.", "Grupo", "Variação", "%", "Divergência atual", "Divergência anterior"],
		items.map((i) => [
			cell(i.ug),
			i.cod,
			groupLabel(i.group),
			formatCurrency(i.delta),
			percent(i.deltaPct),
			formatCurrency(i.difference),
			formatCurrency(i.previousDifference),
		])
	)
}

function trendSection(scope: ReportTrendScope): string {
	const label = SCOPE_LABEL[scope.scope] ?? scope.scope
	return [
		`#### ${label}`,
		"",
		"**Agravamento**",
		"",
		trendTable(scope.worsening, `Nenhuma unidade aumentou a divergência no escopo ${label.toLowerCase()}.`),
		"",
		"**Melhoria**",
		"",
		trendTable(scope.improving, `Nenhuma unidade reduziu a divergência no escopo ${label.toLowerCase()}.`),
	].join("\n")
}

function headerBlock(dataset: ReportDataset): string {
	const { totals, previous } = dataset

	const lines = [
		`# ${NOTE_TITLE}`,
		"",
		`**PARA:** ${ADDRESSEE}`,
		`**DE:** ${SENDER}`,
		"",
		`**Competência:** ${dataset.competenceLabel} · **Escopo de comparação:** ${SCOPE_LABEL[dataset.timeFilter] ?? dataset.timeFilter} · **Recorte:** ${dataset.scopeLabel}`,
		"",
		table(
			["Indicador", "Valor"],
			[
				["Saldo total SIAFI", formatCurrency(totals.siafi)],
				["Saldo total SILOMS", formatCurrency(totals.siloms)],
				["Divergência total (soma dos módulos)", formatCurrency(totals.absoluteDifference)],
				["Diferença líquida (SIAFI − SILOMS)", formatCurrency(totals.netDifference)],
				["Unidades Gestoras analisadas", String(dataset.ugCount)],
				["Registros (UG × grupo de contas)", String(dataset.recordCount)],
				["Competências carregadas na base", String(dataset.periodsLoaded)],
				[
					"Preponderância",
					`SIAFI maior em ${dataset.preponderance.siafi} · SILOMS maior em ${dataset.preponderance.siloms} · equilibrados ${dataset.preponderance.equal}`,
				],
				[
					`Competência anterior (${previous ? previous.label : NO_VALUE})`,
					previous ? `divergência de ${formatCurrency(previous.totals.absoluteDifference)}` : "não consta na base carregada",
				],
			]
		),
		"",
		// A distinção entre as duas linhas de total é o diagnóstico, não uma nota de
		// rodapé: se elas se afastam, sobra numa UG está compensando falta em outra
		// no consolidado, e ler só a líquida esconde as duas.
		"> A **divergência total** soma o módulo de cada divergência: é o que há para conciliar. A **diferença líquida** compensa sobra com falta e só descreve o consolidado — quanto mais as duas se afastam, mais a conciliação está concentrada em unidades de sinais opostos.",
	]

	return lines.join("\n")
}

function offendersSection(dataset: ReportDataset, note: AnalyticNote): string {
	const rows = dataset.topOffenders.map((o) => [
		cell(o.ug),
		o.cod,
		groupLabel(o.group),
		formatCurrency(o.difference),
		formatCurrency(o.siafi),
		formatCurrency(o.siloms),
		preponderanceLabel(o.preponderance),
		o.riskLevel ?? NO_VALUE,
	])

	return [
		`## 2. Unidades críticas — as ${rows.length} maiores divergências`,
		"",
		rows.length > 0
			? table(["UG", "Cód.", "Grupo", "Divergência", "SIAFI", "SILOMS", "Situação", "Risco"], rows)
			: "_Nenhuma divergência registrada na competência._",
		"",
		prose(note.leituraUnidadesCriticas),
	].join("\n")
}

function highlightsSection(note: AnalyticNote): string {
	if (note.destaquesDeAlerta.length === 0) {
		return ["## 3. Destaques de alerta", "", "_O modelo não produziu destaques para esta competência._"].join("\n")
	}

	const blocks = note.destaquesDeAlerta.map((h, index) => {
		const heading = h.unidade ? `### 3.${index + 1} ${h.titulo} — ${h.unidade}` : `### 3.${index + 1} ${h.titulo}`
		return [heading, "", h.analise, "", `**Ação recomendada:** ${h.acaoRecomendada}`].join("\n")
	})

	return ["## 3. Destaques de alerta", "", ...blocks].join("\n")
}

function interOmSection(dataset: ReportDataset): string {
	if (dataset.interOm.length === 0) return ""

	const rows = dataset.interOm.map((t) => [
		`${cell(t.ugA)} (${t.codA})`,
		`${cell(t.ugB)} (${t.codB})`,
		groupLabel(t.group),
		formatCurrency(t.value),
		formatCurrency(t.residual),
	])

	return [
		"## 3-A. Possíveis transferências entre OMs sem contrapartida no SILOMS",
		"",
		table(["Unidade A", "Unidade B", "Grupo", "Valor do movimento", "Resíduo do casamento"], rows),
		"",
		// A ressalva não é cortesia: o par é hipótese estatística, e uma nota que a
		// apresente como constatação manda duas UGs procurarem um lançamento que pode
		// nunca ter existido.
		"> **Hipótese para conferência, não constatação.** As unidades acima tiveram movimento de SIAFI em sentidos opostos e de magnitude equivalente na competência, com o SILOMS praticamente parado nas duas — o desenho de material que trocou de unidade no contábil e não no físico. Duas movimentações independentes de valor próximo produzem o mesmo padrão; confirme pelas Notas de Lançamento antes de cobrar.",
	].join("\n")
}

function groupsSection(dataset: ReportDataset, note: AnalyticNote): string {
	const rows = dataset.groups.map((g) => [
		groupLabel(g.group),
		formatCurrency(g.difference),
		formatCurrency(g.siafi),
		formatCurrency(g.siloms),
		String(g.ugCount),
	])

	return [
		"## 5. Gargalos por natureza de bem",
		"",
		rows.length > 0 ? table(["Grupo", "Divergência", "SIAFI", "SILOMS", "UGs"], rows) : "_Nenhum grupo de contas com registro na competência._",
		"",
		prose(note.leituraGrupos),
	].join("\n")
}

function actionPlanSection(note: AnalyticNote): string {
	if (note.planoDeAcao.length === 0) {
		return ["## 6. Plano de ação e recomendações estratégicas", "", "_O modelo não produziu recomendações para esta competência._"].join("\n")
	}
	return ["## 6. Plano de ação e recomendações estratégicas", "", ...note.planoDeAcao.map((item, i) => `${i + 1}. ${item}`)].join("\n")
}

/** Junta os blocos descartando os vazios, sem deixar linha em branco dobrada. */
function joinSections(sections: string[]): string {
	return sections.filter((s) => s.trim().length > 0).join("\n\n")
}

/**
 * Documento final: cabeçalho e tabelas do dataset, prosa do modelo entre eles.
 *
 * Recebe os dois de propósito — não existe caminho em que a nota seja montada só
 * com o retorno do modelo.
 */
export function buildAnalyticNoteMarkdown(dataset: ReportDataset, note: AnalyticNote): string {
	return joinSections([
		headerBlock(dataset),
		["## 1. Sumário executivo e diagnóstico", "", prose(note.sumarioExecutivo)].join("\n"),
		offendersSection(dataset, note),
		highlightsSection(note),
		interOmSection(dataset),
		["## 4. Dinâmica de tendências e evolução", "", prose(note.leituraTendencias), "", ...dataset.trends.map(trendSection)].join("\n"),
		groupsSection(dataset, note),
		actionPlanSection(note),
		["## 7. Conclusão", "", prose(note.conclusao)].join("\n"),
		["---", "", blocoFundamentacao(FUNDAMENTO_CONCILIACAO_SISTEMAS)].join("\n"),
		`_Nota gerada com apoio de modelo de linguagem sobre a série carregada em ${dataset.competenceLabel}. Os valores e as tabelas são calculados pelo sistema; o texto analítico é do modelo e exige revisão antes de qualquer encaminhamento._`,
	])
}
