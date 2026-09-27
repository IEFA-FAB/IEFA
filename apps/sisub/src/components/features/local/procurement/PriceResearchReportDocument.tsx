import { HIGH_CV_PERCENT, type PriceResearchReport, SAMPLE_MAX_AGE_DAYS } from "@iefa/sisub-domain"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const PRICE = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })
const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const METHOD: Record<string, string> = { median: "mediana", mean: "média", lowest: "menor preço" }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

/**
 * Relatório de pesquisa de preços (IN SEGES/ME 65/2021, art. 3º), na ordem dos incisos, com a
 * série completa em CSV anexo (SHA-256 impresso), o checklist de conformidade e o roteiro de
 * auditoria. Tudo sai de uma emissão registrada: reabrir a emissão reproduz o documento.
 */
export function PriceResearchReportDocument({ report }: { report: PriceResearchReport }) {
	const { list, emission, items } = report
	const agents = [...new Set(items.map((i) => i.research?.createdByName).filter((n): n is string => Boolean(n)))]
	const withResearch = items.filter((i) => i.research)
	const periods = [...new Set(withResearch.map((i) => i.research?.periodMonths).filter((p): p is number => p != null))]
	const total = items.reduce((sum, i) => (i.unitPrice != null && i.maxQuantity != null ? sum + i.unitPrice * i.maxQuantity : sum), 0)
	const checksByOrder = new Map(report.checks.map((c) => [c.order, c.checks]))
	const blocking = report.checks.filter((c) => c.checks.some((k) => k.severity === "blocking"))
	// Excepcionalidades da emissão (congeladas nela, ou pela regra da época nas antigas): uma linha
	// por justificativa, com o texto gravado na pesquisa ou o espaço em branco para preencher.
	const exceptional = report.exceptions.flatMap((e) => e.exceptions.map((x) => ({ order: e.order, description: e.description, ...x })))
	// O texto do documento acompanha a regra da emissão: emissão antiga continua dizendo o que disse.
	const isRule2 = report.ruleVersion === 2
	const recomputed = items.some((i) => i.research?.samples.some((s) => s.conversionRecomputed))

	return (
		<article>
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

			<h2>1. Objeto (art. 3º, I)</h2>
			<p>
				Estimativa do preço dos {items.length} itens do anexo quantitativo "{list.title}", para a contratação por sistema de registro de preços com vigência
				prevista de {list.validityMonths ?? "—"} meses. Valor estimado (quantidade máxima × preço estimado): <strong>{BRL.format(total)}</strong>.
			</p>

			<h2>2. Responsáveis pela pesquisa (art. 3º, II)</h2>
			<p>{agents.length > 0 ? agents.join("; ") : "Não registrado nas pesquisas anteriores à gravação do agente responsável."}</p>

			<h2>3. Fontes consultadas (art. 3º, III)</h2>
			<p>
				Sistema oficial de preços do Governo Federal (parâmetro do art. 5º, I): módulo de pesquisa de preços da API de Dados Abertos do Compras.gov.br
				(dadosabertos.compras.gov.br, consulta por código CATMAT), com os preços de compras homologadas
				{periods.length > 0 ? ` nos últimos ${periods.join("/")} meses anteriores à data de cada pesquisa` : ""}. Cada preço da série identifica a compra de
				origem (identificador da compra e do item, UASG, data e fornecedor quando informado) e pode ser conferido na fonte.
			</p>
			<p>
				A pesquisa direta com fornecedores (art. 5º, IV), sítios especializados (III) e notas fiscais (V) não foram usados nesta emissão; por isso o inciso VIII
				do art. 3º não se aplica.
			</p>

			<h2>4. Série de preços coletados (art. 3º, IV)</h2>
			<p>
				A série completa, com cada preço válido, descartado ou inconsistente, a embalagem original e a conversão para a unidade do item, está no arquivo anexo
				"serie-precos-emissao-{emission.sequence}.csv", cuja integridade se confere pelo SHA-256:
			</p>
			<p data-proc="mono">{emission.sha256}</p>
			<p>
				{emission.verified
					? "Integridade conferida: a série regenerada a partir das pesquisas gravadas tem este mesmo hash."
					: "ATENÇÃO: a série regenerada hoje NÃO tem o hash da emissão. Alguma pesquisa usada foi alterada ou removida depois; gere nova emissão."}
			</p>

			<h2>5. Método estatístico (art. 3º, V) e justificativas (art. 3º, VI)</h2>
			<p>
				Os preços de cada amostra são convertidos para a unidade de compra do item (conteúdo da embalagem × fator da unidade de medida). Amostras cujo conteúdo
				não se mede na unidade do item são desconsideradas como inconsistentes. Das comparáveis, descartam-se como excessivamente elevadas ou inexequíveis as
				fora do intervalo interquartil ampliado (Q1 − 1,5 × IIQ; Q3 + 1,5 × IIQ), quando há 4 ou mais preços. Sobre as válidas, o preço estimado é a média
				quando a série é homogênea (coeficiente de variação abaixo de 15%) e a média não supera a mediana; nos demais casos, a mediana.
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

			<h2>6. Memória de cálculo do valor estimado (art. 3º, VII)</h2>
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
								<td data-num="">{i.unitPrice != null && i.maxQuantity != null ? BRL.format(i.unitPrice * i.maxQuantity) : "—"}</td>
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
				Pesquisas por item: data e agente em cada linha da série (arquivo anexo). As datas das pesquisas vão de{" "}
				{withResearch.length > 0 ? fmtDate(withResearch.map((i) => i.research?.createdAt as string).sort()[0]) : "—"} a{" "}
				{withResearch.length > 0
					? fmtDate(
							withResearch
								.map((i) => i.research?.createdAt as string)
								.sort()
								.at(-1) as string
						)
					: "—"}
				.
			</p>

			<h2>7. Excepcionalidades que dependem de aprovação</h2>
			{exceptional.length === 0 ? (
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
			)}

			<h2>8. Roteiro de auditoria</h2>
			<p>
				Confira por inteiro os itens da curva A (os que somam 80% do valor estimado): {report.auditSample.curveA.join(", ") || "—"}. Dos demais, confira a
				amostra sorteada com semente derivada do SHA-256 desta emissão (reproduzível por qualquer pessoa): {report.auditSample.sampled.join(", ") || "—"}.
			</p>
			<p>
				Para cada item: (1) localize as linhas dele no CSV; (2) confira três preços válidos na fonte pelo identificador da compra; (3) confira a conversão
				(conteúdo da embalagem na unidade do item); (4) aplique o método da seção 5 aos preços válidos e compare com o preço estimado; (5) multiplique pela
				quantidade máxima e compare com o valor.
			</p>

			<h2>9. Checklist de conformidade</h2>
			{report.checks.every((c) => c.checks.length === 0) ? (
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
			)}

			<div data-proc="signatures">
				<div>Elaborado</div>
				<div>Conferido</div>
				<div>Aprovado (autoridade competente)</div>
			</div>
		</article>
	)
}
