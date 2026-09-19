/**
 * Duas peças puras para chamadas externas em volume: paralelismo com teto e cache em memória
 * com validade. Usadas na busca de e-mail no GoTrue da tela de acessos
 * (`access-read.server.ts`), testadas aqui sem rede.
 */

/**
 * `fn` sobre cada item com no máximo `limit` chamadas ao mesmo tempo — um worker pega o próximo
 * assim que termina o seu, em vez de lotes que esperam o mais lento. A saída segue a ordem da
 * entrada.
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length)
	let next = 0
	const worker = async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await fn(items[index] as T, index)
		}
	}
	await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
	return results
}

/**
 * Mapa com validade e teto de tamanho, só em memória do processo. Passada a validade a entrada
 * é ausência; cheio, sai a mais antiga (ordem de inserção do `Map`). Nada é gravado.
 */
export function createTtlCache<V>(options: { ttlMs: number; maxEntries: number; now?: () => number }) {
	const now = options.now ?? Date.now
	const entries = new Map<string, { value: V; expires: number }>()
	return {
		get(key: string): V | undefined {
			const entry = entries.get(key)
			if (!entry) return undefined
			if (entry.expires <= now()) {
				entries.delete(key)
				return undefined
			}
			return entry.value
		},
		set(key: string, value: V): void {
			entries.delete(key)
			entries.set(key, { value, expires: now() + options.ttlMs })
			while (entries.size > options.maxEntries) {
				const oldest = entries.keys().next().value
				if (oldest === undefined) break
				entries.delete(oldest)
			}
		},
		get size() {
			return entries.size
		},
	}
}
