/**
 * Diff entre o estado salvo (baseline) e o rascunho em edição — é o que a lista de
 * "alterações pendentes" mostra ao lado do botão Salvar. Puro de propósito: a mesma
 * função decide se há rascunho a guardar e o que exibir, então os dois não divergem.
 */

export interface DraftChange {
	/** Identificador estável da alteração (campo, ou campo:subchave quando expandido). */
	key: string
	label: string
	from: string
	to: string
}

export interface DraftFieldSpec<V = unknown> {
	label: string
	/** Texto exibido para o valor. Padrão: `formatDraftValue`. */
	format?: (value: V) => string
	/** Igualdade própria — ex.: comparar um objeto só pelo id. Padrão: `isDraftValueEqual`. */
	isEqual?: (a: V, b: V) => boolean
	/** Um campo composto (mapa de nutrientes, lista) vira várias alterações. */
	expand?: (from: V, to: V) => DraftChange[]
}

export type DraftFields<T> = { [K in keyof T]?: DraftFieldSpec<T[K]> }

/** Vazio, nulo e ausente são o mesmo "sem valor" para quem lê a lista. */
export function formatDraftValue(value: unknown): string {
	if (value == null || value === "") return "—"
	if (typeof value === "boolean") return value ? "Sim" : "Não"
	if (typeof value === "number") return value.toLocaleString("pt-BR")
	if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(formatDraftValue).join(", ")
	if (typeof value === "object") return JSON.stringify(value)
	return String(value)
}

/**
 * Igualdade estrutural. `""`, `null` e `undefined` se equivalem: um input limpo e uma
 * coluna nula não são uma alteração a salvar.
 */
export function isDraftValueEqual(a: unknown, b: unknown): boolean {
	const blank = (v: unknown) => v == null || v === ""
	if (blank(a) && blank(b)) return true
	if (a === b) return true
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
	if (Array.isArray(a) !== Array.isArray(b)) return false
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => isDraftValueEqual(item, b[index]))
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	for (const key of keys) {
		if (!isDraftValueEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
	}
	return true
}

/**
 * Alterações de `current` em relação a `baseline`, na ordem de `fields`. Campo sem
 * especificação ainda conta como alteração (rótulo = nome do campo): esquecer de
 * declarar um campo não pode esconder uma mudança que o Salvar vai gravar.
 */
export function computeDraftChanges<T extends Record<string, unknown>>(baseline: T, current: T, fields: DraftFields<T> = {}): DraftChange[] {
	const ordered = [...Object.keys(fields), ...Object.keys(current).filter((key) => !(key in fields))] as (keyof T & string)[]
	const changes: DraftChange[] = []
	for (const key of ordered) {
		const from = baseline[key]
		const to = current[key]
		const spec = fields[key] as DraftFieldSpec | undefined
		if ((spec?.isEqual ?? isDraftValueEqual)(from, to)) continue
		if (spec?.expand) {
			changes.push(...spec.expand(from, to))
			continue
		}
		const format = spec?.format ?? formatDraftValue
		changes.push({ key, label: spec?.label ?? key, from: format(from), to: format(to) })
	}
	return changes
}

/**
 * O rascunho guardado ainda cabe no formulário? Guardado por até 7 dias, ele atravessa
 * publicações que mudam o formulário (campo novo, renomeado). Restaurar um objeto de outra
 * forma deixaria campo `undefined` no form — melhor descartar. Compara as chaves do primeiro
 * nível, que é onde os formulários mudam.
 */
export function hasSameShape(saved: unknown, baseline: Record<string, unknown>): boolean {
	if (!saved || typeof saved !== "object" || Array.isArray(saved)) return false
	const a = Object.keys(saved).sort()
	const b = Object.keys(baseline).sort()
	return a.length === b.length && a.every((key, index) => key === b[index])
}
