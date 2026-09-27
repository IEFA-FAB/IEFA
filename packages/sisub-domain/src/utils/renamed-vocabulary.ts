/**
 * Valor de domínio renomeado no banco compartilhado (change `sisub-ubiquitous-language`, D2 e D4;
 * lote 5): papel da designação, tipo de inventário, alvo da regra de política e tipo de cardápio.
 *
 * O banco é um só, e a `main` em produção lê de volta o que grava. Por isso o rename de valor tem
 * três tempos:
 *
 * 1. **Expand** (20260927100000): o CHECK aceita os dois vocabulários. O código LÊ os dois
 *    (`normalize`, `is`), FILTRA pelos dois (`storedValuesOf`) e GRAVA o antigo (`toStored`): o
 *    código anterior ao deploy não conhece o valor novo, e um valor novo gravado por baixo dele
 *    sumiria da tela dele até o deploy terminar.
 * 2. **Contract** (20260927110000): converte as linhas, aperta o CHECK e o código passa a gravar o
 *    valor novo.
 *
 * O tipo do TypeScript já é o vocabulário novo desde o expand: o valor antigo existe só na
 * fronteira com o banco, e só aqui.
 */
export interface RenamedVocabulary<V extends string> {
	/** Vocabulário do glossário, na ordem de exibição. */
	readonly values: readonly V[]
	/** Valor aceito na ENTRADA (formulário, tool): o novo e, até o contract, o antigo. */
	readonly inputValues: readonly [string, ...string[]]
	/** Valor lido do banco (ou recebido) → vocabulário do glossário; fora dos dois, `null`. */
	normalize(value: string | null | undefined): V | null
	/** Como `normalize`, para valor já validado contra `inputValues`: fora dos dois, lança. */
	parse(value: string): V
	/** O valor lido é `expected`, em qualquer um dos dois vocabulários. */
	is(value: string | null | undefined, expected: V): boolean
	/**
	 * O que se grava no banco para `value`: o antigo até o contract. Valor fora do vocabulário (cópia
	 * crua de uma linha) segue como está: quem decide é o CHECK.
	 */
	toStored(value: V | (string & {})): string
	/** Os valores gravados que significam algum de `values` (para `= any(...)` e `in (...)`). */
	storedValuesOf(values: readonly V[]): string[]
}

export function renamedVocabulary<const V extends string>(values: readonly [V, ...V[]], legacy: Readonly<Record<string, V>>): RenamedVocabulary<V> {
	const known = new Set<string>(values)
	const legacyOf = new Map<V, string>()
	for (const [old, current] of Object.entries(legacy)) legacyOf.set(current, old)

	const normalize = (value: string | null | undefined): V | null => {
		if (value == null) return null
		if (known.has(value)) return value as V
		// `hasOwn`: chave do protótipo (`constructor`, `toString`) não é valor antigo.
		return Object.hasOwn(legacy, value) ? (legacy[value] as V) : null
	}

	return {
		values,
		inputValues: [...values, ...Object.keys(legacy)] as [string, ...string[]],
		normalize,
		parse: (value) => {
			const parsed = normalize(value)
			if (parsed == null) throw new Error(`Valor fora do vocabulário: ${value}`)
			return parsed
		},
		is: (value, expected) => normalize(value) === expected,
		toStored: (value) => legacyOf.get(value as V) ?? value,
		storedValuesOf: (subset) => subset.flatMap((value) => (legacyOf.has(value) ? [value, legacyOf.get(value) as string] : [value])),
	}
}
