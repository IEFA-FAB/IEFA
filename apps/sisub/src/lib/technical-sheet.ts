/**
 * Matemática da Ficha Técnica de Preparação (FTP), no formato do modelo oficial da SIA
 * (`docs/examples/Modelo_FTP_SIA.pdf`, PARTE 02 — Ingredientes e pré-preparo).
 *
 * Convenções do formulário em papel:
 *   PB = Peso Bruto      PL = Peso Líquido
 *   FC = PB ÷ PL         IR = Peso reidratado ÷ Peso seco
 *
 * O que o banco guarda é o PL **total da preparação** (`recipe_ingredients.net_quantity`,
 * que rende `recipes.portion_yield` porções); a ficha é lida POR CAPITA. A divisão mora
 * aqui, e não em cada tela, porque a tabela do formulário e a folha de impressão precisam
 * mostrar exatamente o mesmo número — foi por isso que virou módulo puro com teste, no
 * mesmo espírito de `ingredient-tree.ts`.
 *
 * Fator ausente vale 1 (não altera o peso), que é a leitura do formulário em branco: campo
 * vazio significa "sem correção", não "zero". Fator <= 0 recebe o mesmo tratamento — um FC
 * zerado multiplicaria a ficha inteira por zero, e devolver 0 em silêncio é pior do que
 * ignorar um valor que o schema já rejeita no salvamento.
 */

/** Uma linha da ficha, como ela existe no formulário. */
export interface TechnicalSheetLineInput {
	/** Peso líquido TOTAL da preparação (o que está em `net_quantity`). */
	netQuantity: number | null
	/** Fator de correção — vazio herda o insumo e, na ausência, vale 1. */
	correctionFactor: number | null
	/** Índice de reidratação — vazio vale 1. */
	rehydrationIndex: number | null
}

/** Os cinco números da faixa "PER CAPITA" do modelo, para uma linha. */
export interface TechnicalSheetLine {
	/** PB — peso bruto por porção. */
	grossWeight: number
	/** FC efetivo (1 quando ausente). */
	correctionFactor: number
	/** PL — peso líquido por porção. */
	netWeight: number
	/** IR efetivo (1 quando ausente). */
	rehydrationIndex: number
	/** Peso reidratado por porção. */
	rehydratedWeight: number
}

/** Fator utilizável, ou 1. Ver a nota do módulo sobre vazio e não-positivo. */
function factorOrOne(value: number | null | undefined): number {
	return value != null && Number.isFinite(value) && value > 0 ? value : 1
}

/** Rendimento utilizável, ou 1 — dividir por 0 devolveria Infinity na tela inteira. */
export function portionYieldOrOne(portionYield: number | null | undefined): number {
	return portionYield != null && Number.isFinite(portionYield) && portionYield > 0 ? portionYield : 1
}

/** Calcula a faixa PER CAPITA de uma linha. */
export function technicalSheetLine(input: TechnicalSheetLineInput, portionYield: number | null | undefined): TechnicalSheetLine {
	const yieldSafe = portionYieldOrOne(portionYield)
	const correctionFactor = factorOrOne(input.correctionFactor)
	const rehydrationIndex = factorOrOne(input.rehydrationIndex)
	const total = input.netQuantity != null && Number.isFinite(input.netQuantity) ? input.netQuantity : 0
	const netWeight = total / yieldSafe
	return {
		grossWeight: netWeight * correctionFactor,
		correctionFactor,
		netWeight,
		rehydrationIndex,
		rehydratedWeight: netWeight * rehydrationIndex,
	}
}

/** Linha TOTAL do modelo. */
export interface TechnicalSheetTotals {
	grossWeight: number
	netWeight: number
	rehydratedWeight: number
	/**
	 * Unidades distintas somadas. O formulário em papel tem uma linha TOTAL só, o que
	 * pressupõe que tudo está na mesma unidade; o catálogo mistura KG, LT e UN. Quem
	 * exibe usa isto para avisar em vez de imprimir uma soma que não significa nada.
	 */
	units: string[]
}

export function technicalSheetTotals(lines: readonly (TechnicalSheetLine & { measureUnit?: string | null })[]): TechnicalSheetTotals {
	const units = new Set<string>()
	let grossWeight = 0
	let netWeight = 0
	let rehydratedWeight = 0
	for (const line of lines) {
		grossWeight += line.grossWeight
		netWeight += line.netWeight
		rehydratedWeight += line.rehydratedWeight
		const unit = line.measureUnit?.trim()
		if (unit) units.add(unit)
	}
	return { grossWeight, netWeight, rehydratedWeight, units: [...units].sort() }
}

// ── Base de digitação da quantidade ─────────────────────────────────────────
// O banco guarda SEMPRE o peso líquido total da preparação (`net_quantity`, que rende
// `portion_yield` porções). A ficha de papel que a Seção digitaliza, porém, vem em dois
// padrões: a que traz a gramatura POR PORÇÃO e a que traz o total do rendimento. Forçar a
// conversão na cabeça de quem digita é onde nasce o erro de duas ordens de grandeza — daí
// a base ser uma escolha de ENTRADA, e a normalização morar aqui.

/** Como o usuário está digitando a quantidade — não é um dado persistido. */
export type QuantityBasis = "total" | "porcao"

/**
 * Casas decimais preservadas na volta total → por porção.
 *
 * A conversão é ida e volta a cada tecla (digita per capita → grava total → relê per
 * capita), e o binário não fecha: 0,005 × 100 ÷ 100 devolve 0,004999999999999999, que o
 * input mostraria inteiro. Seis casas cobrem o tempero em ficha de 1.000 porções e
 * ainda estão longe do erro de arredondamento do double.
 */
const PER_PORTION_DECIMALS = 6

/** Arredonda para `PER_PORTION_DECIMALS` casas — ver a nota da constante. */
function roundToPrecision(value: number): number {
	const factor = 10 ** PER_PORTION_DECIMALS
	return Math.round(value * factor) / factor
}

/**
 * Total gravado no banco a partir do que foi digitado na base escolhida.
 *
 * A multiplicação também arredonda: 33,333 × 100 dá 3.333,2999999999997 em binário, e
 * esse número iria INTEIRO para `net_quantity` — o resíduo apareceria no campo de PL
 * total ao trocar de base e no relatório de compras. Na base "total" o valor passa
 * intacto: ali não houve conta, e arredondar seria mexer no que o usuário digitou.
 */
export function toStoredQuantity(typed: number, basis: QuantityBasis, portionYield: number | null | undefined): number {
	if (!Number.isFinite(typed)) return 0
	return basis === "porcao" ? roundToPrecision(typed * portionYieldOrOne(portionYield)) : typed
}

/** O que o campo mostra, a partir do total gravado, na base escolhida. */
export function fromStoredQuantity(stored: number | null, basis: QuantityBasis, portionYield: number | null | undefined): number {
	const total = stored != null && Number.isFinite(stored) ? stored : 0
	if (basis === "total") return total
	return roundToPrecision(total / portionYieldOrOne(portionYield))
}

/**
 * Número da ficha em pt-BR. Três casas: o per capita de tempero em preparação de 100
 * porções cai na terceira casa, e arredondar antes disso imprime 0,00 para um insumo que
 * está na receita.
 */
export function formatSheetNumber(value: number, maximumFractionDigits = 3): string {
	if (!Number.isFinite(value)) return "—"
	return value.toLocaleString("pt-BR", { maximumFractionDigits })
}
