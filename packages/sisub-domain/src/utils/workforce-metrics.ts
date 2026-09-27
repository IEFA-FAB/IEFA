/**
 * Indicadores da matriz de efetivo — funções PURAS.
 *
 * Ficam fora das operations de propósito: são a parte que precisa de teste denso e que
 * não deve depender de banco. As operations buscam as linhas e chamam daqui.
 *
 * Três regras que o cálculo respeita, e que a planilha original não conseguia:
 *
 *  1. AUSÊNCIA ≠ ZERO. Refeitório sem resposta tem `total: null`, não 0 — somar branco como
 *     zero faria a média nacional despencar a cada refeitório que não respondeu, e 38 dos 66
 *     não responderam na coleta de agosto/2026.
 *  2. TOTAL DECLARADO NÃO MANDA. A soma das parcelas é a fonte; o total do gestor entra
 *     como conferência (`declaredTotalDiverges`). O HFAG declara 20 e soma 22.
 *  3. NOMINAL ≠ DISPONÍVEL. Afastado e desviado de função continuam contados no nominal
 *     (é assim que a matriz pede), mas saem do disponível — que é o número que responde
 *     "quantos militares guarnecem este refeitório hoje".
 */

export type WorkforceCategoryRef = {
	code: string
	name: string
	sort_order: number
	is_career: boolean
	is_technical: boolean
}

export type WorkforceNoteRef = {
	kind: string
	quantity: number | null
}

export type MessHallWorkforceInput = {
	messHallWorkforceId: number
	code: string
	displayName: string
	eloCode: string
	unitId: number
	messHallId: number | null
	/** Só as categorias efetivamente preenchidas. Categoria ausente = branco. */
	headcounts: Record<string, number>
	declaredTotal: number | null
	notes: WorkforceNoteRef[]
	answered: boolean
}

export type MessHallWorkforceMetrics = {
	messHallWorkforceId: number
	code: string
	displayName: string
	eloCode: string
	unitId: number
	messHallId: number | null
	answered: boolean
	/**
	 * Códigos das categorias efetivamente preenchidas, na ordem do catálogo. É o que
	 * separa "não informado" de "informado como zero" — a tela mostra "—" no primeiro e
	 * "0" no segundo, e a matriz pede explicitamente que o gestor escreva o zero.
	 */
	filledCategories: string[]
	/** Soma das parcelas preenchidas. null quando o refeitório não respondeu. */
	total: number | null
	declaredTotal: number | null
	declaredTotalDiverges: boolean
	/** Nutricionistas + técnicos em nutrição e dietética. */
	technicalStaff: number
	hasNutritionist: boolean
	hasTechnicalStaff: boolean
	careerStaff: number
	temporaryStaff: number
	/** Fração de carreira sobre o total. null quando não respondeu ou o total é zero. */
	careerRatio: number | null
	/** Afastados + desviados de função, conforme observações do gestor. */
	unavailable: number
	/** total − indisponíveis. null quando não respondeu. */
	availableTotal: number | null
	outsourced: number
}

const NUTRITIONIST_CODE = "nut_qocon"
const UNAVAILABLE_KINDS = new Set(["leave", "reassigned"])

function sumNotes(notes: WorkforceNoteRef[], kinds: (kind: string) => boolean): number {
	return notes.reduce((acc, n) => (kinds(n.kind) ? acc + (n.quantity ?? 0) : acc), 0)
}

export function computeMessHallWorkforceMetrics(input: MessHallWorkforceInput, categories: WorkforceCategoryRef[]): MessHallWorkforceMetrics {
	const byCode = new Map(categories.map((c) => [c.code, c]))
	const filled = Object.entries(input.headcounts).filter(([code]) => byCode.has(code))

	const total = input.answered ? filled.reduce((acc, [, n]) => acc + n, 0) : null
	const careerStaff = filled.reduce((acc, [code, n]) => (byCode.get(code)?.is_career ? acc + n : acc), 0)
	const technicalStaff = filled.reduce((acc, [code, n]) => (byCode.get(code)?.is_technical ? acc + n : acc), 0)
	const temporaryStaff = (total ?? 0) - careerStaff

	const unavailable = sumNotes(input.notes, (k) => UNAVAILABLE_KINDS.has(k))
	const outsourced = sumNotes(input.notes, (k) => k === "outsourced")

	return {
		messHallWorkforceId: input.messHallWorkforceId,
		code: input.code,
		displayName: input.displayName,
		eloCode: input.eloCode,
		unitId: input.unitId,
		messHallId: input.messHallId,
		answered: input.answered,
		filledCategories: filled.map(([code]) => code).sort((a, b) => (byCode.get(a)?.sort_order ?? 0) - (byCode.get(b)?.sort_order ?? 0)),
		total,
		declaredTotal: input.declaredTotal,
		declaredTotalDiverges: total !== null && input.declaredTotal !== null && input.declaredTotal !== total,
		technicalStaff,
		hasNutritionist: (input.headcounts[NUTRITIONIST_CODE] ?? 0) > 0,
		hasTechnicalStaff: technicalStaff > 0,
		careerStaff,
		temporaryStaff: input.answered ? temporaryStaff : 0,
		careerRatio: total !== null && total > 0 ? careerStaff / total : null,
		unavailable,
		// Nunca deixa o disponível abaixo de zero: o gestor pode declarar mais afastados do
		// que o nominal quando o afastado não foi contabilizado nas parcelas.
		availableTotal: total === null ? null : Math.max(0, total - unavailable),
		outsourced,
	}
}

export type WorkforceGroupSummary = {
	key: string
	messHalls: number
	answeredMessHalls: number
	/** Fração de refeitórios que responderam. 0 quando o grupo está vazio. */
	responseRate: number
	total: number
	availableTotal: number
	careerStaff: number
	technicalStaff: number
	outsourced: number
	unavailable: number
	/** Refeitórios que responderam e declararam nenhum nutricionista. */
	messHallsWithoutNutritionist: number
	/** Refeitórios que responderam e não têm nutricionista nem TND. */
	messHallsWithoutTechnicalStaff: number
}

/** Agrega por uma chave qualquer (ELO, unidade, rede inteira). */
export function summarizeWorkforce(metrics: MessHallWorkforceMetrics[], key: string): WorkforceGroupSummary {
	const answered = metrics.filter((m) => m.answered)
	return {
		key,
		messHalls: metrics.length,
		answeredMessHalls: answered.length,
		responseRate: metrics.length === 0 ? 0 : answered.length / metrics.length,
		total: answered.reduce((a, m) => a + (m.total ?? 0), 0),
		availableTotal: answered.reduce((a, m) => a + (m.availableTotal ?? 0), 0),
		careerStaff: answered.reduce((a, m) => a + m.careerStaff, 0),
		technicalStaff: answered.reduce((a, m) => a + m.technicalStaff, 0),
		outsourced: answered.reduce((a, m) => a + m.outsourced, 0),
		unavailable: answered.reduce((a, m) => a + m.unavailable, 0),
		messHallsWithoutNutritionist: answered.filter((m) => !m.hasNutritionist).length,
		messHallsWithoutTechnicalStaff: answered.filter((m) => !m.hasTechnicalStaff).length,
	}
}

export function groupWorkforceBy(metrics: MessHallWorkforceMetrics[], pick: (m: MessHallWorkforceMetrics) => string): WorkforceGroupSummary[] {
	const buckets = new Map<string, MessHallWorkforceMetrics[]>()
	for (const m of metrics) {
		const key = pick(m)
		const bucket = buckets.get(key)
		if (bucket) bucket.push(m)
		else buckets.set(key, [m])
	}
	return [...buckets.entries()].map(([key, rows]) => summarizeWorkforce(rows, key)).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

/**
 * Refeitórios sem cobertura técnica, do maior efetivo para o menor — a fila de prioridade
 * para pedido de vaga. Só considera quem respondeu: silêncio não é ausência de nutricionista.
 */
export function coverageGaps(metrics: MessHallWorkforceMetrics[]): MessHallWorkforceMetrics[] {
	return metrics.filter((m) => m.answered && !m.hasTechnicalStaff).sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
}

export type MealLoadInput = {
	/**
	 * REFEIÇÕES registradas no período no refeitório cadastrado (`mess_hall_id`). Uma linha de
	 * `meal_presences` é (usuário, dia, refeição): quem almoça e janta conta duas vezes.
	 * É o numerador certo para carga de trabalho — a guarnição produz refeições, não pessoas.
	 */
	presences: number
	/** Dias distintos com registro. Zero = o refeitório não usa o registro de presença. */
	activeDays: number
}

/**
 * Refeições servidas por dia, por militar de cozinha disponível.
 *
 * REFEIÇÕES, não comensais distintos: o denominador de pessoas seria menor e o número
 * pareceria mais brando do que a carga real. Devolve null — e não zero — quando falta
 * qualquer insumo: refeitório do levantamento sem vínculo com o cadastro, sem registro de presença ou sem
 * efetivo declarado. Zero leria como "produtividade nula", que é o oposto de "não sei".
 */
export function mealsPerWorker(metrics: MessHallWorkforceMetrics, load: MealLoadInput | null): number | null {
	if (!load || load.activeDays <= 0) return null
	const staff = metrics.availableTotal
	if (staff === null || staff <= 0) return null
	return load.presences / load.activeDays / staff
}
