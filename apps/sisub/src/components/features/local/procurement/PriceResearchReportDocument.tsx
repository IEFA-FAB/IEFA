import {
	formatConsultedAt,
	HIGH_CV_PERCENT,
	PRICE_RESEARCH_MAX_PAGES,
	PRICE_RESEARCH_PAGE_SIZE,
	PRICE_RESEARCH_SOURCE_URL,
	type PriceResearchReport,
	researchWindowOf,
	SAMPLE_MAX_AGE_DAYS,
	SOURCE_COVERAGE_LABELS,
	type SourceCoverage,
} from "@iefa/sisub-domain"
import { roundToCents } from "@iefa/sisub-domain/money"
import { type ReactNode, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const PRICE = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })
const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const METHOD: Record<string, string> = { median: "mediana", mean: "média", lowest: "menor preço" }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
/** Primeira e última hora de consulta do grupo, em Brasília; o dia sai uma vez quando é o mesmo. */
function formatConsultationRange(instants: string[]): string {
	if (instants.length === 0) return "não registrada"
	const sorted = instants.map(formatConsultedAt).sort()
	const [first, last] = [sorted[0], sorted.at(-1) as string]
	const civil = (text: string) => `${fmtCivil(text.slice(0, 10))} ${text.slice(11, 16)}`
	if (first === last) return civil(first)
	return first.slice(0, 10) === last.slice(0, 10) ? `${civil(first)} a ${last.slice(11, 16)}` : `${civil(first)} a ${civil(last)}`
}

/** Data civil (YYYY-MM-DD) em dd/mm/aaaa, sem passar por fuso. */
const fmtCivil = (civil: string) => civil.split("-").reverse().join("/")

/** "1–40, 42, 45–47": números de item em faixas. */
function formatOrderRanges(orders: number[]): string {
	const ranges: string[] = []
	for (let i = 0; i < orders.length; i++) {
		let j = i
		while (j + 1 < orders.length && orders[j + 1] === orders[j] + 1) j++
		ranges.push(j > i ? `${orders[i]}–${orders[j]}` : String(orders[i]))
		i = j
	}
	return ranges.join(", ")
}

/** Itens agrupados pela data da pesquisa e pela janela aplicada nela. */
function groupResearchWindows(items: PriceResearchReport["items"]) {
	const groups = new Map<
		string,
		{ researchDate: string; windowStart: string | null; coverage: SourceCoverage | null; consultedAt: string[]; orders: number[] }
	>()
	for (const i of items) {
		if (!i.research) continue
		const window = researchWindowOf(i.research)
		const coverage = i.research.source?.coverage ?? null
		const key = `${window.researchDate}|${window.windowStart}|${coverage}`
		const group = groups.get(key) ?? { ...window, coverage, consultedAt: [], orders: [] }
		group.orders.push(i.order)
		if (i.research.source) group.consultedAt.push(i.research.source.consultedAt)
		groups.set(key, group)
	}
	return [...groups.values()].sort((a, b) => a.researchDate.localeCompare(b.researchDate) || a.orders[0] - b.orders[0])
}

interface ReportSection {
	id: string
	/** Rótulo curto da aba. */
	tab: string
	/** Título da seção no documento. */
	title: string
	/** Contagem de pendências mostrada na aba. */
	badge?: { count: number; tone: "warning" | "destructive" }
	content: ReactNode
}

/**
 * Relatório de pesquisa de preços (IN SEGES/ME 65/2021, art. 3º), na ordem dos incisos, com a
 * série completa em CSV anexo (SHA-256 impresso), o checklist de conformidade e o roteiro de
 * auditoria. Tudo sai de uma emissão registrada: reabrir a emissão reproduz o documento.
 *
 * `layout="tabs"` é a leitura na tela: uma seção por aba, com o cabeçalho fixo em cima. A
 * impressão usa o documento corrido (o padrão), que é o que vai aos autos.
 */
export function PriceResearchReportDocument({ report, layout = "print" }: { report: PriceResearchReport; layout?: "print" | "tabs" }) {
	const { list, emission, items } = report
	const agents = [...new Set(items.map((i) => i.research?.createdByName).filter((n): n is string => Boolean(n)))]
	const withResearch = items.filter((i) => i.research)
	const periods = [...new Set(withResearch.map((i) => i.research?.periodMonths).filter((p): p is number => p != null))]
	// soma as linhas já fechadas em centavo: o total do relatório bate com a coluna
	const total = roundToCents(
		items.reduce((sum, i) => (i.unitPrice != null && i.maxQuantity != null ? sum + roundToCents(i.unitPrice * i.maxQuantity) : sum), 0)
	)
	const checksByOrder = new Map(report.checks.map((c) => [c.order, c.checks]))
	const blocking = report.checks.filter((c) => c.checks.some((k) => k.severity === "blocking"))
	// Excepcionalidades da emissão (congeladas nela, ou pela regra da época nas antigas): uma linha
	// por justificativa, com o texto gravado na pesquisa ou o espaço em branco para preencher.
	const exceptional = report.exceptions.flatMap((e) => e.exceptions.map((x) => ({ order: e.order, description: e.description, ...x })))
	// O texto do documento acompanha a regra da emissão: emissão antiga continua dizendo o que disse.
	const isRule2 = report.ruleVersion === 2
	const recomputed = items.some((i) => i.research?.samples.some((s) => s.conversionRecomputed))

	const firstResearch = withResearch.length > 0 ? fmtDate(withResearch.map((i) => i.research?.createdAt as string).sort()[0]) : "—"
	const lastResearch =
		withResearch.length > 0
			? fmtDate(
					withResearch
						.map((i) => i.research?.createdAt as string)
						.sort()
						.at(-1) as string
				)
			: "—"
	const isSeries2 = report.seriesFormat >= 2
	// Itens pela data da pesquisa e janela: o lote do anexo sai numa linha, não uma por item.
	const researchWindows = groupResearchWindows(items)
	const pendingChecks = report.checks.reduce((sum, c) => sum + c.checks.length, 0)
	const pendingExceptions = exceptional.filter((e) => !e.text).length

	const sections: ReportSection[] = [
		{
			id: "object",
			tab: "Objeto",
			title: "1. Objeto (art. 3º, I)",
			content: (
				<p>
					Estimativa do preço dos {items.length} itens do anexo quantitativo "{list.title}", para a contratação por sistema de registro de preços com vigência
					prevista de {list.validityMonths ?? "—"} meses. Valor estimado (quantidade máxima × preço estimado): <strong>{BRL.format(total)}</strong>.
				</p>
			),
		},
		{
			id: "agents",
			tab: "Responsáveis",
			title: "2. Responsáveis pela pesquisa (art. 3º, II)",
			content: <p>{agents.length > 0 ? agents.join("; ") : "Não registrado nas pesquisas anteriores à gravação do agente responsável."}</p>,
		},
		{
			id: "sources",
			tab: "Fontes",
			title: "3. Fontes consultadas (art. 3º, III)",
			content: (
				<>
					<p>
						Sistema oficial de preços do Governo Federal (parâmetro do art. 5º, I): módulo de pesquisa de preços da API de Dados Abertos do Compras.gov.br
						(dadosabertos.compras.gov.br, consulta por código CATMAT), com os preços de compras homologadas
						{periods.length > 0 ? ` nos últimos ${periods.join("/")} meses anteriores à data de cada pesquisa` : ""}. Cada preço da série identifica a compra de
						origem (identificador da compra e do item, UASG, data e fornecedor quando informado) e pode ser conferido na fonte.
					</p>
					<p>
						Filtros da consulta, iguais em todos os itens: o código CATMAT do item (tipo=codigoItemCatalogo), em todo o país, sem recorte de UASG, órgão,
						estado, município, esfera, poder ou data, em páginas de {INT.format(PRICE_RESEARCH_PAGE_SIZE)} registros. A janela de 1 ano é aplicada sobre o
						resultado: entram os preços com data do resultado, ou da compra quando não há resultado, do início da janela até a data da pesquisa. A fonte devolve
						os registros em ordem decrescente de data do resultado; a coleta lê as páginas até a primeira que passa do início da janela e confere a última
						página ("janela completa"), e sem janela lê todas, até {PRICE_RESEARCH_MAX_PAGES}. A API não informa a hora da consulta: a hora abaixo é a do
						servidor do sisub ao receber a primeira página. Para repetir, consulte {PRICE_RESEARCH_SOURCE_URL} com tipo=codigoItemCatalogo e codigo=CATMAT,
						página a página, até passar do início da janela; compras homologadas depois da pesquisa aparecem na consulta de hoje e não na série.
					</p>
					{researchWindows.length > 0 && (
						<table>
							<thead>
								<tr>
									<th>Itens</th>
									<th>Data da pesquisa</th>
									<th>Janela aplicada</th>
									<th>Consulta (hora de Brasília)</th>
									<th>Leitura da fonte</th>
								</tr>
							</thead>
							<tbody>
								{researchWindows.map((w) => (
									<tr key={`${w.researchDate}-${w.windowStart}-${w.coverage}`}>
										<td>{formatOrderRanges(w.orders)}</td>
										<td>{fmtCivil(w.researchDate)}</td>
										<td>{w.windowStart ? `${fmtCivil(w.windowStart)} a ${fmtCivil(w.researchDate)}` : "todo o histórico"}</td>
										<td>{formatConsultationRange(w.consultedAt)}</td>
										<td>{w.coverage ? SOURCE_COVERAGE_LABELS[w.coverage] : "não registrada"}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
					<p>
						A pesquisa direta com fornecedores (art. 5º, IV), sítios especializados (III) e notas fiscais (V) não foram usados nesta emissão; por isso o inciso
						VIII do art. 3º não se aplica.
					</p>
				</>
			),
		},
		{
			id: "series",
			tab: "Série",
			title: "4. Série de preços coletados (art. 3º, IV)",
			content: (
				<>
					<p>
						{isSeries2
							? `A série completa está no arquivo anexo "serie-precos-emissao-${emission.sequence}.csv", em três blocos: a nota com a fonte, os filtros da consulta e como repeti-la; o resumo por item, com a data da pesquisa, a janela, a URL da consulta, o funil de amostras, a estatística, o método, o preço e as justificativas; e as amostras, cada preço válido, descartado ou inconsistente com a descrição na compra, a embalagem original, a conversão para a unidade do item e a URL que o devolve da fonte. A integridade do arquivo se confere pelo SHA-256:`
							: `A série completa, com cada preço válido, descartado ou inconsistente, a embalagem original e a conversão para a unidade do item, está no arquivo anexo "serie-precos-emissao-${emission.sequence}.csv", cuja integridade se confere pelo SHA-256:`}
					</p>
					<p data-proc="mono">{emission.sha256}</p>
					<p>
						{emission.verified
							? "Integridade conferida: a série regenerada a partir das pesquisas gravadas tem este mesmo hash."
							: "ATENÇÃO: a série regenerada hoje NÃO tem o hash da emissão. Alguma pesquisa usada foi alterada ou removida depois; gere nova emissão."}
					</p>
				</>
			),
		},
		{
			id: "method",
			tab: "Método",
			title: "5. Método estatístico (art. 3º, V) e justificativas (art. 3º, VI)",
			content: (
				<>
					<p>
						Os preços de cada amostra são convertidos para a unidade de compra do item (conteúdo da embalagem × fator da unidade de medida). Amostras cujo
						conteúdo não se mede na unidade do item são desconsideradas como inconsistentes. Das comparáveis, descartam-se como excessivamente elevadas ou
						inexequíveis as fora do intervalo interquartil ampliado (Q1 − 1,5 × IIQ; Q3 + 1,5 × IIQ), quando há 4 ou mais preços. Sobre as válidas, o preço
						estimado é a média quando a série é homogênea (coeficiente de variação abaixo de 15%) e a média não supera a mediana; nos demais casos, a mediana.
						{isRule2 ? " O agente pode escolher o menor dos valores (art. 6º, caput)." : ""} O preço estimado nunca supera a mediana (art. 6º, § 6º).
					</p>
					{isRule2 && (
						<p>
							Amostras sem data de referência ficam fora do cálculo, porque sem data não há como mostrar que o preço é de até 1 ano (art. 5º, II). Amostras
							escolhidas à mão pelo agente, em vez do descarte automático, têm o critério descrito na seção 7 (art. 6º, § 3º).
						</p>
					)}
					<p>
						Itens com coeficiente de variação acima de {HIGH_CV_PERCENT}% pedem análise crítica registrada (art. 6º, § 4º). Preços com mais de{" "}
						{INT.format(SAMPLE_MAX_AGE_DAYS)} dias na data da emissão são sinalizados.
						{recomputed ? " Em pesquisas gravadas antes do registro da conversão, a conversão foi refeita pela mesma regra e aparece marcada na série." : ""}
					</p>
				</>
			),
		},
		{
			id: "calculation",
			tab: "Memória de cálculo",
			title: "6. Memória de cálculo do valor estimado (art. 3º, VII)",
			content: (
				<>
					<table>
						<thead>
							<tr>
								<th data-num="">Item</th>
								<th>CATMAT</th>
								<th style={{ width: "28%" }}>Descrição</th>
								<th>Unid.</th>
								<th data-num="">Coletados / na janela / comparáveis / válidos</th>
								<th data-num="">Mínimo</th>
								<th data-num="">Máximo</th>
								<th data-num="">Média</th>
								<th data-num="">Mediana</th>
								<th data-num="">CV</th>
								<th>Método</th>
								<th data-num="">Preço estimado</th>
								<th data-num="">Qtd. máxima</th>
								<th data-num="">Valor</th>
							</tr>
						</thead>
						<tbody>
							{items.map((i) => {
								const r = i.research
								return (
									<tr key={i.listItemId}>
										<td data-num="">{i.order}</td>
										<td>{i.catmat ?? "—"}</td>
										<td>{i.description}</td>
										<td>{r?.measureUnit ?? i.unit}</td>
										<td data-num="">{r ? `${r.totalRaw} / ${r.afterDate} / ${r.afterPollution} / ${r.afterOutlier}` : "sem pesquisa"}</td>
										<td data-num="">{r?.priceMin != null ? PRICE.format(r.priceMin) : "—"}</td>
										<td data-num="">{r?.priceMax != null ? PRICE.format(r.priceMax) : "—"}</td>
										<td data-num="">{r?.priceMean != null ? PRICE.format(r.priceMean) : "—"}</td>
										<td data-num="">{r?.priceMedian != null ? PRICE.format(r.priceMedian) : "—"}</td>
										<td data-num="">{r?.cvPct != null ? `${NUM.format(r.cvPct)}%` : "—"}</td>
										<td>{r?.method ? (METHOD[r.method] ?? r.method) : "—"}</td>
										<td data-num="">{i.unitPrice != null ? PRICE.format(i.unitPrice) : "—"}</td>
										<td data-num="">{i.maxQuantity != null ? INT.format(i.maxQuantity) : "—"}</td>
										<td data-num="">{i.unitPrice != null && i.maxQuantity != null ? BRL.format(roundToCents(i.unitPrice * i.maxQuantity)) : "—"}</td>
									</tr>
								)
							})}
							<tr>
								<th colSpan={13}>Valor estimado total</th>
								<td data-num="">{BRL.format(total)}</td>
							</tr>
						</tbody>
					</table>
					<p>
						Pesquisas por item: data e agente em cada linha da série (arquivo anexo). As datas das pesquisas vão de {firstResearch} a {lastResearch}.
					</p>
				</>
			),
		},
		{
			id: "exceptions",
			tab: "Excepcionalidades",
			title: "7. Excepcionalidades que dependem de aprovação",
			badge: pendingExceptions > 0 ? { count: pendingExceptions, tone: "warning" } : undefined,
			content:
				exceptional.length === 0 ? (
					<p>
						{isRule2
							? "Nenhuma: todos os itens pesquisados têm 3 ou mais preços válidos de 3 ou mais fontes, na janela de 1 ano, com amostras datadas e o descarte automático."
							: "Nenhuma: todos os itens pesquisados têm 3 ou mais preços válidos de 3 ou mais fontes."}
					</p>
				) : (
					<>
						<p>
							{isRule2
								? "Os itens abaixo se afastam da regra e dependem de justificativa nos autos: menos de três preços (art. 6º, § 5º, com aprovação da autoridade competente), menos de três UASGs (critério da unidade), preço fora do período de 1 ano ou sem data (art. 5º, § 3º), critério de desconsideração diferente do automático (art. 6º, § 3º) ou outro método (art. 6º, § 1º, com aprovação da autoridade competente). A justificativa registrada na pesquisa sai abaixo; em branco, preencha antes de juntar aos autos."
								: "Os itens abaixo têm menos de 3 preços válidos ou de 3 fontes. O preço estimado com base em menos de três preços exige justificativa do gestor responsável e aprovação da autoridade competente (art. 6º, § 5º)."}
						</p>
						<table>
							<thead>
								<tr>
									<th data-num="">Item</th>
									<th>Descrição</th>
									{isRule2 && <th>Excepcionalidade</th>}
									<th>Justificativa</th>
								</tr>
							</thead>
							<tbody>
								{exceptional.map((e) => (
									<tr key={`${e.order}-${e.justification}`}>
										<td data-num="">{e.order}</td>
										<td>{e.description}</td>
										{isRule2 && <td>{e.findings.map((f) => `${f.message} (${f.basis})`).join("; ")}</td>}
										<td style={e.text ? undefined : { height: 36 }}>{e.text ?? ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				),
		},
		{
			id: "audit",
			tab: "Auditoria",
			title: "8. Roteiro de auditoria",
			content: (
				<>
					<p>
						Confira por inteiro os itens da curva A (os que somam 80% do valor estimado): {report.auditSample.curveA.join(", ") || "—"}. Dos demais, confira a
						amostra sorteada com semente derivada do SHA-256 desta emissão (reproduzível por qualquer pessoa): {report.auditSample.sampled.join(", ") || "—"}.
					</p>
					<p>
						Para cada item: (1) localize as linhas dele no CSV; (2) confira três preços válidos na fonte pelo identificador da compra
						{isSeries2 ? " (a coluna conferir_na_fonte traz a URL que devolve cada um)" : ""}; (3) confira a conversão (conteúdo da embalagem na unidade do
						item); (4) aplique o método da seção 5 aos preços válidos e compare com o preço estimado; (5) multiplique pela quantidade máxima e compare com o
						valor.
					</p>
				</>
			),
		},
		{
			id: "checks",
			tab: "Conformidade",
			title: "9. Checklist de conformidade",
			badge: pendingChecks > 0 ? { count: pendingChecks, tone: blocking.length > 0 ? "destructive" : "warning" } : undefined,
			content: report.checks.every((c) => c.checks.length === 0) ? (
				<p>Nenhuma pendência nos itens.</p>
			) : (
				<table>
					<thead>
						<tr>
							<th data-num="">Item</th>
							<th>Situação</th>
							<th>Verificação</th>
							<th>Base</th>
						</tr>
					</thead>
					<tbody>
						{items.flatMap((i) =>
							(checksByOrder.get(i.order) ?? []).map((check) => (
								<tr key={`${i.order}-${check.message}`}>
									<td data-num="">{i.order}</td>
									<td>{check.severity === "blocking" ? "Bloqueia" : "Atenção"}</td>
									<td>{check.message}</td>
									<td>{check.basis}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			),
		},
	]

	const header = (
		<>
			<h1>Relatório de pesquisa de preços</h1>
			<p data-proc="meta">
				Anexo quantitativo do Termo de Referência: <strong>{list.title}</strong>
				{list.segmentName ? ` · Contratação planejada: ${list.segmentName}` : ""}
				<br />
				{list.unitName ?? ""}
				{list.uasg ? ` · UASG ${list.uasg}` : ""} · Emissão nº {emission.sequence}, de {fmtDateTime(emission.emittedAt)}
				{emission.emittedByName ? `, por ${emission.emittedByName}` : ""}
				{list.isBudgetConfidential ? " · ORÇAMENTO SIGILOSO (Lei 14.133/2021, art. 24)" : ""}
			</p>

			{blocking.length > 0 && (
				<p data-proc="alert">
					Este relatório tem {blocking.length} item(ns) com pendência bloqueante (item {blocking.map((b) => b.order).join(", ")}). Veja a seção 9 antes de
					juntar aos autos.
				</p>
			)}
		</>
	)

	if (layout === "tabs") return <ReportTabs header={header} sections={sections} blockingCount={blocking.length} />

	return (
		<article>
			{header}
			{sections.map((section) => (
				<section key={section.id}>
					<h2>{section.title}</h2>
					{section.content}
				</section>
			))}
			<div data-proc="signatures">
				<div>Elaborado</div>
				<div>Conferido</div>
				<div>Aprovado (autoridade competente)</div>
			</div>
		</article>
	)
}

/**
 * Leitura na tela: o cabeçalho (com o alerta de pendência bloqueante) fica em cima, e cada seção
 * numa aba. As abas de excepcionalidades e conformidade mostram quantas pendências têm.
 */
function ReportTabs({ header, sections, blockingCount }: { header: ReactNode; sections: ReportSection[]; blockingCount: number }) {
	const [active, setActive] = useState(sections[0].id)
	return (
		<Tabs value={active} onValueChange={(value) => setActive(String(value))}>
			<div data-proc-doc>
				<article>
					{header}
					{blockingCount > 0 && active !== "checks" && (
						<p>
							<button type="button" className="underline underline-offset-2" onClick={() => setActive("checks")}>
								Abrir o checklist de conformidade
							</button>
						</p>
					)}
				</article>
			</div>
			<TabsList variant="line" className="w-full max-w-[1100px] justify-start overflow-x-auto">
				{sections.map((section, index) => (
					<TabsTrigger key={section.id} value={section.id} className="flex-none">
						<span className="tabular-nums text-muted-foreground">{index + 1}.</span>
						{section.tab}
						{section.badge && (
							<Badge variant={section.badge.tone} className="tabular-nums">
								{section.badge.count}
							</Badge>
						)}
					</TabsTrigger>
				))}
			</TabsList>
			{sections.map((section) => (
				<TabsContent key={section.id} value={section.id}>
					<div data-proc-doc>
						<article>
							<h2>{section.title}</h2>
							{section.content}
						</article>
					</div>
				</TabsContent>
			))}
		</Tabs>
	)
}
