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
	quantity: number
	minCapacityLiters: number | null
	minCapacityGn: number | null
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
	/** true = toda a lista mínima é atendida SIMULTANEAMENTE pelo parque informado. */
	satisfied: boolean
	requirements: RequirementFitness[]
	/** Total de unidades faltantes somando todas as exigências. */
	missingTotal: number
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
export function evaluateEquipmentFitness(requirements: readonly EquipmentDemandSpec[], slots: readonly EquipmentSlot[]): EquipmentFitness {
	// Cada demanda é uma cópia da exigência; guarda o índice da exigência de origem.
	const demandOwner: number[] = []
	for (const [i, req] of requirements.entries()) {
		for (let n = 0; n < req.quantity; n++) demandOwner.push(i)
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

	const fitness: RequirementFitness[] = requirements.map((req) => ({
		requirementId: req.requirementId,
		required: req.quantity,
		satisfied: 0,
		missing: req.quantity,
		assignedUnitIds: [],
	}))
	for (const [slotIdx, demandIdx] of slotTakenBy.entries()) {
		if (demandIdx === -1) continue
		const row = fitness[demandOwner[demandIdx]]
		row.satisfied += 1
		row.missing -= 1
		row.assignedUnitIds.push(slots[slotIdx].unitId)
	}

	const missingTotal = fitness.reduce((acc, r) => acc + r.missing, 0)
	return { satisfied: missingTotal === 0, requirements: fitness, missingTotal }
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
