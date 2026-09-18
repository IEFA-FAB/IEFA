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

export const PAGE_SIZE = 1000
export const IN_CHUNK_SIZE = 100

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/** Lê todas as páginas de uma consulta; erro em qualquer página lança. */
export async function readAllPages<T>(what: string, page: (from: number, to: number) => PageResult, pageSize = PAGE_SIZE): Promise<T[]> {
	const rows: T[] = []
	for (let from = 0; ; from += pageSize) {
		const { data, error } = await page(from, from + pageSize - 1)
		if (error) throw new Error(`Erro ao carregar ${what}: ${error.message}`)
		const batch = (data ?? []) as T[]
		rows.push(...batch)
		if (batch.length < pageSize) return rows
	}
}

/** Igual a `readAllPages`, com os ids do `.in()` fatiados. Lista vazia não consulta. */
export async function readAllPagesIn<T>(
	what: string,
	ids: readonly string[],
	page: (chunk: string[], from: number, to: number) => PageResult,
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
