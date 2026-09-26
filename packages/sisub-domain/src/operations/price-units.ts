/**
 * Normalização de unidade na pesquisa de preços.
 *
 * O Compras.gov.br devolve o preço por UNIDADE DE FORNECIMENTO (a embalagem: "EMB 500 G",
 * "FR 750 ML", "KG"), e o anexo quantitativo conta na unidade de compra do item ("KG", "LT",
 * "UN"). Comparar os preços crus mistura embalagens: a garrafa de 750 ml a R$ 4,17 e o litro
 * a R$ 10,39 entravam na mesma mediana, como se fossem o mesmo produto.
 *
 * A regra é uma só, pura e reproduzível, para o documento de pesquisa poder imprimir o fator
 * de cada amostra e o auditor refazer a conta:
 *
 *   conteúdo da embalagem = capacidade × fator(unidade de medida)      (se houver capacidade)
 *                         = fator(unidade de fornecimento)             (se a embalagem já é a unidade)
 *   preço por unidade-base = preço ÷ conteúdo
 *   preço na unidade do item = preço por unidade-base × fator(unidade do item)
 *
 * Amostra cujo conteúdo não se consegue medir ("UN" de um item vendido a quilo, embalagem sem
 * capacidade) é INCONSISTENTE no sentido do art. 6º da IN SEGES/ME 65/2021: sai do cálculo,
 * mas fica registrada com o motivo.
 */

export type MeasureDimension = "mass" | "volume" | "count"

export interface ParsedMeasureUnit {
	dimension: MeasureDimension
	/** Unidade-base da dimensão: KG, L ou UN. */
	base: "KG" | "L" | "UN"
	/** Quantas unidades-base cabem em 1 desta unidade (G = 0,001 KG). */
	toBase: number
}

const MASS = (toBase: number): ParsedMeasureUnit => ({ dimension: "mass", base: "KG", toBase })
const VOLUME = (toBase: number): ParsedMeasureUnit => ({ dimension: "volume", base: "L", toBase })
const COUNT = (toBase: number): ParsedMeasureUnit => ({ dimension: "count", base: "UN", toBase })

const UNIT_TABLE: Record<string, ParsedMeasureUnit> = {
	KG: MASS(1),
	KGS: MASS(1),
	KILO: MASS(1),
	KILOGRAMA: MASS(1),
	KILOGRAMAS: MASS(1),
	QUILO: MASS(1),
	QUILOS: MASS(1),
	QUILOGRAMA: MASS(1),
	QUILOGRAMAS: MASS(1),
	G: MASS(0.001),
	GR: MASS(0.001),
	GRS: MASS(0.001),
	GRAMA: MASS(0.001),
	GRAMAS: MASS(0.001),
	MG: MASS(0.000001),
	MILIGRAMA: MASS(0.000001),
	MILIGRAMAS: MASS(0.000001),
	T: MASS(1000),
	TON: MASS(1000),
	TONELADA: MASS(1000),
	TONELADAS: MASS(1000),
	L: VOLUME(1),
	LT: VOLUME(1),
	LTS: VOLUME(1),
	LITRO: VOLUME(1),
	LITROS: VOLUME(1),
	ML: VOLUME(0.001),
	MILILITRO: VOLUME(0.001),
	MILILITROS: VOLUME(0.001),
	UN: COUNT(1),
	UND: COUNT(1),
	UNID: COUNT(1),
	UNIDADE: COUNT(1),
	UNIDADES: COUNT(1),
	DZ: COUNT(12),
	DUZIA: COUNT(12),
	DUZIAS: COUNT(12),
}

function normalizeUnitCode(value: string): string {
	return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\.$/, "")
}

/**
 * Tolerância para comparar dois preços que passaram por `numeric(12,4)`: o maior entre o
 * arredondamento da 4ª casa e 0,05% do valor. Absoluta pura (meio centavo) aceitava ±50% num
 * preço por grama de R$ 0,01.
 */
export function isSamePrice(a: number, b: number): boolean {
	return Math.abs(a - b) <= Math.max(0.00005, Math.abs(b) * 0.0005)
}

/** Lê uma sigla livre ("kg", "Litro", "UNIDADE") ou devolve null quando não é unidade de medida. */
export function parseMeasureUnit(value: string | null | undefined): ParsedMeasureUnit | null {
	if (!value) return null
	return UNIT_TABLE[normalizeUnitCode(value)] ?? null
}

/** Os campos da amostra do Compras.gov.br que a conversão usa. */
export interface PriceSampleUnitFields {
	precoUnitario?: number | null
	capacidadeUnidadeFornecimento?: number | null
	siglaUnidadeFornecimento?: string | null
	siglaUnidadeMedida?: string | null
}

export type SampleConversion =
	| {
			ok: true
			/** Preço convertido para a unidade do item. */
			price: number
			/** Conteúdo da embalagem, na unidade do item (preço original ÷ conteúdo = preço convertido). */
			contentInTarget: number
			/** Texto da conversão, para o documento: "EMB 500 G = 0,5 KG". */
			explanation: string
	  }
	| { ok: false; reason: "no_price" | "unknown_sample_unit" | "unknown_target_unit" | "incompatible_unit" }

export const SAMPLE_CONVERSION_REASON_LABELS: Record<Exclude<SampleConversion, { ok: true }>["reason"], string> = {
	no_price: "Amostra sem preço",
	unknown_sample_unit: "Unidade de fornecimento sem conteúdo mensurável",
	unknown_target_unit: "Unidade de compra do item não reconhecida",
	incompatible_unit: "Unidade incomparável com a do item",
}

/** Conteúdo de UMA unidade de fornecimento, em unidade-base, com a dimensão. */
function sampleContent(sample: PriceSampleUnitFields): { dimension: MeasureDimension; baseAmount: number; label: string } | null {
	const capacity = sample.capacidadeUnidadeFornecimento ?? 0
	const measure = parseMeasureUnit(sample.siglaUnidadeMedida)
	if (capacity > 0 && measure) {
		return {
			dimension: measure.dimension,
			baseAmount: capacity * measure.toBase,
			label: `${sample.siglaUnidadeFornecimento ?? "EMB"} ${capacity} ${sample.siglaUnidadeMedida}`,
		}
	}
	const supply = parseMeasureUnit(sample.siglaUnidadeFornecimento)
	if (supply) return { dimension: supply.dimension, baseAmount: supply.toBase, label: `${sample.siglaUnidadeFornecimento}` }
	return null
}

const formatAmount = (value: number): string => Number(value.toPrecision(6)).toLocaleString("pt-BR", { maximumFractionDigits: 6 })

/** Converte o preço da amostra para a unidade de compra do item. */
export function convertSamplePrice(sample: PriceSampleUnitFields, targetUnit: string | null | undefined): SampleConversion {
	if (sample.precoUnitario == null) return { ok: false, reason: "no_price" }
	const target = parseMeasureUnit(targetUnit)
	if (!target) return { ok: false, reason: "unknown_target_unit" }
	const content = sampleContent(sample)
	if (!content) return { ok: false, reason: "unknown_sample_unit" }
	if (content.dimension !== target.dimension || content.baseAmount <= 0) return { ok: false, reason: "incompatible_unit" }

	const contentInTarget = content.baseAmount / target.toBase
	return {
		ok: true,
		price: sample.precoUnitario / contentInTarget,
		contentInTarget,
		explanation: `${content.label} = ${formatAmount(contentInTarget)} ${normalizeUnitCode(targetUnit as string)}`,
	}
}

/**
 * Unidade em que a pesquisa calcula. É a unidade de compra do item quando ela é reconhecida.
 * Item sem unidade (ou com unidade livre, "PCT") herda a unidade-base PREDOMINANTE entre as
 * amostras mensuráveis, e o registro sai marcado como `inferred` para aparecer como pendência:
 * a quantidade do anexo, nesse caso, também está numa unidade que ninguém declarou.
 */
export function resolveResearchUnit(targetUnit: string | null | undefined, samples: PriceSampleUnitFields[]): { unit: string; inferred: boolean } | null {
	if (parseMeasureUnit(targetUnit)) return { unit: normalizeUnitCode(targetUnit as string), inferred: false }

	const votes = new Map<string, number>()
	for (const s of samples) {
		const content = sampleContent(s)
		if (!content || s.precoUnitario == null) continue
		const base = content.dimension === "mass" ? "KG" : content.dimension === "volume" ? "L" : "UN"
		votes.set(base, (votes.get(base) ?? 0) + 1)
	}
	let best: string | null = null
	let bestCount = 0
	for (const [unit, count] of votes) {
		if (count > bestCount) {
			best = unit
			bestCount = count
		}
	}
	return best ? { unit: best, inferred: true } : null
}
