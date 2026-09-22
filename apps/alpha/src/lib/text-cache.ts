/**
 * Cache LRU de texto extraído, com teto por quantidade E por tamanho.
 *
 * Existe para `GET /submissions/:id/text`: a tela pede o texto a cada abertura do
 * documento, e cada pedido baixava o arquivo e refazia a extração inteira — o caminho
 * mais caro do α servido de graça a quem só recarrega a página. O arquivo submetido
 * nunca é regravado (`upsert: false`), então a chave (`storage_path`) não envelhece.
 *
 * Em memória, por processo: com N tasks cada uma aquece o seu. Aceito — perder o cache
 * num deploy custa uma extração, não um dado.
 */
export class TextCache<T = string> {
	private readonly entries = new Map<string, T>()
	private totalChars = 0

	/**
	 * @param sizeOf - Tamanho de um valor, na mesma unidade de `maxChars`. O default mede
	 *   texto; quem guarda estrutura (o chat guarda texto + árvore de seções) informa o seu.
	 */
	constructor(
		private readonly maxEntries: number,
		private readonly maxChars: number,
		private readonly sizeOf: (value: T) => number = (value) => (value as string).length
	) {}

	get(key: string): T | undefined {
		const value = this.entries.get(key)
		if (value === undefined) return undefined
		// Reinserir move para o fim: a ordem de inserção do Map é a ordem de uso.
		this.entries.delete(key)
		this.entries.set(key, value)
		return value
	}

	set(key: string, value: T): void {
		const size = this.sizeOf(value)
		// Texto maior que o teto inteiro não entra: expulsaria todo o resto para caber sozinho.
		if (size > this.maxChars) return

		const previous = this.entries.get(key)
		if (previous !== undefined) {
			this.entries.delete(key)
			this.totalChars -= this.sizeOf(previous)
		}

		this.entries.set(key, value)
		this.totalChars += size

		for (const [oldestKey, oldestValue] of this.entries) {
			if (this.entries.size <= this.maxEntries && this.totalChars <= this.maxChars) break
			this.entries.delete(oldestKey)
			this.totalChars -= this.sizeOf(oldestValue)
		}
	}

	get size(): number {
		return this.entries.size
	}
}
