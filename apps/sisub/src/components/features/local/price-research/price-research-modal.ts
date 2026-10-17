/**
 * Derivações puras do `PriceResearchModal`: formatação, rótulos e agrupamentos que a tela mostra.
 * Ficam fora do `.tsx` para serem testáveis sem carregar a server fn que o modal importa.
 * Não importar `@/lib/price-research-utils` aqui: ele puxa a server fn de busca.
 */
import type { PriceResearchMethod, ResearchFinding, ResearchJustificationKey } from "@iefa/sisub-domain"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

// ─── Constants ────────────────────────────────────────────────────────────────

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(value: string | null | undefined): string {
	if (!value) return "—"
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		const [y, m, d] = value.substring(0, 10).split("-")
		return `${d}/${m}/${y}`
	}
	return value.substring(0, 10)
}

export function getRecommendation(cv: number): { text: string; colorClass: string } {
	if (cv < 15) return { text: "Distribuição homogênea — média e mediana equivalentes.", colorClass: "text-success" }
	if (cv < 30) return { text: "Variabilidade moderada — prefira a mediana.", colorClass: "text-warning" }
	return { text: "Alta variabilidade — mediana recomendada (IN SEGES/ME 65/2021, art. 6º).", colorClass: "text-destructive" }
}

export function hasReferenceDate(r: ComprasMaterialPriceResult): boolean {
	return Boolean(r.dataResultado ?? r.dataCompra)
}

export interface FindingGroup {
	key: ResearchJustificationKey | null
	findings: ResearchFinding[]
}

/** Não conformidades agrupadas pela justificativa que as resolve (uma caixa de texto por grupo). */
export function groupFindings(findings: ResearchFinding[]): FindingGroup[] {
	const groups: FindingGroup[] = []
	for (const finding of findings) {
		const group = finding.justification ? groups.find((g) => g.key === finding.justification) : undefined
		if (group) group.findings.push(finding)
		else groups.push({ key: finding.justification, findings: [finding] })
	}
	return groups
}

// ─── Rótulos da tela ─────────────────────────────────────────────────────────

/** Carga terminada com ao menos um registro: libera o total, o botão da janela e o rodapé. */
export function hasLoadedResults(isLoading: boolean, resultCount: number): boolean {
	return !isLoading && resultCount > 0
}

/** Rótulo do botão da janela de recência. */
export function formatPeriodLabel(periodMonths: number | null, outOfPeriodCount: number): string {
	return periodMonths ? `Últimos ${periodMonths} meses${outOfPeriodCount > 0 ? ` (${outOfPeriodCount} fora)` : ""}` : "Todo o histórico"
}

/** Rótulo do botão que põe (ou tira) as amostras sem data no cálculo. */
export function formatUndatedLabel(includeUndated: boolean, undatedCount: number): string {
	return includeUndated ? `${undatedCount} sem data no cálculo` : `${undatedCount} sem data: fora do cálculo`
}

/** Origem do recorte no cabeçalho das estatísticas. */
export function formatSampleScopeLabel(fromSelection: boolean, periodMonths: number | null): string {
	return fromSelection ? "Seleção manual" : periodMonths ? `Resultados dos últimos ${periodMonths} meses` : "Todo o histórico"
}

/** Sufixo de "incomparáve…": "is" no plural, "l" no singular. */
export function getIncomparableSuffix(count: number): string {
	return count !== 1 ? "is" : "l"
}

/**
 * O que fazer com uma coleta parcial, pela causa: sem janela, voltar a ela (que para na janela);
 * com janela, ou a fonte veio fora de ordem (tentar mais tarde) ou a própria janela passa do teto.
 */
export function getPartialCollectionHint(periodMonths: number | null, orderBroken: boolean): string {
	if (!periodMonths) return "Volte à janela de 12 meses: com ela a coleta para quando a fonte passa do início da janela."
	if (orderBroken) return "A fonte não veio em ordem de data do resultado, e sem ela a coleta não sabe onde a janela termina. Atualize mais tarde."
	return "A própria janela tem mais registros do que o teto de páginas. Registre o caso: o item precisa de outra fonte de preço."
}

/** Texto do botão "Usar" de um método enquanto a memória de cálculo é gravada. */
export function getUsePriceLabel(savingMethod: PriceResearchMethod | null, method: PriceResearchMethod): string {
	return savingMethod === method ? "Salvando…" : "Usar"
}

/** Dica do botão da média quando ela passa da mediana (art. 6º, § 6º). */
export function getMeanPriceTitle(isMeanAllowed: boolean): string | undefined {
	return isMeanAllowed ? undefined : "A média passa da mediana: o preço estimado não pode superá-la (IN SEGES/ME 65/2021, art. 6º, § 6º)."
}

/** Contagem do rodapé: total, ou "filtrados de total" quando há filtro de coluna. */
export function formatResultsCount(filteredCount: number, totalCount: number): string {
	return filteredCount === totalCount
		? `${totalCount.toLocaleString("pt-BR")} resultados`
		: `${filteredCount.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")} resultados`
}

/** Espaçadores acima e abaixo das linhas virtualizadas. */
export function computeVirtualPadding(
	virtualRows: ReadonlyArray<{ start: number; end: number }>,
	totalSize: number
): { paddingTop: number; paddingBottom: number } {
	const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
	const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0
	return { paddingTop, paddingBottom }
}

/** "Município — UF" do cartão de detalhes; sem UF, só o município. */
export function formatMunicipalityLabel(municipio: string, estado: string | null): string {
	return `${municipio}${estado ? ` — ${estado}` : ""}`
}

/** Capacidade da embalagem com o nome da unidade de fornecimento (vazio quando falta). */
export function formatCapacityLabel(capacity: number, unitName: string | null): string {
	return `${NUM.format(capacity)} ${unitName ?? ""}`
}
