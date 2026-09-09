/**
 * Leitura de query string das rotas de leitura da API.
 *
 * Puro de propósito: `factory.ts` e `routes/catalog.ts` compartilham a MESMA semântica de
 * `limit`, `order` e lista separada por vírgula, mas o factory importa o client Supabase no
 * topo do módulo (e com ele o `env.ts`, que valida credencial na carga). Um teste que só
 * quisesse checar o clamp do `limit` teria que fabricar credencial para importar o arquivo —
 * exatamente a armadilha de env que a suíte do monorepo já fechou. Estes helpers ficam fora
 * desse caminho.
 */

/** Regra de ordenação do PostgREST: coluna + direção. */
export type OrderRule = { column: string; ascending?: boolean | null }

export function toInt(v: string | null | undefined, d: number) {
	const n = v ? parseInt(v, 10) : NaN
	return Number.isFinite(n) ? n : d
}

/**
 * `limit` sempre entre 1 e `max`. Rota pública sem teto vira dump do banco: o clamp é o
 * único ponto que impede `?limit=999999999` de virar um `select` da tabela inteira.
 */
export function clampLimit(raw: string | null | undefined, fallback: number, max: number) {
	return Math.min(Math.max(1, toInt(raw, fallback)), max)
}

/** `offset` não negativo. Valor inválido volta para a primeira página, nunca para um índice negativo. */
export function clampOffset(raw: string | null | undefined) {
	return Math.max(0, toInt(raw, 0))
}

export function commaListToArray(v: string) {
	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
}

export function parseOrderParam(v: string | null | undefined): OrderRule[] {
	if (!v) return []
	return v
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const [col, dir] = part.split(":").map((s) => s.trim())
			return {
				column: col,
				ascending: dir ? dir.toLowerCase() !== "desc" : true,
			}
		})
}

export function dayBounds(dateStr: string) {
	const start = `${dateStr}T00:00:00.000`
	const end = `${dateStr}T23:59:59.999`
	return { start, end }
}

/**
 * Mesma sintaxe do `order` das rotas antigas, mas com allow-list de colunas.
 *
 * Nas rotas antigas qualquer coluna serve para ordenar, inclusive coluna que NÃO está na
 * projeção — quem consulta descobre a existência dela pelo erro, e ordena por dado que a rota
 * decidiu não publicar. Numa rota anônima isso é superfície de graça: aqui coluna fora da
 * allow-list vira 400, não um 500 do PostgREST.
 */
export function parseSortableOrderParam(
	v: string | null | undefined,
	sortable: readonly string[]
): { ok: true; order: OrderRule[] } | { ok: false; column: string } {
	const parsed = parseOrderParam(v)
	for (const rule of parsed) {
		if (!sortable.includes(rule.column)) return { ok: false, column: rule.column }
	}
	return { ok: true, order: parsed }
}
