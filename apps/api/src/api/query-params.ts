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

/**
 * Teto do `offset`. Não é sobre o tamanho do catálogo — é sobre o que `parseInt` aceita:
 * `?offset=99999999999999999999` vira `1e20`, e aí `1e20 + 49 === 1e20` em ponto flutuante.
 * O `range()` do postgrest-js calcula `limit = to - from + 1`, que nesse caso dá 1 em vez do
 * limite pedido — a janela sai errada E o envelope continua anunciando o `limit` original.
 * Depois o Postgres ainda rejeita o `OFFSET` bigint (22003), então o cliente leva um 500 por
 * um erro que é dele.
 */
export const MAX_OFFSET = 1_000_000

/** `offset` entre 0 e {@link MAX_OFFSET}. Valor inválido volta para a primeira página. */
export function clampOffset(raw: string | null | undefined, max = MAX_OFFSET) {
	return Math.min(Math.max(0, toInt(raw, 0)), max)
}

/**
 * Escapa os curingas do LIKE no valor vindo do cliente.
 *
 * O parâmetro é documentado como "contém", e "contém" não pode ter sintaxe escondida: sem
 * isso `?description_ilike=%` casa com o catálogo inteiro e `A_1` casa com `AB1`.
 *
 * Ressalva conhecida: o PostgREST troca `*` por `%` no valor ANTES de chegar ao SQL, e essa
 * troca não tem escape. `*` segue funcionando como curinga — o que dá para tornar literal é o
 * que o SQL interpreta, e é isso que esta função faz.
 */
export function escapeLikePattern(value: string) {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function commaListToArray(v: string) {
	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
}

/** Teto de valores numa lista separada por vírgula, e de regras no `order`. */
export const MAX_FILTER_VALUES = 100
export const MAX_ORDER_RULES = 3

/**
 * Lista separada por vírgula com teto de tamanho.
 *
 * `null` = parâmetro ausente (não filtra); `{ ok: false }` = lista longa demais, que numa rota
 * anônima é 400, não um 500 vindo de uma query string enorme montada no PostgREST.
 */
export function parseListFilter(raw: string | null | undefined, max = MAX_FILTER_VALUES): { ok: true; values: string[] } | { ok: false } | null {
	if (!raw) return null
	const values = commaListToArray(raw)
	if (values.length === 0) return null
	if (values.length > max) return { ok: false }
	return { ok: true, values }
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
	sortable: readonly string[],
	maxRules = MAX_ORDER_RULES
): { ok: true; order: OrderRule[] } | { ok: false; reason: "unknown-column" | "too-many-rules" } {
	const parsed = parseOrderParam(v)
	// Lista de ordenação sem teto numa rota anônima vira query string gigante no PostgREST, que
	// falha como 500 em vez de 400 e gasta um round trip de banco por requisição.
	if (parsed.length > maxRules) return { ok: false, reason: "too-many-rules" }
	for (const rule of parsed) {
		if (!sortable.includes(rule.column)) return { ok: false, reason: "unknown-column" }
	}
	return { ok: true, order: parsed }
}
