/**
 * Leitura PostgREST sem corte calado.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição e NÃO avisa quando
 * corta: a lista chega "completa" e menor. Tela que soma, conta ou decide a
 * partir dessa lista mente sem erro nenhum — foi o caso dos recebimentos e dos
 * itens de nota no painel "A caminho", e dos lotes na tela de vencimentos.
 *
 * E `.in("coluna", ids)` vai inteiro na URL do GET: algumas centenas de UUIDs
 * dão dezenas de KB e a requisição é recusada. Por isso os ids vão em fatias.
 *
 * Quem chama tem de ORDENAR a consulta por uma chave única (`.order("id")`):
 * paginar sem ordem estável repete e pula linhas entre as páginas.
 */

import { publicDbMessage } from "./db-error-message"

export const PAGE_SIZE = 1000
export const IN_CHUNK_SIZE = 100

/** Uma página da consulta. `T` sai da linha que o cliente tipado infere do `select`. */
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Lê todas as páginas de uma consulta; erro em qualquer página lança.
 *
 * Para na página VAZIA e avança pelo que veio, não pelo tamanho pedido. Parar
 * na página "menor que o pedido" só estaria certo com `max_rows` do PostgREST
 * ≥ `pageSize` — e essa é configuração da API, invisível pelo banco. Com
 * `max_rows` menor, toda página vem menor, o laço parava na primeira e o
 * helper cortava calado, que é o defeito que ele existe para impedir. Custa uma
 * requisição a mais no fim.
 */
export async function readAllPages<T>(what: string, page: (from: number, to: number) => PageResult<T>, pageSize = PAGE_SIZE): Promise<T[]> {
	const rows: T[] = []
	for (let from = 0; ; ) {
		const { data, error } = await page(from, from + pageSize - 1)
		if (error) throw new Error(`Erro ao carregar ${what}: ${publicDbMessage(error)}`)
		const batch = data ?? []
		if (batch.length === 0) return rows
		rows.push(...batch)
		from += batch.length
	}
}

/** Igual a `readAllPages`, com os ids do `.in()` fatiados. Lista vazia não consulta. */
export async function readAllPagesIn<T>(
	what: string,
	ids: readonly string[],
	page: (chunk: string[], from: number, to: number) => PageResult<T>,
	chunkSize = IN_CHUNK_SIZE,
	pageSize = PAGE_SIZE
): Promise<T[]> {
	const unique = [...new Set(ids)]
	const rows: T[] = []
	for (let i = 0; i < unique.length; i += chunkSize) {
		const chunk = unique.slice(i, i + chunkSize)
		rows.push(...(await readAllPages<T>(what, (from, to) => page(chunk, from, to), pageSize)))
	}
	return rows
}

/**
 * Lê todas as páginas por KEYSET: cada página pede as linhas com chave MAIOR que a última
 * vista (`.gt(chave, after)`), ordenadas por essa chave única, e para na página vazia.
 *
 * Use em leitura que soma dinheiro. Por OFFSET (`readAllPages`), cada página é outra
 * transação: uma linha inserida antes da fronteira durante a leitura empurra a da fronteira
 * para a página seguinte e ela entra DUAS vezes (o comprometido de uma NE somado em dobro);
 * um delete faz uma sumir. Pela chave, a página seguinte começa depois da última linha vista,
 * qualquer que seja a escrita no meio. A deduplicação por chave fica como defesa.
 *
 * `page(after, pageSize)` aplica `.gt(chave, after)` quando `after` não é nulo, `.order(chave)`
 * e `.limit(pageSize)`. Chave que não avança entre páginas é consulta sem o `.gt`: lança, em
 * vez de repetir a primeira página para sempre.
 */
export async function readAllPagesByKey<T, K extends string | number>(
	what: string,
	page: (after: K | null, pageSize: number) => PageResult<T>,
	keyOf: (row: T) => K,
	pageSize = PAGE_SIZE
): Promise<T[]> {
	const byKey = new Map<K, T>()
	let after: K | null = null
	for (;;) {
		const { data, error } = await page(after, pageSize)
		if (error) throw new Error(`Erro ao carregar ${what}: ${publicDbMessage(error)}`)
		const batch = data ?? []
		if (batch.length === 0) return [...byKey.values()]
		for (const row of batch) {
			const key = keyOf(row)
			if (!byKey.has(key)) byKey.set(key, row)
		}
		const last = keyOf(batch[batch.length - 1] as T)
		if (last === after) throw new Error(`Erro ao carregar ${what}: a paginação não avançou`)
		after = last
	}
}
