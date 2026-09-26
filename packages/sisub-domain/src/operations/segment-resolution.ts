/**
 * Resolução de contratação (segmento) de uma linha do anexo quantitativo.
 *
 * A linha é o ITEM DE COMPRA (ou o insumo, quando ainda não há item de compra): é por ela que o
 * anexo agrega e é ela que entra na ata. Um item de compra pode servir a vários insumos em pastas
 * diferentes (`purchase_item_ingredient` é N:N), então a linha chega com a cadeia de pastas de
 * CADA insumo, da folha para a raiz.
 *
 * Regras, da mais forte para a mais fraca:
 *
 * 1. Regra de ITEM DE COMPRA decide sozinha. Inclusão em duas contratações é conflito; exclusão
 *    tira a contratação da disputa daquela linha, qualquer que seja a pasta.
 * 2. Sem regra de item, cada insumo resolve pela própria cadeia: dentro de uma contratação vale a
 *    regra de pasta mais próxima da folha (especificidade `100 − distância`); a contratação casa
 *    quando a melhor inclusão supera a melhor exclusão (empate: a exclusão vence, é a mais
 *    restritiva). Entre contratações vence a maior especificidade; empate é conflito.
 * 3. Insumos do mesmo item que resolvem para contratações diferentes: conflito. Parte resolve e
 *    parte não: vale a resolvida.
 *
 * Conflito é bloqueante porque o órgão não pode participar de duas atas com o mesmo objeto
 * (Lei 14.133/2021, art. 82, VIII).
 */

export type SegmentRuleMode = "include" | "exclude"

export interface SegmentRuleInput {
	segmentId: string
	mode: SegmentRuleMode
	folderId: string | null
	purchaseItemId: string | null
}

export interface SegmentLineInput {
	purchaseItemId: string | null
	/** Uma cadeia por insumo da linha, da pasta folha para a raiz. Insumo sem pasta = cadeia vazia. */
	folderChains: readonly (readonly string[])[]
}

export type SegmentResolution = { kind: "assigned"; segmentId: string } | { kind: "unassigned" } | { kind: "conflict"; segmentIds: string[] }

const FOLDER_BASE_SCORE = 100

interface IndexedRules {
	/** segmentId → pastas incluídas / excluídas */
	folderInclude: Map<string, Set<string>>
	folderExclude: Map<string, Set<string>>
	/** purchaseItemId → segmentos que incluem / excluem o item */
	itemInclude: Map<string, Set<string>>
	itemExclude: Map<string, Set<string>>
	segments: Set<string>
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
	const set = map.get(key)
	if (set) set.add(value)
	else map.set(key, new Set([value]))
}

/** Indexa as regras uma vez; a resolução roda para centenas de linhas por requisição. */
export function indexSegmentRules(rules: readonly SegmentRuleInput[]): IndexedRules {
	const indexed: IndexedRules = {
		folderInclude: new Map(),
		folderExclude: new Map(),
		itemInclude: new Map(),
		itemExclude: new Map(),
		segments: new Set(),
	}
	for (const rule of rules) {
		indexed.segments.add(rule.segmentId)
		if (rule.purchaseItemId) addTo(rule.mode === "include" ? indexed.itemInclude : indexed.itemExclude, rule.purchaseItemId, rule.segmentId)
		else if (rule.folderId) addTo(rule.mode === "include" ? indexed.folderInclude : indexed.folderExclude, rule.segmentId, rule.folderId)
	}
	return indexed
}

/** Especificidade da regra de pasta mais próxima da folha, ou -1 quando nenhuma casa. */
function bestFolderScore(folders: Set<string> | undefined, chain: readonly string[]): number {
	if (!folders) return -1
	for (let distance = 0; distance < chain.length; distance++) {
		if (folders.has(chain[distance])) return FOLDER_BASE_SCORE - distance
	}
	return -1
}

function resolveChain(chain: readonly string[], rules: IndexedRules, blocked: Set<string>): SegmentResolution {
	let best = -1
	let winners: string[] = []
	for (const segmentId of rules.segments) {
		if (blocked.has(segmentId)) continue
		const include = bestFolderScore(rules.folderInclude.get(segmentId), chain)
		if (include < 0) continue
		const exclude = bestFolderScore(rules.folderExclude.get(segmentId), chain)
		if (exclude >= include) continue
		if (include > best) {
			best = include
			winners = [segmentId]
		} else if (include === best) {
			winners.push(segmentId)
		}
	}
	if (winners.length === 0) return { kind: "unassigned" }
	if (winners.length === 1) return { kind: "assigned", segmentId: winners[0] }
	return { kind: "conflict", segmentIds: winners.toSorted() }
}

export function resolveSegment(line: SegmentLineInput, rules: IndexedRules): SegmentResolution {
	if (line.purchaseItemId) {
		const included = rules.itemInclude.get(line.purchaseItemId)
		if (included && included.size > 0) {
			return included.size === 1 ? { kind: "assigned", segmentId: [...included][0] } : { kind: "conflict", segmentIds: [...included].toSorted() }
		}
	}
	const blocked = (line.purchaseItemId && rules.itemExclude.get(line.purchaseItemId)) || new Set<string>()

	const assigned = new Set<string>()
	const conflicting = new Set<string>()
	const chains = line.folderChains.length > 0 ? line.folderChains : [[]]
	for (const chain of chains) {
		const result = resolveChain(chain, rules, blocked)
		if (result.kind === "assigned") assigned.add(result.segmentId)
		else if (result.kind === "conflict") for (const id of result.segmentIds) conflicting.add(id)
	}

	if (conflicting.size > 0) return { kind: "conflict", segmentIds: [...new Set([...conflicting, ...assigned])].toSorted() }
	if (assigned.size > 1) return { kind: "conflict", segmentIds: [...assigned].toSorted() }
	if (assigned.size === 1) return { kind: "assigned", segmentId: [...assigned][0] }
	return { kind: "unassigned" }
}

/** Cadeia de pastas da folha para a raiz, a partir do mapa `id → parent_id`. Protege contra ciclo. */
export function folderChain(folderId: string | null, parentOf: ReadonlyMap<string, string | null>): string[] {
	const chain: string[] = []
	const seen = new Set<string>()
	let current = folderId
	while (current && !seen.has(current)) {
		chain.push(current)
		seen.add(current)
		current = parentOf.get(current) ?? null
	}
	return chain
}
