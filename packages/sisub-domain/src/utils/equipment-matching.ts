/**
 * Atendimento de equipamento: a cozinha X consegue produzir a preparação Y?
 *
 * Função PURA — nenhum acesso a banco, para poder ser testada por exemplo e por mutação.
 *
 * O problema não é "somar equipamentos". Um iVario Pro 2-S sabe ser chapa, panela de pressão,
 * caldeirão e fritadeira, mas tem DUAS cubas: numa preparação que exige chapa *e* pressão *e*
 * fritadeira ao mesmo tempo, ele atende duas exigências, não quatro. Contar por papel
 * superestimaria; contar o equipamento uma vez subestimaria o fogão de seis bocas.
 *
 * Modelagem: cada zona independente do equipamento é um SLOT (cuba, boca, câmara), e cada
 * unidade exigida é uma DEMANDA (uma exigência de `quantity: 2` gera duas demandas). Uma
 * demanda casa com um slot quando o slot serve o alvo (papel ou modelo) e cumpre a capacidade
 * mínima. Um slot atende no máximo uma demanda. Isso é emparelhamento máximo em grafo
 * bipartido — resolvido por Kuhn (caminhos aumentantes), O(V·E), suficiente para o porte real
 * (dezenas de slots, dezenas de demandas).
 *
 * Quando NÃO dá para atender tudo, o emparelhamento maximiza o total atendido; qual exigência
 * fica descoberta, entre as que disputam os mesmos slots, é arbitrário (mas determinístico:
 * depende só da ordem de entrada). O número que importa — quantas unidades faltam — é exato.
 *
 * VOLUME é outra pergunta, e a resposta NÃO é multiplicar equipamento. 900 porções de uma
 * preparação que rende 100 são nove bateladas: um forno nove vezes, ou três fornos três vezes.
 * Por isso a lista mínima descreve UMA batelada, e o volume vira `maxParallelBatches` (quantas
 * cabem ao mesmo tempo) e `cycles` (quantas rodadas em série). Somar as bateladas na exigência
 * diria que a cozinha "não atende" por não ter nove fornos — e ela atende, em nove ciclos.
 */

/** Uma zona independente de um equipamento instalado. Uma unidade de N slots gera N destes. */
export interface EquipmentSlot {
	unitId: string
	unitLabel: string
	modelId: string
	/** 0-based, só para distinguir as zonas da mesma unidade. */
	slotIndex: number
	/** Papéis EFETIVOS: os do modelo ∪ adições da unidade − remoções da unidade. */
	roleIds: readonly string[]
	/**
	 * Capacidade DESTA zona, não do equipamento inteiro. Um iVario Pro 2-S entra como dois slots
	 * de 25 L — nunca um de 50: somar as cubas faria uma exigência de "panela de 40 L" casar com
	 * um equipamento que só tem panelas de 25.
	 */
	capacityLiters: number | null
	capacityGn: number | null
}

/** Uma linha da lista mínima da preparação. `roleId` XOR `modelId` (garantido pelo schema/DB). */
export interface EquipmentDemandSpec {
	requirementId: string
	roleId: string | null
	modelId: string | null
	/** Unidades simultâneas exigidas POR BATELADA (ou no total, quando `scalesWithBatch` é false). */
	quantity: number
	minCapacityLiters: number | null
	minCapacityGn: number | null
	/**
	 * `false` = a exigência não acompanha o volume: uma seladora a vácuo atende a leva inteira,
	 * dobrar a produção não pede duas. Default `true`.
	 */
	scalesWithBatch?: boolean
}

export interface RequirementFitness {
	requirementId: string
	required: number
	satisfied: number
	/** required − satisfied. > 0 = a cozinha não atende esta linha. */
	missing: number
	/** Unidades escolhidas para esta exigência (uma entrada por slot casado). */
	assignedUnitIds: string[]
}

export interface EquipmentFitness {
	/** true = UMA batelada da lista mínima é atendida simultaneamente pelo parque informado. */
	satisfied: boolean
	requirements: RequirementFitness[]
	/** Total de unidades faltantes somando todas as exigências (de uma batelada). */
	missingTotal: number
	/** Quantas bateladas o parque roda AO MESMO TEMPO. 0 = não atende nem uma. */
	maxParallelBatches: number
	/**
	 * Quantas rodadas em série para vencer o volume pedido: `ceil(batches / maxParallelBatches)`.
	 * 1 quando o volume cabe de uma vez; `null` quando o parque não atende nem uma batelada.
	 */
	cycles: number | null
}

/**
 * Um slot serve uma demanda?
 *
 * Capacidade desconhecida (null) com mínimo exigido REPROVA de propósito: dizer "atende" com
 * base em dado ausente é o modo de falha caro (a cozinha descobre na hora da produção). O modo
 * de falha barato é o usuário completar a capacidade no cadastro do modelo.
 */
export function slotServesDemand(slot: EquipmentSlot, demand: EquipmentDemandSpec): boolean {
	if (demand.modelId != null && slot.modelId !== demand.modelId) return false
	if (demand.roleId != null && !slot.roleIds.includes(demand.roleId)) return false
	if (demand.minCapacityLiters != null && (slot.capacityLiters == null || slot.capacityLiters < demand.minCapacityLiters)) return false
	if (demand.minCapacityGn != null && (slot.capacityGn == null || slot.capacityGn < demand.minCapacityGn)) return false
	return true
}

/**
 * Emparelha as demandas das exigências contra os slots do parque instalado.
 *
 * @param requirements - lista mínima da preparação; `quantity` vira N demandas.
 * @param slots - zonas independentes das unidades ATIVAS da cozinha (o chamador filtra status).
 */
export function evaluateEquipmentFitness(
	requirements: readonly EquipmentDemandSpec[],
	slots: readonly EquipmentSlot[],
	options: { batches?: number } = {}
): EquipmentFitness {
	const batches = Math.max(1, Math.trunc(options.batches ?? 1))
	const single = matchOnce(requirements, slots, 1)

	// Quantas bateladas cabem SIMULTANEAMENTE. Busca binária sobre o mesmo emparelhamento com as
	// demandas multiplicadas: é a definição honesta, porque respeita a disputa ENTRE exigências
	// (dividir slots por exigência, isoladamente, ignoraria que elas brigam pelos mesmos).
	let maxParallelBatches = single.satisfied ? 1 : 0
	if (single.satisfied && batches > 1) {
		let low = 1
		let high = batches
		while (low < high) {
			const mid = Math.ceil((low + high) / 2)
			if (matchOnce(requirements, slots, mid).satisfied) low = mid
			else high = mid - 1
		}
		maxParallelBatches = low
	}

	const fitness: RequirementFitness[] = requirements.map((req, index) => ({
		requirementId: req.requirementId,
		required: req.quantity,
		satisfied: single.satisfiedByRequirement[index],
		missing: req.quantity - single.satisfiedByRequirement[index],
		assignedUnitIds: single.assignedByRequirement[index],
	}))

	const missingTotal = fitness.reduce((acc, r) => acc + r.missing, 0)
	return {
		satisfied: missingTotal === 0,
		requirements: fitness,
		missingTotal,
		maxParallelBatches,
		cycles: maxParallelBatches > 0 ? Math.ceil(batches / maxParallelBatches) : null,
	}
}

/** Um emparelhamento com as demandas multiplicadas por `factor` bateladas simultâneas. */
function matchOnce(
	requirements: readonly EquipmentDemandSpec[],
	slots: readonly EquipmentSlot[],
	factor: number
): { satisfied: boolean; satisfiedByRequirement: number[]; assignedByRequirement: string[][] } {
	// Cada demanda é uma cópia da exigência; guarda o índice da exigência de origem.
	const demandOwner: number[] = []
	for (const [i, req] of requirements.entries()) {
		const copies = req.quantity * (req.scalesWithBatch === false ? 1 : factor)
		for (let n = 0; n < copies; n++) demandOwner.push(i)
	}

	// Adjacência demanda → slots compatíveis.
	const adjacency = demandOwner.map((ownerIdx) => {
		const demand = requirements[ownerIdx]
		const compatible: number[] = []
		for (const [slotIdx, slot] of slots.entries()) {
			if (slotServesDemand(slot, demand)) compatible.push(slotIdx)
		}
		return compatible
	})

	// Kuhn: para cada demanda, procura um caminho aumentante realocando quem já ocupa o slot.
	const slotTakenBy: number[] = new Array(slots.length).fill(-1)
	const tryAssign = (demandIdx: number, seen: boolean[]): boolean => {
		for (const slotIdx of adjacency[demandIdx]) {
			if (seen[slotIdx]) continue
			seen[slotIdx] = true
			if (slotTakenBy[slotIdx] === -1 || tryAssign(slotTakenBy[slotIdx], seen)) {
				slotTakenBy[slotIdx] = demandIdx
				return true
			}
		}
		return false
	}
	for (let demandIdx = 0; demandIdx < demandOwner.length; demandIdx++) {
		tryAssign(demandIdx, new Array(slots.length).fill(false))
	}

	const satisfiedByRequirement = requirements.map(() => 0)
	const assignedByRequirement: string[][] = requirements.map(() => [])
	for (const [slotIdx, demandIdx] of slotTakenBy.entries()) {
		if (demandIdx === -1) continue
		const owner = demandOwner[demandIdx]
		satisfiedByRequirement[owner] += 1
		assignedByRequirement[owner].push(slots[slotIdx].unitId)
	}

	const matched = satisfiedByRequirement.reduce((acc, n) => acc + n, 0)
	return { satisfied: matched === demandOwner.length, satisfiedByRequirement, assignedByRequirement }
}

/** Linha da lista mínima reduzida ao que decide concorrência. */
export interface ConcurrencyRow {
	requirementId: string
	/** Alvo + restrições: duas linhas com a mesma chave disputam o mesmo equipamento. */
	targetKey: string
	/** Nível topológico da etapa; `null` = exigência da preparação inteira (sempre concorrente). */
	level: number | null
	quantity: number
}

/**
 * Escolhe quais exigências disputam equipamento AO MESMO TEMPO.
 *
 * Exigência sem etapa é piso: vale o tempo todo. Exigência amarrada a etapa concorre só com as
 * do MESMO nível do DAG — assar na etapa 3 e gratinar na etapa 7 são o mesmo forno usado duas
 * vezes, não dois fornos. Por alvo, sobrevive o nível de maior demanda; as demais linhas do
 * mesmo alvo são reaproveitamento sequencial.
 *
 * Receita sem fluxo cai no caso "todas sem etapa" e nada muda em relação a somar tudo.
 */
export function selectConcurrentRequirements(rows: readonly ConcurrencyRow[]): Set<string> {
	const byTarget = new Map<string, ConcurrencyRow[]>()
	for (const row of rows) {
		const list = byTarget.get(row.targetKey) ?? []
		list.push(row)
		byTarget.set(row.targetKey, list)
	}

	const concurrent = new Set<string>()
	for (const list of byTarget.values()) {
		const perLevel = new Map<number, ConcurrencyRow[]>()
		for (const row of list) {
			if (row.level == null) {
				concurrent.add(row.requirementId)
				continue
			}
			const bucket = perLevel.get(row.level) ?? []
			bucket.push(row)
			perLevel.set(row.level, bucket)
		}

		let peak: ConcurrencyRow[] | null = null
		let peakQty = -1
		// Ordem de desempate estável: menor nível vence, para o relatório não oscilar entre runs.
		for (const level of [...perLevel.keys()].sort((a, b) => a - b)) {
			const bucket = perLevel.get(level) as ConcurrencyRow[]
			const qty = bucket.reduce((acc, r) => acc + r.quantity, 0)
			if (qty > peakQty) {
				peakQty = qty
				peak = bucket
			}
		}
		for (const row of peak ?? []) concurrent.add(row.requirementId)
	}
	return concurrent
}

/**
 * Papéis efetivos de uma unidade: os do modelo, mais as adições da unidade, menos as remoções.
 *
 * A remoção vence a adição para o mesmo papel — não existe linha ativa com os dois valores
 * (índice único por unidade+papel), então o caso só aparece com dado inconsistente, e negar é
 * o lado seguro.
 */
export function resolveUnitRoleIds(modelRoleIds: readonly string[], overrides: readonly { roleId: string; available: boolean }[]): string[] {
	const removed = new Set(overrides.filter((o) => !o.available).map((o) => o.roleId))
	const effective = new Set(modelRoleIds.filter((id) => !removed.has(id)))
	for (const override of overrides) {
		if (override.available && !removed.has(override.roleId)) effective.add(override.roleId)
	}
	return [...effective]
}

/**
 * Expande uma unidade instalada nos seus slots (uma entrada por zona independente).
 * `capacityLiters`/`capacityGn` são POR ZONA — o modelo guarda `slot_capacity_*` justamente
 * para que replicá-los aqui não invente capacidade.
 */
export function expandUnitSlots(unit: {
	unitId: string
	unitLabel: string
	modelId: string
	slots: number
	roleIds: readonly string[]
	capacityLiters: number | null
	capacityGn: number | null
}): EquipmentSlot[] {
	const count = Math.max(1, Math.trunc(unit.slots))
	return Array.from({ length: count }, (_, slotIndex) => ({
		unitId: unit.unitId,
		unitLabel: unit.unitLabel,
		modelId: unit.modelId,
		slotIndex,
		roleIds: unit.roleIds,
		capacityLiters: unit.capacityLiters,
		capacityGn: unit.capacityGn,
	}))
}
