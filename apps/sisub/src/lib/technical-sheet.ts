/**
 * Matemática da Ficha Técnica de Preparação (FTP), no formato do modelo oficial da SIA
 * (`docs/examples/Modelo_FTP_SIA.pdf`, PARTE 02 — Ingredientes e pré-preparo).
 *
 * Convenções do formulário em papel:
 *   PB = Peso Bruto      PL = Peso Líquido
 *   FC = PB ÷ PL         IR = Peso reidratado ÷ Peso seco
 *
 * O que o banco guarda é o PL **total da preparação** (`recipe_ingredients.net_quantity`,
 * que rende `recipes.portion_yield` porções); a ficha é lida em uma de duas bases — POR
 * CAPITA (o modelo em papel) ou pelo RENDIMENTO inteiro (a folha que vai para a cozinha).
 * A conversão mora aqui, e não em cada tela, porque a tabela do formulário e a folha de
 * impressão precisam mostrar exatamente o mesmo número — foi por isso que virou módulo
 * puro com teste, no mesmo espírito de `ingredient-tree.ts`.
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

/**
 * Calcula a faixa de pesos de uma linha, na base pedida.
 *
 * `"porcao"` (o default) devolve o PER CAPITA do modelo em papel. `"total"` devolve os
 * pesos do rendimento inteiro — a mesma linha lida "para 100", que é como a Seção imprime
 * a ficha para levar à cozinha. A base "total" NÃO multiplica o per capita de volta: ela
 * usa o `net_quantity` gravado, sem passar pelo par ÷rendimento ×rendimento, que em
 * binário devolveria 3.332,999… no lugar dos 3.333 que estão no banco.
 */
export function technicalSheetLine(
	input: TechnicalSheetLineInput,
	portionYield: number | null | undefined,
	basis: QuantityBasis = "porcao"
): TechnicalSheetLine {
	const yieldSafe = portionYieldOrOne(portionYield)
	const correctionFactor = factorOrOne(input.correctionFactor)
	const rehydrationIndex = factorOrOne(input.rehydrationIndex)
	const total = input.netQuantity != null && Number.isFinite(input.netQuantity) ? input.netQuantity : 0
	const netWeight = basis === "total" ? total : total / yieldSafe
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
 * Mesmo arredondamento, exposto para quem EXIBE um valor calculado dentro de um campo
 * editável: `0,5 × 1,33` devolve 0,6650000000000001 em binário, e um input controlado
 * imprimiria esse número inteiro. `formatSheetNumber` não serve aqui — ele produz texto
 * pt-BR (vírgula), que um `<input type="number">` rejeita.
 */
export function roundSheetQuantity(value: number): number {
	return Number.isFinite(value) ? roundToPrecision(value) : 0
}

// ── Voltas dos derivados ────────────────────────────────────────────────────
// A tabela do modelo tem cinco colunas por linha e o banco guarda três valores (PL total,
// FC, IR): PB e peso reidratado SAEM de uma conta. A ficha de papel, porém, chega com
// qualquer uma das colunas preenchida — a Seção pesa o bruto e o líquido, e o fator é o
// que sobra. Por isso a conta tem volta: digitar o derivado ajusta o fator que o produz,
// nunca o PL, que é o dado que sustenta compra, custo e escala de produção.

/** FC = PB ÷ PL. Sem PL não há fator — `null` diz "não dá para derivar", não "1". */
export function correctionFactorFromGross(grossWeight: number, netWeight: number): number | null {
	if (!Number.isFinite(grossWeight) || !Number.isFinite(netWeight) || netWeight <= 0) return null
	return roundToPrecision(grossWeight / netWeight)
}

/** IR = peso reidratado ÷ peso seco (o PL). Mesma regra do FC quanto ao `null`. */
export function rehydrationIndexFromRehydrated(rehydratedWeight: number, netWeight: number): number | null {
	if (!Number.isFinite(rehydratedWeight) || !Number.isFinite(netWeight) || netWeight <= 0) return null
	return roundToPrecision(rehydratedWeight / netWeight)
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

// ── PARTE 04 — tempo, equipamentos e etapas ─────────────────────────────────
// O modelo em papel pede tempo, método de cocção, equipamentos e temperatura. Quando a FTP
// impressa nasceu, o SISUB não guardava nada disso e a Seção inteira saía em branco. Guarda
// desde o épico de equipamentos tipados (`recipe_equipment_requirement`) e do Fluxo de
// Produção (`recipe_step`) — as formatações que a folha precisa moram aqui, puras, porque a
// folha de impressão e a tela de edição têm que dizer o mesmo sobre a mesma preparação.
//
// Os tipos são ESTRUTURAIS de propósito: o wire das duas operações não é exportado pelo
// índice do `@iefa/sisub-domain`, e o que a folha usa é um punhado de campos.

/** Exigência de equipamento da preparação, como a folha a lê. */
export interface SheetEquipmentRequirement {
	quantity: number
	/** `"per_batch"` escala com o volume; `"fixed"` vale para a leva inteira. */
	scaling: string
	batch_portions: number | null
	min_capacity_liters: number | null
	min_capacity_gn: number | null
	notes: string | null
	/**
	 * Etapa a que a exigência pertence. Duas exigências do mesmo papel em etapas diferentes
	 * são a MESMA unidade reusada em sequência (é assim que o domínio conta o atendimento) —
	 * sem a etapa na linha, o papel as imprime idênticas e a cozinha lê duas unidades.
	 */
	recipe_step_id: string | null
	role: { name: string } | null
	model: { manufacturer: string | null; name: string } | null
}

/** Etapa do Fluxo de Produção, como a folha a lê. */
export interface SheetFlowStep {
	id: string
	label: string | null
	/** A técnica da etapa. É o que a PARTE 03 não tem quando o modo de preparo mora no fluxo. */
	description: string | null
	duration_minutes: number | null
	step_template: { name: string } | null
	utensils: { utensil: { name: string } | null }[]
}

/**
 * Alvo da exigência. Modelo primeiro: quem cadastrou o modelo quis AQUELE equipamento, e
 * imprimir o papel genérico ("forno combinado") apagaria a restrição na folha que vai para
 * a cozinha. Mesma precedência de `requirementLabel` no domínio.
 */
export function equipmentTargetLabel(req: SheetEquipmentRequirement): string {
	if (req.model != null) {
		const label = [req.model.manufacturer, req.model.name].filter(Boolean).join(" ").trim()
		if (label) return label
	}
	return req.role?.name?.trim() || "Equipamento"
}

/** Capacidade mínima exigida, na unidade em que foi cadastrada. Vazio quando não há restrição. */
export function equipmentCapacityLabel(req: SheetEquipmentRequirement): string {
	if (req.min_capacity_gn != null) return `${formatSheetNumber(req.min_capacity_gn, 2)} GN`
	if (req.min_capacity_liters != null) return `${formatSheetNumber(req.min_capacity_liters, 2)} L`
	return ""
}

/**
 * Quantidade exigida COM a escala. A lista descreve uma batelada: "2" sem a batelada de
 * referência lê como "duas unidades para a leva inteira", que é justamente o erro de
 * dimensionamento que o campo `batch_portions` existe para evitar.
 */
export function equipmentQuantityLabel(req: SheetEquipmentRequirement): string {
	const quantity = Number.isFinite(req.quantity) ? req.quantity : 1
	if (req.scaling === "per_batch" && req.batch_portions != null && req.batch_portions > 0) {
		return `${quantity} · por batelada de ${formatSheetNumber(req.batch_portions, 0)} porções`
	}
	return String(quantity)
}

/** Duração em horas e minutos. Vazio (não "0 min") quando não há duração cadastrada. */
export function formatSheetDuration(minutes: number | null | undefined): string {
	if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return ""
	const total = Math.round(minutes)
	const hours = Math.floor(total / 60)
	const rest = total % 60
	if (hours === 0) return `${rest} min`
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * Soma das durações das etapas do fluxo. `null` quando NENHUMA etapa declara duração —
 * zero ali seria "a preparação leva zero minuto", e não "ninguém cronometrou ainda".
 *
 * É uma soma sequencial, não o caminho crítico do DAG: etapas paralelas entram duas vezes.
 * Para a folha é o número conservador certo — quem lê planeja a jornada, e subestimar o
 * tempo de uma preparação é o erro que atrasa a refeição.
 */
export function flowTotalMinutes(steps: readonly SheetFlowStep[]): number | null {
	let total = 0
	let seen = false
	for (const step of steps) {
		const minutes = step.duration_minutes
		if (minutes != null && Number.isFinite(minutes) && minutes > 0) {
			total += minutes
			seen = true
		}
	}
	return seen ? total : null
}

/**
 * Tempo total da PARTE 04, em minutos, na ordem de confiança das fontes:
 *
 *   1. o total declarado no cadastro — é o número que quem elaborou a ficha escreveu;
 *   2. pré-preparo + cocção, quando as DUAS parcelas foram declaradas;
 *   3. a soma das durações das etapas do fluxo de produção;
 *   4. a única parcela declarada, se houver.
 *
 * A parcela sozinha vem DEPOIS do fluxo de propósito. Ela descreve um pedaço da
 * preparação, não a preparação inteira: com só a cocção (40 min) preenchida e um fluxo que
 * soma 240, imprimir 40 no "Tempo total" contradiz a tabela de etapas logo abaixo, no
 * mesmo papel. Só quando não há fluxo é que a parcela é a melhor informação disponível.
 *
 * Zero e `null` são a MESMA coisa aqui: o campo do total nasce em 0 no formulário, e
 * tratá-lo como declaração faria a folha imprimir "0 min" para toda preparação que
 * ninguém cronometrou — apagando as fontes derivadas que existem justamente para esse caso.
 */
export function sheetTotalMinutes(
	declaredTotal: number | null | undefined,
	prePreparationMinutes: number | null | undefined,
	cookingMinutes: number | null | undefined,
	flowMinutes: number | null | undefined
): number | null {
	if (isPositiveMinutes(declaredTotal)) return declaredTotal
	const hasPre = isPositiveMinutes(prePreparationMinutes)
	const hasCooking = isPositiveMinutes(cookingMinutes)
	if (hasPre && hasCooking) return prePreparationMinutes + cookingMinutes
	if (isPositiveMinutes(flowMinutes)) return flowMinutes
	if (hasPre) return prePreparationMinutes
	if (hasCooking) return cookingMinutes
	return null
}

function isPositiveMinutes(value: number | null | undefined): value is number {
	return value != null && Number.isFinite(value) && value > 0
}

/** Nome da etapa: o rótulo digitado, senão o do modelo de etapa que a originou. */
export function flowStepLabel(step: SheetFlowStep): string {
	return step.label?.trim() || step.step_template?.name?.trim() || "Etapa"
}

/** Etapa a que a exigência está amarrada, por id — a folha nomeia a etapa na linha. */
export function stepLabelById(steps: readonly SheetFlowStep[]): Map<string, string> {
	return new Map(steps.map((step) => [step.id, flowStepLabel(step)]))
}

/** Utensílios da etapa, deduplicados e em ordem de cadastro. */
export function flowStepUtensils(step: SheetFlowStep): string[] {
	const names: string[] = []
	for (const link of step.utensils ?? []) {
		const name = link.utensil?.name?.trim()
		if (name && !names.includes(name)) names.push(name)
	}
	return names
}

/**
 * Ordem em que as exigências vão para o PAPEL — não a de cadastro.
 *
 * `loadRequirements` devolve por `created_at`, e a tabela de equipamentos nomeia a etapa de
 * cada linha. Sem reordenar, a folha lista "Cozinhar e montar" (a última etapa) acima de
 * "Refogar temperos" (a primeira) e prescreve uma sequência que ela mesma contradiz na
 * tabela de etapas logo abaixo — a tabela de etapas já sai em ordem de execução. É o mesmo
 * motivo pelo qual as etapas passaram a ser ordenadas por `orderStepsForExecution`: papel e
 * tela não podem prescrever sequências opostas para a mesma preparação.
 *
 * Exigência da preparação inteira (sem etapa) vem primeiro: ela vale do começo ao fim, e
 * abrir a lista por ela é o que a cozinha separa antes de encostar no fluxo.
 *
 * Exigência amarrada a etapa que NÃO está no fluxo recebido (etapa apagada, ou fluxo negado
 * por permissão — a folha imprime as duas Seções mesmo assim) vai para o fim, em bloco e na
 * ordem de cadastro: sem rótulo de etapa na linha, reordenar entre elas embaralharia linhas
 * que quem lê não tem como recolocar.
 *
 * O empate mantém a ordem de cadastro — `Array.prototype.sort` é estável, e é essa a ordem
 * que o editor mostra. Numa ficha sem exigência de etapa nenhuma, a lista sai intacta.
 */
export function orderRequirementsForSheet<T extends { recipe_step_id: string | null }>(requirements: readonly T[], steps: readonly SheetFlowStep[]): T[] {
	// Sem fluxo carregado não há ordem de execução para seguir, e a coluna "Etapa" sai toda em
	// travessão: reordenar ali trocaria linhas visualmente idênticas sem nada na folha que
	// explique a troca. É o caso do fluxo negado por permissão, em que a PARTE 04 imprime
	// assim mesmo.
	if (steps.length === 0) return requirements.slice()

	const positionByStep = new Map(steps.map((step, index) => [step.id, index]))
	const position = (req: T): number => {
		if (req.recipe_step_id == null) return -1
		return positionByStep.get(req.recipe_step_id) ?? steps.length
	}
	return requirements.slice().sort((a, b) => position(a) - position(b))
}

/** Uma linha da PARTE 05: a observação, o equipamento que a originou e a etapa onde ele entra. */
export interface SheetTechnicalNote {
	target: string
	/** Etapa da exigência, quando ela é de etapa e o fluxo foi carregado. */
	step: string | null
	note: string
}

/**
 * Observações técnicas gravadas nas exigências de equipamento — o único texto livre de
 * técnica que o SISUB guarda além do modo de preparo ("cocção sob pressão por 25 min" é o
 * exemplo que o próprio campo sugere). Sai na PARTE 05 com o equipamento que a originou:
 * solta, a observação não diz de qual equipamento ela fala.
 *
 * A etapa entra pelo mesmo motivo que entrou na tabela de equipamentos: duas exigências do
 * mesmo papel em etapas diferentes são a MESMA unidade reusada em sequência, e duas notas de
 * "Fogão industrial" sem a etapa imprimem como instruções concorrentes para um equipamento
 * só. Sem `stepLabels` (ou com etapa fora do fluxo recebido) a nota sai como antes, com o
 * alvo apenas — melhor sem a etapa do que com uma etapa que a folha não consegue nomear.
 */
export function equipmentTechnicalNotes(requirements: readonly SheetEquipmentRequirement[], stepLabels?: ReadonlyMap<string, string>): SheetTechnicalNote[] {
	const notes: SheetTechnicalNote[] = []
	for (const req of requirements) {
		const note = req.notes?.trim()
		if (!note) continue
		const step = req.recipe_step_id != null ? (stepLabels?.get(req.recipe_step_id) ?? null) : null
		notes.push({ target: equipmentTargetLabel(req), step, note })
	}
	return notes
}
