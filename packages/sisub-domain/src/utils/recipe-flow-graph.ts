/**
 * Validação pura do grafo do Fluxo de Produção — sem I/O, sem Drizzle.
 *
 * Reutilizada nos dois lados: o domínio chama no `saveRecipeFlow` (porta dura) e o
 * cliente (xyflow) re-exporta para o indicador de balanço ao vivo. Opera sobre um
 * shape estrutural mínimo (não depende dos tipos zod), então o cliente pode passar
 * seu próprio modelo de nós.
 */

/** Shape mínimo de uma etapa para análise do grafo. */
export interface FlowGraphStep {
	clientId: string
	outputs: { clientId: string; isFinal: boolean }[]
	inputs: { recipeIngredientId?: string | null; sourceOutputClientId?: string | null; quantity?: number | null }[]
}

/** Insumo declarado da receita (recipe_ingredients) usado no balanço de materiais. */
export interface DeclaredIngredient {
	recipeIngredientId: string
	netQuantity: number
	isOptional: boolean
}

const EPS = 1e-6

/**
 * Detecta ciclo no grafo (edges: etapa-produtora → etapa-consumidora). Retorna os
 * clientIds que formam o ciclo (incluindo self-loop) ou `null` se for um DAG válido.
 */
export function findFlowCycle(steps: FlowGraphStep[]): string[] | null {
	const outputToStep = new Map<string, string>()
	for (const s of steps) for (const o of s.outputs) outputToStep.set(o.clientId, s.clientId)

	const adj = new Map<string, Set<string>>()
	for (const s of steps) adj.set(s.clientId, new Set())
	for (const s of steps) {
		for (const inp of s.inputs) {
			if (inp.sourceOutputClientId == null) continue
			const producer = outputToStep.get(inp.sourceOutputClientId)
			if (producer == null) continue
			if (producer === s.clientId) return [s.clientId] // self-loop
			adj.get(producer)?.add(s.clientId)
		}
	}

	const WHITE = 0
	const GRAY = 1
	const BLACK = 2
	const color = new Map<string, number>()
	for (const s of steps) color.set(s.clientId, WHITE)
	const stack: string[] = []
	let cycle: string[] | null = null

	const visit = (u: string): boolean => {
		color.set(u, GRAY)
		stack.push(u)
		for (const v of adj.get(u) ?? []) {
			if (color.get(v) === GRAY) {
				cycle = stack.slice(stack.indexOf(v))
				return true
			}
			if (color.get(v) === WHITE && visit(v)) return true
		}
		color.set(u, BLACK)
		stack.pop()
		return false
	}

	for (const s of steps) {
		if (color.get(s.clientId) === WHITE && visit(s.clientId)) break
	}
	return cycle
}

/** clientIds das saídas marcadas como final (a própria preparação). */
export function collectFinalOutputs(steps: FlowGraphStep[]): string[] {
	const finals: string[] = []
	for (const s of steps) for (const o of s.outputs) if (o.isFinal) finals.push(o.clientId)
	return finals
}

export type BalanceStatus = "ok" | "under" | "over" | "unconsumed"

export interface IngredientBalance {
	recipeIngredientId: string
	declared: number
	consumed: number
	isOptional: boolean
	status: BalanceStatus
}

/**
 * Soma o consumo de cada insumo cru pelas etapas e compara com o declarado.
 *   over        → consumo > declarado (erro de material: bloqueia o save)
 *   unconsumed  → consumo ~0          (aviso; bloqueia só insumo obrigatório em fase futura)
 *   under       → 0 < consumo < decl. (aviso)
 *   ok          → consumo ≈ declarado
 */
export function computeMaterialBalance(steps: FlowGraphStep[], declared: DeclaredIngredient[]): IngredientBalance[] {
	const consumed = new Map<string, number>()
	for (const s of steps) {
		for (const inp of s.inputs) {
			if (inp.recipeIngredientId == null) continue
			consumed.set(inp.recipeIngredientId, (consumed.get(inp.recipeIngredientId) ?? 0) + (inp.quantity ?? 0))
		}
	}

	return declared.map((d) => {
		const c = consumed.get(d.recipeIngredientId) ?? 0
		let status: BalanceStatus
		if (c > d.netQuantity + EPS) status = "over"
		else if (c <= EPS) status = "unconsumed"
		else if (c < d.netQuantity - EPS) status = "under"
		else status = "ok"
		return { recipeIngredientId: d.recipeIngredientId, declared: d.netQuantity, consumed: c, isOptional: d.isOptional, status }
	})
}

export interface FlowValidationResult {
	/** Violações que DEVEM bloquear o save. */
	errors: string[]
	/** Avisos (não bloqueiam na fase 1) — ex.: insumo obrigatório não totalmente consumido. */
	warnings: string[]
	balance: IngredientBalance[]
}

/**
 * Valida o grafo inteiro. `declaredIds` é o conjunto de recipe_ingredient_id válidos
 * da receita (para detectar referência a insumo inexistente).
 *
 * Regras de bloqueio (errors): clientId/saída duplicados, fonte de input inexistente,
 * insumo cru fora da receita, ciclo, !=1 saída final (quando há etapas), consumo > declarado.
 * Avisos (warnings): insumo obrigatório sub/não-consumido.
 */
export function validateFlow(steps: FlowGraphStep[], declared: DeclaredIngredient[]): FlowValidationResult {
	const errors: string[] = []
	const warnings: string[] = []
	const declaredIds = new Set(declared.map((d) => d.recipeIngredientId))

	// clientIds de etapa únicos
	const stepIds = new Set<string>()
	for (const s of steps) {
		if (stepIds.has(s.clientId)) errors.push(`etapa duplicada: ${s.clientId}`)
		stepIds.add(s.clientId)
	}

	// clientIds de saída únicos (globalmente)
	const outputIds = new Set<string>()
	for (const s of steps) {
		for (const o of s.outputs) {
			if (outputIds.has(o.clientId)) errors.push(`saída duplicada: ${o.clientId}`)
			outputIds.add(o.clientId)
		}
	}

	// fontes de input resolvem
	for (const s of steps) {
		for (const inp of s.inputs) {
			const hasIngredient = inp.recipeIngredientId != null
			const hasSource = inp.sourceOutputClientId != null
			if (hasIngredient === hasSource) {
				errors.push(`input da etapa ${s.clientId} precisa de exatamente uma fonte`)
				continue
			}
			if (hasIngredient && !declaredIds.has(inp.recipeIngredientId as string)) {
				errors.push(`input referencia insumo fora da receita: ${inp.recipeIngredientId}`)
			}
			if (hasSource && !outputIds.has(inp.sourceOutputClientId as string)) {
				errors.push(`input referencia saída inexistente: ${inp.sourceOutputClientId}`)
			}
		}
	}

	// exatamente 1 saída final (só quando há etapas)
	if (steps.length > 0) {
		const finals = collectFinalOutputs(steps)
		if (finals.length === 0) errors.push("o fluxo precisa de exatamente 1 saída final (a preparação)")
		else if (finals.length > 1) errors.push(`o fluxo tem ${finals.length} saídas finais; deve haver exatamente 1`)
	}

	// ciclo
	const cycle = findFlowCycle(steps)
	if (cycle) errors.push(`o fluxo tem um ciclo: ${cycle.join(" → ")}`)

	// balanço de materiais
	const balance = computeMaterialBalance(steps, declared)
	for (const b of balance) {
		if (b.status === "over") {
			errors.push(`insumo ${b.recipeIngredientId} consome ${b.consumed} > ${b.declared} declarado`)
		} else if (!b.isOptional && (b.status === "unconsumed" || b.status === "under")) {
			warnings.push(`insumo obrigatório ${b.recipeIngredientId} não totalmente consumido (${b.consumed}/${b.declared})`)
		}
	}

	return { errors, warnings, balance }
}
