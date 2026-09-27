import type { QuantityMemory } from "@iefa/sisub-domain"
import type { QuantityEstimateAnnexRow } from "@/lib/quantity-estimate-annex"

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const TYPE_LABEL: Record<string, string> = { weekly: "semanal", event: "evento", apoio: "apoio" }
const CYCLE: Record<string, string> = { weekly: "semanal", monthly: "mensal" }

/** Tolerância para comparar a soma das parcelas com a quantidade congelada (arredondamento de 4 casas). */
const SAME_QUANTITY = 0.001

/**
 * Memória de cálculo das quantidades (Lei 14.133/2021, art. 18, § 1º, IV): para cada item, as
 * parcelas que o compõem, o total no insumo, o fator de conversão e os limites. O auditor refaz a
 * conta com o que está impresso. Em anexo concluído, as quantidades impressas são as congeladas; a
 * memória declara quando os cardápios mudaram depois.
 */
export function QuantityMemoryDocument({
	title,
	unitName,
	segmentName,
	status,
	validityMonths,
	maxIncreasePercent,
	minQuotePercent,
	rows,
	memory,
}: {
	title: string
	unitName: string | null
	segmentName: string | null
	status: string
	validityMonths: number | null
	maxIncreasePercent: number
	minQuotePercent: number
	rows: QuantityEstimateAnnexRow[]
	memory: QuantityMemory
}) {
	const byIngredient = new Map<string, QuantityMemory["contributions"]>()
	for (const c of memory.contributions) {
		const list = byIngredient.get(c.ingredientId)
		if (list) list.push(c)
		else byIngredient.set(c.ingredientId, [c])
	}
	const divergent = rows.filter((r) => {
		const sum = (r.ingredientId ? byIngredient.get(r.ingredientId) : undefined)?.reduce((s, c) => s + c.quantity, 0) ?? 0
		return Math.abs(sum - r.ingredientQuantity) > SAME_QUANTITY * Math.max(1, r.ingredientQuantity)
	})
	const concluded = status !== "draft"

	return (
		<article>
			<h1>Memória de cálculo das quantidades</h1>
			<p data-proc="meta">
				Anexo quantitativo do Termo de Referência: <strong>{title}</strong>
				{segmentName ? ` · Contratação planejada: ${segmentName}` : ""}
				{unitName ? ` · ${unitName}` : ""}
				<br />
				Vigência prevista do anexo: {validityMonths ?? "—"} meses · Situação: {concluded ? "concluído (quantidades congeladas)" : "rascunho"} · Gerado em{" "}
				{new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
			</p>

			<h2>1. Método</h2>
			<p>
				A quantidade de cada insumo é a soma das parcelas dos cardápios das cozinhas: para cada preparação servida, comensais × quantidade líquida do insumo na
				ficha técnica ÷ rendimento da ficha (porções) × repetições na vigência. Cardápio semanal repete pelas semanas da vigência; evento, pelas vezes que
				ocorre; cardápio de apoio, pelas ocorrências mensais × meses. O total no insumo é convertido para a unidade de compra pelo fator do item de compra.
			</p>
			<p>
				A quantidade máxima é a estimada acrescida de {INT.format(maxIncreasePercent)}% (ou do acréscimo do item), arredondada para cima (Lei 14.133/2021, art.
				82, I). A quantidade mínima a ser cotada é {INT.format(minQuotePercent)}% da máxima, arredondada para cima (art. 82, II). A mínima por ordem de
				fornecimento parte do consumo entre duas entregas (semanal ou mensal).
			</p>
			{divergent.length > 0 && (
				<p data-proc="alert">
					{concluded
						? `Atenção: ${divergent.length} item(ns) têm hoje soma de parcelas diferente da quantidade congelada na conclusão: os cardápios mudaram depois. As quantidades do anexo são as congeladas; as parcelas abaixo são as de hoje.`
						: `Atenção: ${divergent.length} item(ns) têm soma de parcelas diferente da quantidade do anexo: os cardápios mudaram depois do último cálculo. Recalcule o anexo antes de juntar esta memória aos autos.`}
				</p>
			)}

			<h2>2. Itens</h2>
			{rows.map((row, index) => {
				const parts = row.ingredientId ? (byIngredient.get(row.ingredientId) ?? []) : []
				const sum = parts.reduce((s, c) => s + c.quantity, 0)
				const factor = row.estimatedQuantity > 0 ? row.ingredientQuantity / row.estimatedQuantity : null
				return (
					<section key={row.key} data-proc="block">
						<h3>
							{index + 1}. {row.catmatDescription ?? row.description}
							{row.catmat ? ` (CATMAT ${row.catmat})` : ""}
						</h3>
						<table>
							<thead>
								<tr>
									<th>Cozinha</th>
									<th>Cardápio</th>
									<th>Preparação</th>
									<th data-num="">Comensais</th>
									<th data-num="">Qtd. líquida na ficha</th>
									<th data-num="">Rendimento da ficha</th>
									<th data-num="">Repetições</th>
									<th data-num="">Quantidade ({row.ingredientUnit ?? "unid."})</th>
								</tr>
							</thead>
							<tbody>
								{parts.length === 0 ? (
									<tr>
										<td colSpan={8}>Sem parcelas nos cardápios de hoje.</td>
									</tr>
								) : (
									parts.map((c) => (
										<tr key={`${c.kitchenId}-${c.templateId}-${c.recipeId}-${c.headcount}-${c.quantity}`}>
											<td>{c.kitchenName}</td>
											<td>
												{c.templateName} ({TYPE_LABEL[c.templateType ?? "weekly"] ?? c.templateType})
											</td>
											<td>{c.recipeName}</td>
											<td data-num="">{NUM.format(c.headcount)}</td>
											<td data-num="">{NUM.format(c.netQuantity)}</td>
											<td data-num="">{NUM.format(c.portionYield)}</td>
											<td data-num="">{NUM.format(c.repetitions)}</td>
											<td data-num="">{NUM.format(c.quantity)}</td>
										</tr>
									))
								)}
								<tr>
									<th colSpan={7}>Total no insumo{concluded ? " (hoje)" : ""}</th>
									<td data-num="">{NUM.format(sum)}</td>
								</tr>
							</tbody>
						</table>
						<table>
							<tbody>
								<tr>
									<th>Quantidade no insumo{concluded ? " (congelada)" : ""}</th>
									<td data-num="">
										{NUM.format(row.ingredientQuantity)} {row.ingredientUnit ?? ""}
									</td>
									<th>Fator de conversão</th>
									<td data-num="">{factor != null ? NUM.format(factor) : "—"}</td>
									<th>Quantidade estimada</th>
									<td data-num="">
										{NUM.format(row.estimatedQuantity)} {row.unit}
									</td>
								</tr>
								<tr>
									<th>Acréscimo</th>
									<td data-num="">{row.increasePercent != null ? `${NUM.format(row.increasePercent)}%` : "—"}</td>
									<th>Quantidade máxima</th>
									<td data-num="">{row.maxQuantity != null ? INT.format(row.maxQuantity) : "—"}</td>
									<th>Mínima a ser cotada</th>
									<td data-num="">{row.minQuoteQuantity != null ? INT.format(row.minQuoteQuantity) : "—"}</td>
								</tr>
								<tr>
									<th>Ciclo de entrega</th>
									<td>{row.deliveryCycle ? CYCLE[row.deliveryCycle] : "—"}</td>
									<th>Mínima por ordem de fornecimento</th>
									<td data-num="">{row.minOrderQuantity != null ? NUM.format(row.minOrderQuantity) : "—"}</td>
									<th />
									<td />
								</tr>
							</tbody>
						</table>
					</section>
				)
			})}
		</article>
	)
}
