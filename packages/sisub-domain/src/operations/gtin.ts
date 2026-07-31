/**
 * Utilitários GTIN (GS1) — identidade comercial de insumos.
 *
 * Regras que este módulo é a fonte de verdade (o banco só valida FORMATO,
 * `CHECK (gtin ~ '^[0-9]{14}$')` — o dígito verificador é validado AQUI):
 *
 *  • Normalização: GTIN-8/12/13/14 → sempre 14 dígitos com pad de zeros à
 *    esquerda. "SEM GTIN" (literal da NF-e) e qualquer formato estranho → null.
 *  • Check digit: algoritmo GS1 — sobre os 13 primeiros dígitos, pesos
 *    3,1,3,1,… da esquerda; dígito = (10 − soma mod 10) mod 10.
 *  • Hierarquia de embalagem: caixa (DUN-14) → unidade interna via
 *    parent_gtin + units_per_parent; a resolução multiplica os fatores até a
 *    folha (unidade que tem conteúdo líquido).
 */

/** Literal usado pela NF-e (det/prod/cEAN) quando o produto não tem GTIN. */
export const SEM_GTIN = "SEM GTIN"

/**
 * Normaliza um código lido (scanner, NF-e, digitação) para GTIN-14.
 * Aceita GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN) e GTIN-14; devolve null para
 * "SEM GTIN", vazio ou formato inválido. NÃO valida o check digit — use
 * `isValidGtin` para o pacote completo.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
	if (raw == null) return null
	const trimmed = raw.trim()
	if (trimmed === "" || trimmed.toUpperCase() === SEM_GTIN) return null
	if (!/^[0-9]{8}$|^[0-9]{12,14}$/.test(trimmed)) return null
	return trimmed.padStart(14, "0")
}

/** Check digit GS1 de um GTIN já normalizado a 14 dígitos. */
export function hasValidCheckDigit(gtin14: string): boolean {
	if (!/^[0-9]{14}$/.test(gtin14)) return false
	let sum = 0
	for (let i = 0; i < 13; i++) {
		const digit = gtin14.charCodeAt(i) - 48
		sum += digit * (i % 2 === 0 ? 3 : 1)
	}
	const check = (10 - (sum % 10)) % 10
	return check === gtin14.charCodeAt(13) - 48
}

/** Normaliza E valida check digit em um passo. null = inválido ou SEM GTIN. */
export function parseGtin(raw: string | null | undefined): string | null {
	const normalized = normalizeGtin(raw)
	if (normalized == null || !hasValidCheckDigit(normalized)) return null
	return normalized
}

export interface GtinHierarchyNode {
	gtin: string
	parentGtin: string | null
	unitsPerParent: number | null
	netContent: number | null
	netContentUnit: string | null
}

export interface ResolvedGtinContent {
	/** GTIN folha (o que carrega o conteúdo líquido). */
	leafGtin: string
	/** Unidades da folha contidas em UMA unidade do GTIN de partida. */
	leafUnitsPerScanned: number
	/** Conteúdo total, na unidade da folha, de UMA unidade do GTIN de partida. */
	totalNetContent: number | null
	netContentUnit: string | null
}

/**
 * Resolve o conteúdo de um GTIN descendo a hierarquia de embalagem até a folha.
 * `parent_gtin` aponta da UNIDADE para a EMBALAGEM que a contém — então descer
 * de uma caixa até a unidade é seguir os FILHOS. Para evitar varrer a tabela,
 * o chamador entrega o subgrafo relevante (nós da cadeia) e este util só faz a
 * matemática, multiplicando `units_per_parent` a cada nível.
 *
 * Retorna null se o GTIN de partida não está no subgrafo ou se há ciclo.
 */
export function resolveGtinContent(startGtin: string, nodes: readonly GtinHierarchyNode[]): ResolvedGtinContent | null {
	const byGtin = new Map(nodes.map((n) => [n.gtin, n]))
	const childrenOf = new Map<string, GtinHierarchyNode[]>()
	for (const node of nodes) {
		if (node.parentGtin != null) {
			const siblings = childrenOf.get(node.parentGtin) ?? []
			siblings.push(node)
			childrenOf.set(node.parentGtin, siblings)
		}
	}

	let current = byGtin.get(startGtin)
	if (!current) return null

	let multiplier = 1
	const visited = new Set<string>([current.gtin])
	// Desce enquanto houver exatamente um filho — embalagem homogênea.
	// (Mais de um filho = embalagem mista, fora do escopo: para na atual.)
	let children = childrenOf.get(current.gtin) ?? []
	while (children.length === 1) {
		const child = children[0]
		if (child == null || visited.has(child.gtin)) return null
		multiplier *= child.unitsPerParent ?? 1
		visited.add(child.gtin)
		current = child
		children = childrenOf.get(current.gtin) ?? []
	}

	return {
		leafGtin: current.gtin,
		leafUnitsPerScanned: multiplier,
		totalNetContent: current.netContent != null ? current.netContent * multiplier : null,
		netContentUnit: current.netContentUnit,
	}
}
